import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Atlas } from "../src/atlas.js";
import { AtlasDatabase } from "../src/db.js";
import type { ExecutionBackend, ModelProvider } from "../src/types.js";

class AdaModel implements ModelProvider {
  readonly name = "ada-fake";
  async generate(request: { system: string; input: string }): Promise<string> {
    assert.match(request.system, /single human-facing/);
    assert.match(request.input, /Laptop Manager/);
    assert.ok(request.input.length < 20_000, `ADA context was not bounded: ${request.input.length} characters`);
    const managerId = request.input.match(/"manager_id":"([^"]+)"/)?.[1] ?? "missing";
    return JSON.stringify({
      reply: "Your laptop is online. I recommend handing this task to its Manager.",
      reasoningSummary: "Matched operational intent to the only online environment.",
      updates: ["Reviewed live ATLAS state", "Prepared a governed handoff"],
      needsInput: false,
      handoff: {
        type: "manager",
        ownerId: managerId,
        title: "Send to Laptop Manager",
        prompt: "Inspect available disk space and return verified evidence."
      }
    });
  }
}

class LocalFake implements ExecutionBackend {
  readonly name = "local-fake";
  async inspect() { return { cpuCores: 4 }; }
  async execute() { return { code: 0, stdout: "ok", stderr: "" }; }
}

test("ADA receives live state and persists a user-facing conversation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-ada-"));
  await mkdir(path.join(root, "migrations"));
  for (const name of ["001_bootstrap.sql", "002_assistant_jobs.sql", "003_ada_conversations.sql"]) {
    await writeFile(path.join(root, "migrations", name), await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(process.cwd(), "migrations", name))));
  }
  await mkdir(path.join(root, "config"));
  await writeFile(path.join(root, "config", "roadmap.json"), JSON.stringify({ title: "Roadmap", milestones: [] }));
  await writeFile(path.join(root, "config", "ada.md"), await import("node:fs/promises").then((fs) =>
    fs.readFile(path.join(process.cwd(), "config", "ada.md"))));
  const previous = process.cwd();
  process.chdir(root);
  const db = new AtlasDatabase(path.join(root, "atlas.db"));
  process.chdir(previous);
  const atlas = new Atlas(db, new AdaModel(), new LocalFake(), root);
  const environment = await atlas.onboardEnvironment({ name: "Laptop", kind: "local" });
  const manager = db.get<any>("SELECT * FROM managers WHERE environment_id=?", environment.id)!;
  for (let index = 0; index < 24; index++) {
    db.run(
      "INSERT INTO agents(id,environment_id,manager_id,name,lifecycle,objective,status,permissions_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      `agent-${index}`, environment.id, manager.id, `Agent ${index}`, "persistent", "x".repeat(2_000), "ready", "{}", new Date().toISOString()
    );
  }
  for (let index = 0; index < 20; index++) {
    db.run(
      "INSERT INTO memories(id,scope_type,scope_id,kind,content,source,confidence,created_at) VALUES(?,?,?,?,?,?,?,?)",
      `memory-${index}`, "environment", environment.id, "episodic", "y".repeat(2_000), `test:${index}`, 0.8, new Date().toISOString()
    );
  }
  const queued = atlas.queueAdaChat("Can you check my disk space?");
  for (let attempt = 0; attempt < 50; attempt++) {
    const job = db.get<any>("SELECT * FROM assistant_jobs WHERE id=?", queued.id)!;
    if (job.status === "completed") {
      const result = JSON.parse(job.result_json);
      assert.equal(result.handoff.ownerId, manager.id);
      assert.equal(db.all("SELECT * FROM messages").length, 2);
      assert.equal(db.get<any>("SELECT kind FROM conversations")!.kind, "ada");
      db.close();
      return;
    }
    if (job.status === "failed") assert.fail(job.error);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("ADA job did not complete.");
});
