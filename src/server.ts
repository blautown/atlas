import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Atlas } from "./atlas.js";
import { AtlasDatabase } from "./db.js";
import { createProviders } from "./providers.js";
import { safeError } from "./util.js";

const root = process.cwd();
const publicDir = path.join(root, "public");
const providers = createProviders();
export const atlas = new Atlas(new AtlasDatabase(), providers.model, providers.execution, root);

async function body(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON object required.");
  return value;
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function api(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith("/api/")) return false;
  if (request.method === "GET" && url.pathname === "/api/health") {
    send(response, 200, { status: "ok", service: "atlas", time: new Date().toISOString() });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/state") {
    send(response, 200, atlas.state());
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
  const interval = setInterval(() => void atlas.tick().catch((error) => console.error("Scheduler:", safeError(error))), 15_000);
  server.on("close", () => clearInterval(interval));
  server.listen(port, host, () => {
    const displayHost = host === "0.0.0.0" ? "your computer's local-network address" : host;
    console.log(`ATLAS is running at http://${displayHost}:${port}`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) start();
