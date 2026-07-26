import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AtlasDatabase } from "../src/db.js";
import { BrowserBridgeService } from "../src/browser-bridge.js";
import { ObservationService } from "../src/observation.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-observation-"));
  await mkdir(path.join(root, "migrations"));
  for (const name of ["001_bootstrap.sql", "007_m4_browser_bridge.sql", "009_m5_observation.sql"]) {
    await writeFile(path.join(root, "migrations", name), await readFile(path.join(process.cwd(), "migrations", name)));
  }
  const previous = process.cwd(); process.chdir(root);
  const db = new AtlasDatabase(path.join(root, "atlas.db")); process.chdir(previous);
  const stamp = new Date().toISOString();
  db.run("INSERT INTO environments(id,name,kind,status,capabilities_json,health_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", "env", "Teaching PC", "local", "online", "{}", "{}", stamp, stamp);
  db.run("INSERT INTO managers(id,environment_id,name,status,last_heartbeat,created_at) VALUES(?,?,?,?,?,?)", "mgr", "env", "Teaching Manager", "online", stamp, stamp);
  db.run("INSERT INTO browser_sessions(id,environment_id,manager_id,public_key,tab_ref,title,url,status,consented_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?)", "browser", "env", "mgr", "key", "1", "Approved tab", "https://example.com/task", "connected", stamp, stamp);
  const browser = new BrowserBridgeService(db);
  return { db, browser, observations: new ObservationService(db, browser) };
}

test("observation requires explicit tab-scoped consent", async () => {
  const { db, observations } = await fixture();
  assert.throws(() => observations.start({ browserSessionId: "browser", name: "Task", mode: "observation", consent: false }), /consent/i);
  db.close();
});

test("observed actions become an editable rehearsed workflow that requires approval", async () => {
  const { db, observations } = await fixture();
  const observation = observations.start({ browserSessionId: "browser", name: "Publish report", mode: "hybrid", instructions: "Verify before submit", consent: true }) as any;
  observations.ingest("browser", [{ id: "event-1", type: "recording.actions", occurredAt: new Date().toISOString(), payload: { actions: [
    { kind: "click", target: "#start", value: {}, url: "https://example.com/task" },
    { kind: "type", target: "input[name=token]", value: { token: "must-not-persist" }, url: "https://example.com/task" },
    { kind: "submit", target: "form", value: {}, url: "https://example.com/task" }
  ] } }]);
  observations.stop(observation.id);
  const stopCommand = db.get<any>("SELECT * FROM browser_commands WHERE action='stop_recording'")!;
  observations.handleBrowserResults([{ id: "stop-event", commandId: stopCommand.id, type: "command.completed", occurredAt: new Date().toISOString(), payload: {} }]);
  let state = observations.state() as any;
  assert.equal(state.drafts.length, 1);
  assert.match(state.actions[1].value_json, /REDACTED/);
  assert.doesNotMatch(state.actions[1].value_json, /must-not-persist/);
  const draft = state.drafts[0];
  observations.updateDraft(draft.id, { correction: "Wait for confirmation before submitting" });
  observations.rehearse(draft.id);
  const rehearsal = db.get<any>("SELECT * FROM workflow_rehearsals WHERE draft_id=?", draft.id)!;
  observations.handleBrowserResults([{ id: "rehearse-event", commandId: rehearsal.browser_command_id, type: "command.completed", occurredAt: new Date().toISOString(), payload: { deviations: [{ step: 2, type: "missing_target" }] } }]);
  assert.equal(db.get<any>("SELECT status FROM workflow_drafts WHERE id=?", draft.id)?.status, "rehearsed");
  assert.equal(db.get<any>("SELECT COUNT(*) count FROM workflows")?.count, 0);
  const approval = observations.requestApproval(draft.id);
  assert.equal(db.get<any>("SELECT COUNT(*) count FROM workflows")?.count, 0);
  observations.resolveApproval(approval, "approved");
  const workflow = db.get<any>("SELECT * FROM workflows")!;
  assert.equal(workflow.enabled, 0);
  assert.equal(db.get<any>("SELECT status FROM workflow_drafts WHERE id=?", draft.id)?.status, "approved");
  db.close();
});