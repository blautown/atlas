import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4311;
const child = spawn(process.execPath, ["--env-file-if-exists=.env.local", "dist/src/server.js"], {
  env: { ...process.env, PORT: String(port), ATLAS_DB_PATH: "data/smoke.db" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const health = await fetch(`http://127.0.0.1:${port}/api/state`);
      if (health.ok) break;
    } catch {}
    await delay(250);
  }
  const environmentResponse = await fetch(`http://127.0.0.1:${port}/api/environments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Smoke Desktop ${Date.now()}`, kind: "local" })
  });
  if (!environmentResponse.ok) throw new Error(await environmentResponse.text());
  const environment = await environmentResponse.json();
  const state = await fetch(`http://127.0.0.1:${port}/api/state`).then((response) => response.json());
  const managers = state.managers.filter((manager) => manager.environment_id === environment.id);
  if (managers.length !== 1) throw new Error(`Expected one manager, found ${managers.length}`);
  const diskResponse = await fetch(`http://127.0.0.1:${port}/api/runs/disk-space`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ environmentId: environment.id })
  });
  if (!diskResponse.ok) throw new Error(await diskResponse.text());
  const diskRun = await diskResponse.json();
  let completedState;
  for (let attempt = 0; attempt < 40; attempt++) {
    completedState = await fetch(`http://127.0.0.1:${port}/api/state`).then((response) => response.json());
    const current = completedState.runs.find((run) => run.id === diskRun.id);
    if (current?.status === "completed") break;
    if (current?.status === "failed") throw new Error(current.error);
    await delay(100);
  }
  const completedRun = completedState.runs.find((run) => run.id === diskRun.id);
  const agent = completedState.agents.find((item) => item.id === completedRun?.agent_id);
  const artifact = completedState.runArtifacts.find((item) => item.run_id === diskRun.id);
  if (completedRun?.status !== "completed") throw new Error("Disk-space run did not complete.");
  if (agent?.status !== "retired") throw new Error("Temporary disk agent was not retired.");
  if (JSON.parse(agent.permissions_json).tools?.[0] !== "system.disk.read") throw new Error("Disk agent permission scope was incorrect.");
  if (artifact?.verified !== 1 || !(artifact.content?.totalBytes > 0)) throw new Error("Verified disk evidence was not captured.");
  const settingsResponse = await fetch(`http://127.0.0.1:${port}/api/settings`);
  const settings = await settingsResponse.json();
  const serializedSettings = JSON.stringify(settings);
  if (!settingsResponse.ok || !settings.setting?.provider) throw new Error("Settings API unavailable.");
  if (serializedSettings.includes('"ciphertext"') || serializedSettings.includes('"auth_tag"')) throw new Error("Encrypted secret material leaked through settings API.");
  const diagnosticResponse = await fetch(`http://127.0.0.1:${port}/api/settings/diagnostics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const diagnostics = await diagnosticResponse.json();
  if (diagnostics.databaseIntegrity !== "ok") throw new Error("Database diagnostics failed.");
  const backupResponse = await fetch(`http://127.0.0.1:${port}/api/settings/backups`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const backup = await backupResponse.json();
  if (backup.status !== "verified") throw new Error("Dashboard backup was not verified.");
  console.log("Smoke test passed: M1 execution plus M2 settings, diagnostics, secret-safe API, and verified backup.");
} finally {
  child.kill();
}
