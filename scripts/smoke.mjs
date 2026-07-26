import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";

const port = 4311;
let runtimeChild;
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
  const enrollmentResponse = await fetch(`http://127.0.0.1:${port}/api/connectors/enrollment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Smoke Remote ${Date.now()}` }) });
  if (!enrollmentResponse.ok) throw new Error(await enrollmentResponse.text());
  const enrollment = await enrollmentResponse.json();
  const runtimeDir = await mkdtemp(path.join(tmpdir(), "atlas-runtime-smoke-"));
  runtimeChild = spawn(process.execPath, ["dist/src/runtime.js", "--server", `http://127.0.0.1:${port}`, "--token", enrollment.token, "--data", runtimeDir, "--interval", "100"], { stdio: "ignore", windowsHide: true });
  let connected;
  for (let attempt = 0; attempt < 30; attempt++) { const connectorState = await fetch(`http://127.0.0.1:${port}/api/connectors`).then((response) => response.json()); connected = connectorState.devices.find((device) => device.environment_id === enrollment.environmentId); if (connected) break; await delay(100); }
  if (!connected) throw new Error("Remote runtime did not enroll.");
  const commandResponse = await fetch(`http://127.0.0.1:${port}/api/connectors/commands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ environmentId: enrollment.environmentId, type: "inspect", capabilities: ["system.inspect"], ttlSeconds: 30 }) });
  if (!commandResponse.ok) throw new Error(await commandResponse.text()); const command = await commandResponse.json();
  let connectorEvent;
  for (let attempt = 0; attempt < 40; attempt++) { const connectorState = await fetch(`http://127.0.0.1:${port}/api/connectors`).then((response) => response.json()); connectorEvent = connectorState.events.find((event) => event.command_id === command.id); if (connectorEvent) break; await delay(100); }
  if (connectorEvent?.type !== "command.completed") throw new Error("Signed remote command did not complete.");
  const revokeResponse = await fetch(`http://127.0.0.1:${port}/api/connectors/environments/${enrollment.environmentId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!revokeResponse.ok || (await revokeResponse.json()).status !== "revoked") throw new Error("Remote runtime revocation failed.");
  const browserPairing = await fetch(`http://127.0.0.1:${port}/api/browser/pairings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ environmentId: environment.id }) }).then((response) => response.json());
  const browserKeys = generateKeyPairSync("ed25519"), browserPublic = browserKeys.publicKey.export({ type: "spki", format: "pem" }).toString(), browserPrivate = browserKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const browserSession = await fetch(`http://127.0.0.1:${port}/api/browser/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: browserPairing.token, publicKey: browserPublic, tabRef: "smoke-tab", title: "Approved smoke tab", url: "https://example.com/task" }) }).then((response) => response.json());
  const manager = state.managers.find((item) => item.environment_id === environment.id);
  const browserCommand = await fetch(`http://127.0.0.1:${port}/api/browser/commands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: browserSession.sessionId, managerId: manager.id, action: "inspect", args: {} }) }).then((response) => response.json());
  const browserAuth = (body) => { const timestamp = new Date().toISOString(), nonce = randomUUID(), digest = createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex"); return Buffer.from(JSON.stringify({ sessionId: browserSession.sessionId, timestamp, nonce, signature: sign(null, Buffer.from([browserSession.sessionId, timestamp, nonce, digest].join("\n")), browserPrivate).toString("base64url") })).toString("base64url"); };
  const browserPoll = await fetch(`http://127.0.0.1:${port}/api/browser/poll`, { method: "POST", headers: { "Content-Type": "application/json", "x-atlas-browser-auth": browserAuth({}) }, body: "{}" }).then((response) => response.json());
  if (browserPoll.commands[0]?.id !== browserCommand.id) throw new Error("Approved-tab browser command was not delivered.");
  const browserEvents = { events: [{ id: randomUUID(), commandId: browserCommand.id, type: "command.completed", payload: { password: "must-redact", title: "safe" }, occurredAt: new Date().toISOString() }] };
  await fetch(`http://127.0.0.1:${port}/api/browser/events`, { method: "POST", headers: { "Content-Type": "application/json", "x-atlas-browser-auth": browserAuth(browserEvents) }, body: JSON.stringify(browserEvents) });
  await fetch(`http://127.0.0.1:${port}/api/browser/sessions/${browserSession.sessionId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const browserState = await fetch(`http://127.0.0.1:${port}/api/browser`).then((response) => response.json());
  if (browserState.sessions.find((item) => item.id === browserSession.sessionId)?.status !== "revoked") throw new Error("Browser session revocation failed.");
  if (JSON.parse(browserState.events.find((item) => item.command_id === browserCommand.id).payload_json).password !== "[REDACTED]") throw new Error("Browser event redaction failed.");
  console.log("Smoke test passed: M1 execution, M2 settings, M3 remote runtime, and M4 approved-tab browser isolation and revocation.");
} finally {
  runtimeChild?.kill();
  child.kill();
}
