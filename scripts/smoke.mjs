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
  console.log("Smoke test passed: dashboard API, environment onboarding, and unique Manager assignment.");
} finally {
  child.kill();
}
