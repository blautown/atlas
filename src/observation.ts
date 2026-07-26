import type { AtlasDatabase } from "./db.js";
import { BrowserBridgeService } from "./browser-bridge.js";
import { id, json, now, parseJson } from "./util.js";

type Row = Record<string, any>;

function redact(value: any): any {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      /password|cookie|clipboard|authorization|secret|token|card|cvv/i.test(key) ? "[REDACTED]" : redact(child)
    ]));
  }
  return value;
}

export class ObservationService {
  constructor(private readonly db: AtlasDatabase, private readonly browser: BrowserBridgeService) {}

  start(input: { browserSessionId: string; name: string; mode: "observation" | "hybrid"; instructions?: string; consent: boolean }) {
    if (input.consent !== true) throw new Error("Explicit recording consent is required.");
    if (!["observation", "hybrid"].includes(input.mode)) throw new Error("Learning mode must be observation or hybrid.");
    const session = this.db.get<Row>("SELECT * FROM browser_sessions WHERE id=? AND status='connected'", input.browserSessionId);
    if (!session) throw new Error("A connected approved browser tab is required.");
    if (this.db.get("SELECT 1 FROM observation_sessions WHERE browser_session_id=? AND status='recording'", session.id)) {
      throw new Error("This tab is already being recorded.");
    }
    const observationId = id("observe");
    const scope = {
      browserSessionId: session.id,
      tabRef: session.tab_ref,
      title: session.title,
      url: session.url,
      excludes: ["password values", "cookies", "clipboard contents", "notifications", "unrelated tabs and windows"]
    };
    this.db.run(
      "INSERT INTO observation_sessions(id,browser_session_id,environment_id,manager_id,name,mode,instructions,scope_json,status,started_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      observationId, session.id, session.environment_id, session.manager_id, String(input.name).slice(0, 160),
      input.mode, input.instructions ?? null, json(scope), "recording", now()
    );
    this.browser.queue({ sessionId: session.id, managerId: session.manager_id, action: "start_recording", args: { observationId } });
    this.audit(session.manager_id, "observation.started", observationId, { scope });
    return this.get(observationId);
  }

  ingest(browserSessionId: string, events: any[]): void {
    const observation = this.db.get<Row>(
      "SELECT * FROM observation_sessions WHERE browser_session_id=? AND status IN ('recording','analyzing')", browserSessionId
    );
    if (!observation) return;
    let sequence = this.db.get<Row>(
      "SELECT COALESCE(MAX(sequence),0)+1 next FROM observation_actions WHERE observation_id=?", observation.id
    )?.next ?? 1;
    for (const event of events) {
      if (event.type !== "recording.actions") continue;
      for (let index = 0; index < (event.payload?.actions ?? []).length; index++) {
        const action = redact(event.payload.actions[index]);
        try {
          this.db.run(
            "INSERT INTO observation_actions(id,observation_id,event_id,sequence,kind,target,value_json,url,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)",
            id("obs_action"), observation.id, event.id, sequence++, String(action.kind ?? "state"), action.target ?? null,
            json(action.value ?? {}), action.url ?? null, action.occurredAt ?? event.occurredAt
          );
        } catch {}
      }
    }
  }

  stop(observationId: string) {
    const observation = this.db.get<Row>("SELECT * FROM observation_sessions WHERE id=? AND status='recording'", observationId);
    if (!observation) throw new Error("Active observation not found.");
    this.browser.queue({
      sessionId: observation.browser_session_id,
      managerId: observation.manager_id,
      action: "stop_recording",
      args: { observationId }
    });
    this.db.run("UPDATE observation_sessions SET status='analyzing',stopped_at=? WHERE id=?", now(), observationId);
    return this.get(observationId);
  }

  private finalize(observationId: string) {
    const observation = this.db.get<Row>("SELECT * FROM observation_sessions WHERE id=? AND status='analyzing'", observationId);
    if (!observation) return;
    const actions = this.db.all<Row>("SELECT * FROM observation_actions WHERE observation_id=? ORDER BY sequence", observationId);
    if (!actions.length) {
      this.db.run("UPDATE observation_sessions SET status='recording',stopped_at=NULL WHERE id=?", observationId);
      throw new Error("No observable actions were recorded yet.");
    }
    const nodes = actions.map((action, index) => ({
      id: `step_${index + 1}`,
      kind: action.kind,
      target: action.target,
      value: parseJson(action.value_json),
      url: action.url,
      next: index < actions.length - 1 ? `step_${index + 2}` : null,
      onError: { action: "pause_and_escalate", retryLimit: 1 }
    }));
    const domains = [...new Set(actions.map((action) => {
      try { return new URL(action.url).origin; } catch { return null; }
    }).filter(Boolean))];
    const sensitive = actions.some((action) => action.value_json.includes("[REDACTED]"));
    const requirements = {
      assets: domains.map((domain) => ({ type: "website", value: domain })),
      accounts: sensitive ? [{ type: "authenticated_session", source: "user-provided browser session" }] : [],
      secrets: sensitive ? [{ type: "secret_reference", value: "required but never recorded" }] : [],
      tools: [...new Set(nodes.map((node) => `browser.${node.kind}`))],
      capabilities: ["approved_tab_only"],
      permissions: ["tab observation", "Manager browser control", "HITL for sensitive or consequential steps"]
    };
    const draftId = id("draft");
    const timestamp = now();
    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO workflow_drafts(id,observation_id,name,graph_json,requirements_json,corrections_json,status,created_at,updated_at) VALUES(?,?,?,?,?,'[]','draft',?,?)",
        draftId, observationId, observation.name,
        json({ version: 1, mode: observation.mode, instructions: observation.instructions, nodes }),
        json(requirements), timestamp, timestamp
      );
      this.db.run("UPDATE observation_sessions SET status='review',stopped_at=? WHERE id=?", timestamp, observationId);
    });
    this.audit(observation.manager_id, "workflow.draft.created", draftId, { actions: actions.length });
    return this.get(observationId);
  }

  updateDraft(draftId: string, input: { name?: string; graph?: unknown; requirements?: unknown; correction?: string }) {
    const draft = this.draft(draftId);
    if (!["draft", "rehearsed"].includes(draft.status)) throw new Error("Workflow draft is not editable in its current state.");
    const corrections = parseJson<any[]>(draft.corrections_json);
    if (input.correction) corrections.push({ text: String(input.correction).slice(0, 1_000), at: now() });
    this.db.run(
      "UPDATE workflow_drafts SET name=?,graph_json=?,requirements_json=?,corrections_json=?,status='draft',updated_at=? WHERE id=?",
      input.name ?? draft.name, input.graph ? json(redact(input.graph)) : draft.graph_json,
      input.requirements ? json(redact(input.requirements)) : draft.requirements_json,
      json(corrections), now(), draftId
    );
    return this.draft(draftId);
  }

  rehearse(draftId: string) {
    const draft = this.draft(draftId);
    if (!["draft", "rehearsed"].includes(draft.status)) throw new Error("Draft is not ready for rehearsal.");
    const observation = this.db.get<Row>("SELECT * FROM observation_sessions WHERE id=?", draft.observation_id)!;
    const command = this.browser.queue({
      sessionId: observation.browser_session_id,
      managerId: observation.manager_id,
      action: "rehearse",
      args: { nodes: parseJson<any>(draft.graph_json).nodes }
    });
    const rehearsalId = id("rehearsal");
    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO workflow_rehearsals(id,draft_id,browser_command_id,status,started_at) VALUES(?,?,?,'running',?)",
        rehearsalId, draftId, command.id, now()
      );
      this.db.run("UPDATE workflow_drafts SET status='rehearsing',updated_at=? WHERE id=?", now(), draftId);
    });
    return this.get(observation.id);
  }

  handleBrowserResults(events: any[]): void {
    for (const event of events) {
      if (!event.commandId || !["command.completed", "command.failed"].includes(event.type)) continue;
      const command = this.db.get<Row>("SELECT * FROM browser_commands WHERE id=?", event.commandId);
      if (command?.action === "stop_recording" && event.type === "command.completed") {
        const args = parseJson<any>(command.args_json);
        this.finalize(args.observationId);
        continue;
      }
      const rehearsal = this.db.get<Row>(
        "SELECT * FROM workflow_rehearsals WHERE browser_command_id=? AND status='running'", event.commandId
      );
      if (!rehearsal) continue;
      const deviations = redact(event.payload?.deviations ?? (
        event.type === "command.failed" ? [{ type: "rehearsal_error", detail: event.payload?.error }] : []
      ));
      this.db.transaction(() => {
        this.db.run(
          "UPDATE workflow_rehearsals SET status=?,deviations_json=?,completed_at=? WHERE id=?",
          event.type === "command.failed" ? "failed" : "completed", json(deviations), now(), rehearsal.id
        );
        this.db.run("UPDATE workflow_drafts SET status='rehearsed',updated_at=? WHERE id=?", now(), rehearsal.draft_id);
      });
    }
  }

  requestApproval(draftId: string) {
    const draft = this.draft(draftId);
    const rehearsal = this.db.get<Row>(
      "SELECT * FROM workflow_rehearsals WHERE draft_id=? ORDER BY started_at DESC LIMIT 1", draftId
    );
    if (draft.status !== "rehearsed" || rehearsal?.status !== "completed") {
      throw new Error("A completed rehearsal is required before autonomy approval.");
    }
    const approvalId = id("approval");
    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO approvals(id,kind,title,detail_json,status,requested_at) VALUES(?,?,?,?,?,?)",
        approvalId, "workflow_autonomy", `Approve learned workflow: ${draft.name}`,
        json({ draftId, deviations: parseJson(rehearsal.deviations_json) }), "pending", now()
      );
      this.db.run("UPDATE workflow_drafts SET status='approval_pending',updated_at=? WHERE id=?", now(), draftId);
    });
    return this.db.get<Row>("SELECT * FROM approvals WHERE id=?", approvalId)!;
  }

  resolveApproval(approval: Row, decision: string): void {
    if (approval.kind !== "workflow_autonomy") return;
    const detail = parseJson<any>(approval.detail_json);
    const draft = this.draft(detail.draftId);
    if (decision !== "approved") {
      this.db.run("UPDATE workflow_drafts SET status='rehearsed',updated_at=? WHERE id=?", now(), draft.id);
      return;
    }
    const observation = this.db.get<Row>("SELECT * FROM observation_sessions WHERE id=?", draft.observation_id)!;
    const workflowId = id("wf");
    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO workflows(id,environment_id,manager_id,name,instruction,learning_mode,trigger_type,verification,enabled,created_at) VALUES(?,?,?,?,?,'observation','manual',?,0,?)",
        workflowId, observation.environment_id, observation.manager_id, draft.name,
        `Execute approved learned graph ${draft.id}`,
        "Rehearsal deviations resolved and Manager verifies each step", now()
      );
      this.db.run(
        "UPDATE workflow_drafts SET status='approved',workflow_id=?,approved_at=?,updated_at=? WHERE id=?",
        workflowId, now(), now(), draft.id
      );
      this.db.run("UPDATE observation_sessions SET status='approved' WHERE id=?", observation.id);
    });
  }

  state() {
    return {
      observations: this.db.all("SELECT * FROM observation_sessions ORDER BY started_at DESC"),
      drafts: this.db.all("SELECT * FROM workflow_drafts ORDER BY created_at DESC"),
      rehearsals: this.db.all("SELECT * FROM workflow_rehearsals ORDER BY started_at DESC"),
      actions: this.db.all("SELECT * FROM observation_actions ORDER BY occurred_at DESC LIMIT 200")
    };
  }

  get(observationId: string) {
    const observation = this.db.get<Row>("SELECT * FROM observation_sessions WHERE id=?", observationId);
    if (!observation) throw new Error("Observation not found.");
    return {
      ...observation,
      scope: parseJson(observation.scope_json),
      actions: this.db.all("SELECT * FROM observation_actions WHERE observation_id=? ORDER BY sequence", observationId),
      draft: this.db.get<Row>("SELECT * FROM workflow_drafts WHERE observation_id=?", observationId) ?? null,
      rehearsals: this.db.all(
        "SELECT r.* FROM workflow_rehearsals r JOIN workflow_drafts d ON d.id=r.draft_id WHERE d.observation_id=? ORDER BY r.started_at DESC",
        observationId
      )
    };
  }

  private draft(draftId: string): Row {
    const draft = this.db.get<Row>("SELECT * FROM workflow_drafts WHERE id=?", draftId);
    if (!draft) throw new Error("Workflow draft not found.");
    return draft;
  }

  private audit(managerId: string, action: string, entityId: string, detail: unknown): void {
    this.db.run(
      "INSERT INTO audit_events(actor_type,actor_id,action,entity_type,entity_id,detail_json,created_at) VALUES('manager',?,?,'observation',?,?,?)",
      managerId, action, entityId, json(redact(detail)), now()
    );
  }
}
