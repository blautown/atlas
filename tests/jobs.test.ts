import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Atlas } from "../src/atlas.js";
import { AtlasDatabase } from "../src/db.js";
import type { ExecutionBackend, ModelProvider } from "../src/types.js";

class ConversationalModel implements ModelProvider {
  readonly name = "conversational-fake";
  async generate(request: { system: string }): Promise<string> {
    if (request.system.includes("Development Assistant")) {
      return JSON.stringify({
        reply: "Repository review complete.",
        reasoningSummary: "Compared the request with the roadmap and repository inventory.",
        updates: ["Loaded roadmap", "Inspected repository structure"],
        needsInput: false,
        actions: []
      });
    }
    return JSON.stringify({
      reply: "Manager review complete.",
      reasoningSummary: "Matched the request against environment capacity.",
      updates: ["Checked environment", "Prepared response"],
      needsInput: false,
      workflow: null
    });
  }
}

class LocalFake implements ExecutionBackend {
  readonly name = "local-fake";
  async inspect() { return { cpuCores: 4 }; }
  async execute() { return { code: 0, stdout: "ok", stderr: "" }; }
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "atlas-jobs-"));
  await mkdir(path.join(root, "migrations"));
  for (const name of ["001_bootstrap.sql", "002_assistant_jobs.sql"]) {
    await writeFile(
      path.join(root, "migrations", name),
      await import("node:fs/promises").then((fs) => fs.readFile(path.join(process.cwd(), "migrations", name)))
    );
  }
  await mkdir(path.join(root, "config"));
  await writeFile(path.join(root, "config", "roadmap.json"), JSON.stringify({ title: "Roadmap", milestones: [] }));
  const previous = process.cwd();
  process.chdir(root);
  const db = new AtlasDatabase(path.join(root, "atlas.db"));
  process.chdir(previous);
  return { db, atlas: new Atlas(db, new ConversationalModel(), new LocalFake(), root) };
}

async function waitForTerminal(db: AtlasDatabase, jobId: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const job = db.get<any>("SELECT * FROM assistant_jobs WHERE id=?", jobId);
    if (["completed", "failed", "needs_input", "waiting_approval"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Job did not reach a terminal state.");
}

test("development jobs persist progress, chat, and reasoning summary", async () => {
  const { db, atlas } = await fixture();
  const queued = atlas.queueDevelopmentChat("Review milestone M1");
  const job = await waitForTerminal(db, queued.id);
  assert.equal(job.status, "completed");
  assert.equal(job.progress, 100);
  const result = JSON.parse(job.result_json);
  assert.match(result.reasoningSummary, /roadmap/);
  assert.equal(db.all("SELECT * FROM messages").length, 2);
  db.close();
});

test("manager jobs persist conversational lifecycle", async () => {
  const { db, atlas } = await fixture();
  const environment = await atlas.onboardEnvironment({ name: "Test", kind: "local" });
  const manager = db.get<any>("SELECT * FROM managers WHERE environment_id=?", environment.id);
  const queued = atlas.queueManagerChat(manager.id, "What is your status?");
  const job = await waitForTerminal(db, queued.id);
  assert.equal(job.status, "completed");
  assert.equal(JSON.parse(job.result_json).needsInput, false);
  db.close();
});
