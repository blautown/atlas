import { rm } from "node:fs/promises";
import { Atlas } from "../dist/src/atlas.js";
import { AtlasDatabase } from "../dist/src/db.js";
import { LocalExecutionBackend, ResponsesApiProvider } from "../dist/src/providers.js";

const file = "data/live-smoke.db";
await rm(file, { force: true });
const db = new AtlasDatabase(file);
try {
  const atlas = new Atlas(db, new ResponsesApiProvider(
    "openai",
    process.env.OPENAI_API_KEY,
    process.env.ATLAS_MODEL ?? "gpt-5.6-sol",
    process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  ), new LocalExecutionBackend());
  const environment = await atlas.onboardEnvironment({ name: "Live Model Smoke", kind: "local" });
  const manager = db.get("SELECT * FROM managers WHERE environment_id=?", environment.id);
  const result = await atlas.managerChat(manager.id, "Define a manual instruction-based workflow named Health Summary. It should use one temporary agent to summarize environment health and verify that a status and timestamp are present.");
  if (!result.workflow) throw new Error("Manager did not create a workflow.");
  console.log("Live model smoke passed: Manager interpreted intent and persisted a workflow.");
} finally {
  db.close();
}
