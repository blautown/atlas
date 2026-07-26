import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Atlas } from "../src/atlas.js";
import { AtlasDatabase } from "../src/db.js";
import type { ExecutionBackend, ModelProvider } from "../src/types.js";

class FakeModel implements ModelProvider {
  readonly name = "fake";
  async generate(request: { jsonSchema?: Record<string, unknown> }): Promise<string> {
    if (request.jsonSchema) {
      return JSON.stringify({
        reply: "Workflow prepared.",
        workflow: {
          name: "Daily review",
          instruction: "Review the queue",
          learningMode: "instruction",
          triggerType: "manual",
          triggerValue: null,
          verification: "Return a count",
          agents: [{ name: "Queue worker", objective: "Review queue", lifecycle: "persistent" }]
        }
      });
    }
    return "Verified result";
  }
}

class FakeExecution implements ExecutionBackend {
  readonly name = "fake";
  async inspect() { return { cpuCores: 8, freeMemoryBytes: 10_000 }; }
  async execute() { return { code: 0, stdout: "ok", stderr: "" }; }
}

async function fixture(tools?: any) {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-test-"));
  await mkdir(path.join(root, "migrations"));
  for (const name of ["001_bootstrap.sql", "004_m1_execution.sql"]) {
    await writeFile(path.join(root, "migrations", name), await import("node:fs/promises").then((fs) => fs.readFile(path.join(process.cwd(), "migrations", name))));
  }
  const previous = process.cwd();
  process.chdir(root);
  const db = new AtlasDatabase(path.join(root, "atlas.db"));
  process.chdir(previous);
  return { root, db, atlas: new Atlas(db, new FakeModel(), new FakeExecution(), root, tools) };
}

test("onboarding assigns exactly one manager", async () => {
  const { db, atlas } = await fixture();
  const environment = await atlas.onboardEnvironment({ name: "Test Desktop", kind: "local" });
  assert.equal(db.all("SELECT * FROM managers WHERE environment_id=?", environment.id).length, 1);
  assert.throws(() => db.run(
    "INSERT INTO managers(id,environment_id,name,status,last_heartbeat,created_at) VALUES(?,?,?,?,?,?)",
    "duplicate", environment.id, "Duplicate", "online", new Date().toISOString(), new Date().toISOString()
  ));
  db.close();
});

test("manager learns workflow and owns agents", async () => {
  const { db, atlas } = await fixture();
  await atlas.onboardEnvironment({ name: "Test Desktop", kind: "local" });
  const manager = db.get<any>("SELECT * FROM managers")!;
  const result = await atlas.managerChat(manager.id, "Create a daily review workflow");
  assert.ok(result.workflow);
  assert.equal(db.all<any>("SELECT * FROM agents")[0]?.manager_id, manager.id);
  db.close();
});

test("temporary agent retires after verified execution", async () => {
  const { db, atlas } = await fixture();
  const environment = await atlas.onboardEnvironment({ name: "Test Desktop", kind: "local" });
  const run = await atlas.deploy({ environmentId: environment.id, objective: "Complete task" });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(db.get<any>("SELECT status FROM runs WHERE id=?", run.id)?.status, "completed");
  assert.equal(db.get<any>("SELECT status FROM agents WHERE id=(SELECT agent_id FROM runs WHERE id=?)", run.id)?.status, "retired");
  db.close();
});


test("disk-space workflow uses scoped broker evidence and retires its temporary agent", async () => {
  const { db, atlas } = await fixture();
  const environment = await atlas.onboardEnvironment({ name: "Test Desktop", kind: "local" });
  const run = await atlas.deployDiskSpace({ environmentId: environment.id });
  for (let attempt = 0; attempt < 50; attempt++) {
    const current = db.get<any>("SELECT * FROM runs WHERE id=?", run.id)!;
    if (["completed", "failed"].includes(current.status)) {
      assert.equal(current.status, "completed", current.error);
      assert.match(current.result, /Verified from ATLAS system.disk_space evidence/);
      const agent = db.get<any>("SELECT * FROM agents WHERE id=?", current.agent_id)!;
      assert.equal(agent.status, "retired");
      assert.deepEqual(JSON.parse(agent.permissions_json).tools, ["system.disk.read"]);
      assert.equal(db.get<any>("SELECT verified FROM run_artifacts WHERE run_id=?", run.id)?.verified, 1);
      assert.equal(JSON.parse(db.get<any>("SELECT verification_json FROM run_controls WHERE run_id=?", run.id)!.verification_json).verified, true);
      db.close();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Disk-space run did not reach a terminal state.");
});


test("run controls pause, resume, cancel, and bound retries", async () => {
  let calls = 0;
  const tools = {
    async invoke() {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { filesystem: "C:\\", totalBytes: 1000, availableBytes: 400, usedBytes: 600, usedPercent: 60, measuredAt: new Date().toISOString() };
    }
  };
  const { db, atlas } = await fixture(tools);
  const environment = await atlas.onboardEnvironment({ name: "Controlled Desktop", kind: "local" });
  const pausedRun = await atlas.deployDiskSpace({ environmentId: environment.id });
  atlas.controlRun(pausedRun.id, "pause");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(db.get<any>("SELECT status FROM runs WHERE id=?", pausedRun.id)?.status, "paused");
  atlas.controlRun(pausedRun.id, "resume");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(db.get<any>("SELECT status FROM runs WHERE id=?", pausedRun.id)?.status, "completed");

  const cancelledRun = await atlas.deployDiskSpace({ environmentId: environment.id });
  atlas.controlRun(cancelledRun.id, "cancel");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(db.get<any>("SELECT status FROM runs WHERE id=?", cancelledRun.id)?.status, "cancelled");
  assert.equal(db.get<any>("SELECT status FROM agents WHERE id=(SELECT agent_id FROM runs WHERE id=?)", cancelledRun.id)?.status, "retired");
  atlas.controlRun(cancelledRun.id, "retry");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(db.get<any>("SELECT status FROM runs WHERE id=?", cancelledRun.id)?.status, "completed");
  assert.throws(() => atlas.controlRun(cancelledRun.id, "retry"));
  assert.ok(calls >= 3);
  db.close();
});

test("workflow can be disabled and enabled without deletion", async () => {
  const { db, atlas } = await fixture();
  const environment = await atlas.onboardEnvironment({ name: "Workflow Desktop", kind: "local" });
  const workflow = atlas.createWorkflow({ environmentId: environment.id, name: "Check", instruction: "Check", learningMode: "instruction", triggerType: "manual", verification: "Done" });
  assert.equal(atlas.controlWorkflow(workflow.id, false).enabled, 0);
  assert.equal(atlas.controlWorkflow(workflow.id, true).enabled, 1);
  db.close();
});
