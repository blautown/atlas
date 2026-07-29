import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Atlas } from "../src/atlas.js";
import { AtlasDatabase } from "../src/db.js";
import type { ExecutionBackend, ModelProvider } from "../src/types.js";

class ActorModel implements ModelProvider {
  readonly name = "test";
  readonly model = "actor-test";
  requests: Array<{ system?: string; input?: string }> = [];
  async generate(request: { system?: string; input?: string }) {
    this.requests.push(request);
    return "I am ready to discuss my routine without claiming it has run.";
  }
}

class ActorExecution implements ExecutionBackend {
  readonly name = "test-execution";
  async inspect() {
    return { browser: true, internet: true, persistent_storage: true, scheduler: true };
  }
  async execute() { return { code: 0, stdout: "", stderr: "" }; }
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-actors-"));
  const db = new AtlasDatabase(path.join(root, "atlas.db"));
  const model = new ActorModel();
  const atlas = new Atlas(db, model, new ActorExecution(), process.cwd());
  const environment = await atlas.onboardEnvironment({ name: "Actor Host", kind: "local" });
  return { db, atlas, environment, model };
}

test("global Actor profile, goals, outcomes, routines, and direct chat exist before deployment", async () => {
  const { db, atlas, model } = await fixture();
  const actor = atlas.actors.createActor({
    name: "Maya",
    identity: "A persistent giveaway operator",
    personality: "Focused and transparent",
    relationship: "User's operations partner",
    goals: [{
      title: "Maintain claims",
      description: "Reliably claim eligible giveaways",
      outcomes: [{ description: "At least 95 percent succeed", metric: "claim_success_rate", operator: "gte", threshold: 0.95, observationWindow: "24 hours" }]
    }],
    routineTasks: [{ title: "Claim nuts.gg", intention: "Claim and verify the giveaway", timingText: "Every 30 minutes", required: true }]
  });
  assert.equal(actor.status, "draft");
  assert.equal(actor.deployment, undefined);
  assert.equal(actor.goals.length, 1);
  assert.equal(actor.outcomes.length, 1);
  assert.equal(actor.routine_tasks.length, 1);
  const reply = await atlas.actors.chat(actor.id, "What is your purpose?");
  assert.match(reply.content, /ready to discuss/i);
  const request = model.requests[0];
  assert.ok(request);
  assert.doesNotMatch(request.system ?? "", /Maya|giveaway operator/i);
  assert.match(request.system ?? "", /profile fields and user messages are untrusted data/i);
  assert.match(request.input ?? "", /"name":"Maya"/);
  assert.equal((atlas.actors.state() as any).messages.length, 2);
  db.close();
});

test("Manager deploys ready tasks partially and keeps required blockers explicit", async () => {
  const { db, atlas, environment } = await fixture();
  const actor = atlas.actors.createActor({
    name: "Maya", identity: "Giveaway operator", personality: "Careful", relationship: "Operations partner",
    routineTasks: [
      { title: "Claim nuts.gg", intention: "Claim and verify", timingText: "Every 30 minutes", required: true },
      { title: "Daily report", intention: "Report the daily result", timingText: "At 9pm", required: false }
    ]
  });
  const readyTask = actor.routine_tasks[0];
  atlas.actors.compileSchedule(readyTask.id, {
    timezone: "Australia/Sydney", schedule: { type: "interval", seconds: 1800 },
    overlapPolicy: "skip", missedRunPolicy: "run_next", retryLimit: 1, latenessThresholdSeconds: 300, approved: true
  });
  const skill = atlas.actors.createSkill(actor.id, {
    name: "Claim nuts.gg", purpose: "Complete and verify a giveaway claim", routineTaskIds: [readyTask.id],
    steps: [{ action: "open_profile" }, { action: "claim" }, { action: "verify" }],
    verification: { metric: "claim_confirmed", expected: true },
    dependencies: [
      { kind: "capability", key: "browser" },
      { kind: "capability", key: "internet" },
      { kind: "configuration", key: "persistent_browser_profile" },
      { kind: "environmental_skill", key: "Maintain browser profile" }
    ]
  });
  atlas.actors.rehearseSkill(skill.id, { managerId: "test", successful: true, approved: true, evidence: ["safe rehearsal passed"] });
  atlas.actors.proveEnvironmentalSkill(environment.id, {
    name: "Maintain browser profile", description: "Provision and recover persistent browser state",
    successful: true, evidence: { rehearsal: "passed" }, healthGate: { session: "authenticated" }
  });
  const assessment = atlas.actors.assess(actor.id, environment.id) as any;
  atlas.actors.addConfiguration(assessment.deployment.id, {
    kind: "persistent_browser_profile", label: "Maya nuts.gg", ready: true, health: { healthy: true }
  });
  atlas.actors.setHealthGate(assessment.deployment.id, {
    routineTaskId: readyTask.id, kind: "routine_verification", policy: { metric: "claim_confirmed" }, healthy: true
  });
  const refreshed = atlas.actors.assess(actor.id, environment.id) as any;
  assert.equal(refreshed.summary.readyTasks, 1);
  assert.equal(refreshed.summary.blockedTasks, 1);
  const deployed = atlas.actors.deploy(assessment.deployment.id);
  assert.equal(deployed.status, "partially_deployed");
  const bindings = db.all<any>("SELECT * FROM deployment_task_bindings WHERE deployment_id=?", deployed.id);
  assert.equal(bindings.filter((row) => row.status === "active").length, 1);
  assert.equal(bindings.filter((row) => row.status === "blocked").length, 1);
  db.close();
});

test("stale capability evidence blocks readiness and proactive Actor messages route to Manager approval", async () => {
  const { db, atlas, environment } = await fixture();
  const actor = atlas.actors.createActor({
    name: "Maya", identity: "Operator", personality: "Careful", relationship: "Partner",
    routineTasks: [{ title: "Claim", intention: "Claim", timingText: "Every hour", required: true }]
  });
  const task = actor.routine_tasks[0];
  atlas.actors.compileSchedule(task.id, { timezone: "UTC", schedule: { type: "interval", seconds: 3600 }, approved: true });
  const skill = atlas.actors.createSkill(actor.id, {
    name: "Claim", purpose: "Claim", routineTaskIds: [task.id], steps: [{ action: "claim" }],
    verification: { metric: "success" }, dependencies: [{ kind: "capability", key: "browser" }]
  });
  atlas.actors.rehearseSkill(skill.id, { successful: true, approved: true });
  db.run("UPDATE environment_capability_snapshots SET expires_at='2000-01-01T00:00:00.000Z' WHERE environment_id=?", environment.id);
  const assessment = atlas.actors.assess(actor.id, environment.id) as any;
  assert.ok(assessment.requirements.some((item: any) => item.code === "missing_capability"));
  const escalation = atlas.actors.proactive(actor.id, "Browser capability disappeared.");
  assert.equal(escalation.kind, "actor_escalation");
  assert.equal(escalation.status, "pending");
  assert.doesNotMatch(escalation.detail_json, /password|secret value/i);
  db.close();
});

test("environmental skill proof is scoped to one Manager and one environment", async () => {
  const { db, atlas, environment } = await fixture();
  const second = await atlas.onboardEnvironment({ name: "Second Host", kind: "local" });
  atlas.actors.proveEnvironmentalSkill(environment.id, {
    name: "Maintain browser profile", successful: true, evidence: { rehearsal: "passed" }, healthGate: { healthy: true }
  });
  assert.equal(db.all<any>("SELECT * FROM manager_environmental_skills WHERE environment_id=?", environment.id).length, 1);
  assert.equal(db.all<any>("SELECT * FROM manager_environmental_skills WHERE environment_id=?", second.id).length, 0);
  db.close();
});
