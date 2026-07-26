import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Atlas } from "./atlas.js";
import { AtlasDatabase } from "./db.js";
import { ConnectorService, type DeviceAuth } from "./connector.js";
import { createModelProvider, LocalExecutionBackend } from "./providers.js";
import { SettingsService } from "./settings.js";
import { safeError } from "./util.js";

const root = process.cwd();
const publicDir = path.join(root, "public");
const database = new AtlasDatabase();
export const settings = new SettingsService(database, root);
const initialSettings = (settings.state() as any).setting;
const initialModel = createModelProvider({ provider: initialSettings.provider, model: initialSettings.model, baseUrl: initialSettings.base_url, apiKey: settings.getSecret(initialSettings.secret_ref_id), timeoutMs: initialSettings.timeout_ms });
const execution = new LocalExecutionBackend();
export const atlas = new Atlas(database, initialModel, execution, root);
export const connector = new ConnectorService(database, root);

async function body(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON object required.");
  return value;
}

function deviceAuth(request: IncomingMessage): DeviceAuth {
  const encoded = request.headers["x-atlas-device-auth"];
  if (typeof encoded !== "string") throw new Error("Device authentication header is required.");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DeviceAuth;
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function api(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith("/api/")) return false;
  if (request.method === "POST" && url.pathname === "/api/connectors/enrollment") { send(response, 201, connector.createEnrollment(await body(request))); return true; }
  if (request.method === "POST" && url.pathname === "/api/connectors/enroll") { const input=await body(request); const result=connector.enroll(input); atlas.audit("environment",result.environmentId,"environment.enrolled","environment",result.environmentId,{deviceId:result.deviceId}); send(response, 201, result); return true; }
  if (request.method === "POST" && url.pathname === "/api/connectors/poll") { await body(request); send(response, 200, connector.poll(deviceAuth(request))); return true; }
  if (request.method === "POST" && url.pathname === "/api/connectors/telemetry") { const input=await body(request); send(response, 200, connector.telemetry(deviceAuth(request),input)); return true; }
  if (request.method === "POST" && url.pathname === "/api/connectors/commands") { const result=connector.queueCommand(await body(request)); atlas.audit("manager",null,"connector.command.queued","environment",result.environmentId,{commandId:result.id,type:result.type,capabilities:result.capabilities}); send(response, 202, result); return true; }
  const revokeMatch=url.pathname.match(/^\/api\/connectors\/environments\/([^/]+)\/revoke$/);
  if(request.method==="POST"&&revokeMatch?.[1]){const result=connector.revoke(revokeMatch[1]);atlas.audit("user",null,"environment.revoked","environment",revokeMatch[1],{});send(response,200,result);return true;}
  if (request.method === "GET" && url.pathname === "/api/connectors") { send(response, 200, connector.state()); return true; }
  if (request.method === "GET" && url.pathname === "/api/settings") { send(response, 200, settings.state()); return true; }
  if (request.method === "POST" && url.pathname === "/api/settings/provider") {
    const saved = settings.saveProvider(await body(request));
    atlas.model = createModelProvider({ provider: saved.provider, model: saved.model, baseUrl: saved.base_url, apiKey: settings.getSecret(saved.secret_ref_id), timeoutMs: saved.timeout_ms });
    atlas.audit("user", null, "settings.provider.updated", "settings", "default", { provider: saved.provider, model: saved.model });
    send(response, 200, saved); return true;
  }
  if (request.method === "POST" && url.pathname === "/api/settings/provider/test") {
    const selected = (settings.state() as any).setting;
    const provider = createModelProvider({ provider: selected.provider, model: selected.model, baseUrl: selected.base_url, apiKey: settings.getSecret(selected.secret_ref_id), timeoutMs: selected.timeout_ms });
    let result: unknown;
    if (provider.health) result = await provider.health();
    else { const output = await provider.generate({ system: "Return only READY.", input: "Connection test" }); result = { status: "online", model: provider.model, detail: output.slice(0, 80) }; }
    settings.markTested(selected.secret_ref_id); atlas.audit("user", null, "settings.provider.tested", "settings", "default", { provider: selected.provider, status: (result as any).status });
    send(response, 200, result); return true;
  }
  if (request.method === "POST" && url.pathname === "/api/settings/secrets") { const secret=settings.createSecret(await body(request)); atlas.audit("user",null,"secret.created","secret",secret.id,{provider:secret.provider,label:secret.label}); send(response,201,secret); return true; }
  const secretMatch=url.pathname.match(/^\/api\/settings\/secrets\/([^/]+)\/(rotate|revoke)$/);
  if(request.method==="POST"&&secretMatch?.[1]&&secretMatch[2]){const input=await body(request);const secret=secretMatch[2]==="rotate"?settings.rotateSecret(secretMatch[1],input.value):settings.revokeSecret(secretMatch[1]);atlas.audit("user",null,`secret.${secretMatch[2]}d`,"secret",secret.id,{provider:secret.provider,label:secret.label});send(response,200,secret);return true;}
  if(request.method==="POST"&&url.pathname==="/api/settings/diagnostics"){send(response,200,settings.diagnostics());return true;}
  if(request.method==="POST"&&url.pathname==="/api/settings/backups"){const backup=settings.createBackup();atlas.audit("user",null,"backup.created","backup",backup.id,{filename:backup.filename,status:backup.status});send(response,201,backup);return true;}
  const permissionMatch=url.pathname.match(/^\/api\/settings\/environments\/([^/]+)\/permissions$/);
  if(request.method==="POST"&&permissionMatch?.[1]){const permission=settings.saveEnvironmentPermissions(permissionMatch[1],await body(request));atlas.audit("user",null,"environment.permissions.updated","environment",permissionMatch[1],{tools:JSON.parse(permission.tools_json),filesystemScope:permission.filesystem_scope,networkEnabled:Boolean(permission.network_enabled)});send(response,200,permission);return true;}
  if (request.method === "GET" && url.pathname === "/api/health") {
    send(response, 200, { status: "ok", service: "atlas", time: new Date().toISOString() });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/providers/health") {
    const health = atlas.model.health
      ? await atlas.model.health()
      : { status: "online", model: atlas.model.model ?? atlas.model.name, detail: "Remote provider configured." };
    send(response, 200, health);
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/state") {
    send(response, 200, { ...atlas.state(), connector: connector.state() });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/environments") {
    send(response, 201, await atlas.onboardEnvironment(await body(request)));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/agents") {
    send(response, 201, atlas.createAgent(await body(request)));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/workflows") {
    send(response, 201, atlas.createWorkflow(await body(request)));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/runs/disk-space") {
    send(response, 202, await atlas.deployDiskSpace(await body(request)));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/runs") {
    send(response, 202, await atlas.deploy(await body(request)));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/ada/chat") {
    const input = await body(request);
    send(response, 202, atlas.queueAdaChat(input.message));
    return true;
  }
  const managerMatch = url.pathname.match(/^\/api\/managers\/([^/]+)\/chat$/);
  if (request.method === "POST" && managerMatch?.[1]) {
    const input = await body(request);
    send(response, 202, atlas.queueManagerChat(managerMatch[1], input.message));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/ada/coding-agent") {
    const input = await body(request);
    send(response, 202, atlas.queueAdaCodingAgent(input.message));
    return true;
  }
  const runControlMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/control$/);
  if (request.method === "POST" && runControlMatch?.[1]) {
    const input = await body(request);
    send(response, 200, atlas.controlRun(runControlMatch[1], input.action));
    return true;
  }
  const workflowControlMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/control$/);
  if (request.method === "POST" && workflowControlMatch?.[1]) {
    const input = await body(request);
    send(response, 200, atlas.controlWorkflow(workflowControlMatch[1], input.enabled === true));
    return true;
  }
  const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)$/);
  if (request.method === "POST" && approvalMatch?.[1]) {
    const input = await body(request);
    send(response, 200, await atlas.resolveApproval(approvalMatch[1], input.decision));
    return true;
  }
  send(response, 404, { error: "API route not found." });
  return true;
}

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (await api(request, response, url)) return;
    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.resolve(publicDir, requested);
    if (!file.startsWith(`${publicDir}${path.sep}`) && file !== path.join(publicDir, "index.html")) {
      send(response, 403, { error: "Forbidden" });
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(file)] ?? "application/octet-stream" });
    response.end(content);
  } catch (error) {
    const status = (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 400;
    send(response, status, { error: safeError(error) });
  }
}

export function start(
  port = Number(process.env.PORT ?? 4310),
  host = process.env.ATLAS_HOST ?? "127.0.0.1"
) {
  const server = createServer(handler);
  const interval = setInterval(() => { connector.tick(); void atlas.tick().catch((error) => console.error("Scheduler:", safeError(error))); }, 15_000);
  server.on("close", () => clearInterval(interval));
  server.listen(port, host, () => {
    const displayHost = host === "0.0.0.0" ? "your computer's local-network address" : host;
    console.log(`ATLAS is running at http://${displayHost}:${port}`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) start();
