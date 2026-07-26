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

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-test-"));
  await mkdir(path.join(root, "migrations"));
  await writeFile(path.join(root, "migrations", "001.sql"), await import("node:fs/promises").then((fs) => fs.readFile(path.join(process.cwd(), "migrations", "001_bootstrap.sql"))));
  const previous = process.cwd();
  process.chdir(root);
  const db = new AtlasDatabase(path.join(root, "atlas.db"));
  process.chdir(previous);
  return { root, db, atlas: new Atlas(db, new FakeModel(), new FakeExecution(), root) };
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
