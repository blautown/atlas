import { execFile } from "node:child_process";
import { cpus, freemem, hostname, platform, release, totalmem } from "node:os";
import { promisify } from "node:util";
import type { BrowserAgentProvider, ExecutionBackend, Json, ModelProvider } from "./types.js";

const execFileAsync = promisify(execFile);

function extractOutput(payload: any): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("Model provider returned no text output.");
}

function providerError(name: string, status: number, detail: string): Error {
  if (status === 401 || status === 403) return new Error(`${name} authentication failed. Check the provider key in ATLAS settings.`);
  if (status === 413) return new Error(`${name} rejected the request because its context limit was exceeded. ATLAS reduced future context; retry the message.`);
  if (status === 429) return new Error(`${name} is temporarily rate limited. Wait briefly and retry.`);
  return new Error(`${name} request failed (${status}): ${detail.slice(0, 300)}`);
}

export class ResponsesApiProvider implements ModelProvider {
  constructor(
    readonly name: string,
    private readonly apiKey: string | undefined,
    readonly model: string,
    private readonly baseUrl: string,
    private readonly extraHeaders: Record<string, string> = {}
  ) {}

  async generate(request: {
    system: string;
    input: string;
    jsonSchema?: Record<string, unknown>;
  }): Promise<string> {
    if (!this.apiKey) throw new Error(`${this.name.toUpperCase()} API key is not configured.`);
    const body: Record<string, unknown> = {
      model: this.model,
      instructions: request.system,
      input: request.input,
      tools: [],
      tool_choice: "none",
      max_output_tokens: Math.max(256, Number(process.env.ATLAS_MAX_OUTPUT_TOKENS ?? 1600))
    };
    if (request.jsonSchema) {
      body.text = {
        format: {
          type: "json_schema",
          name: "atlas_response",
          strict: true,
          schema: request.jsonSchema
        }
      };
    }
    const send = (payload: Record<string, unknown>) => fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...this.extraHeaders
      },
      body: JSON.stringify(payload)
    });
    let response = await send(body);
    if (response.status === 429) {
      const rateDetail = (await response.text()).slice(0, 500);
      const waitSeconds = Number(rateDetail.match(/try again in ([\d.]+)s/i)?.[1] ?? NaN);
      if (Number.isFinite(waitSeconds) && waitSeconds >= 0 && waitSeconds <= 60) {
        await new Promise((resolve) => setTimeout(resolve, Math.ceil(waitSeconds * 1000) + 250));
        response = await send(body);
      } else {
        throw providerError(this.name, response.status, rateDetail);
      }
    }
    if (!response.ok) {
      let detail = (await response.text()).slice(0, 500);
      const retryableStructuredFailure = response.status === 400
        && (detail.includes("tool_use_failed") || detail.includes("json_validate_failed"));
      if (retryableStructuredFailure) {
        response = await send({
          ...body,
          instructions: `No tools, functions, MCP servers, browsers, terminals, or repository APIs are available in this request. Never emit or invoke a tool call. Use only the context already supplied in the input. Express every proposed operation only as ordinary JSON fields matching the required response schema. The JSON must validate exactly: include every required property on every object, using null for required nullable fields rather than omitting them.\n\n${request.system}`,
          input: `All repository and platform context available to you is included below as data. Do not request additional inspection. Return only the required structured response.\n\n${request.input}`
        });
        if (response.ok) return extractOutput(await response.json());
        detail = (await response.text()).slice(0, 500);
      }
      throw providerError(this.name, response.status, detail);
    }
    return extractOutput(await response.json());
  }
}

export class OllamaProvider implements ModelProvider {
  readonly name = "ollama";
  private inferenceQueue: Promise<void> = Promise.resolve();

  constructor(
    readonly model = process.env.ATLAS_MODEL ?? "qwen3:4b",
    private readonly baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    private readonly timeoutMs = Math.max(1_000, Number(process.env.OLLAMA_TIMEOUT_MS ?? 120_000))
  ) {}

  async health(): Promise<{ status: "online" | "offline" | "missing_model"; model: string; detail: string }> {
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return { status: "offline", model: this.model, detail: `Ollama returned HTTP ${response.status}.` };
      const payload = await response.json() as { models?: Array<{ name?: string; model?: string }> };
      const available = payload.models?.some((item) => item.name === this.model || item.model === this.model) ?? false;
      return available
        ? { status: "online", model: this.model, detail: "Local model ready." }
        : { status: "missing_model", model: this.model, detail: `Run ollama pull ${this.model}.` };
    } catch {
      return { status: "offline", model: this.model, detail: "Ollama is not reachable at the configured local address." };
    }
  }

  generate(request: { system: string; input: string; jsonSchema?: Record<string, unknown> }): Promise<string> {
    const task = this.inferenceQueue.then(() => this.generateNow(request), () => this.generateNow(request));
    this.inferenceQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async generateNow(request: { system: string; input: string; jsonSchema?: Record<string, unknown> }): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: `${request.system}\n\nReturn only the final answer. Never expose private reasoning or hidden chain-of-thought.` },
          { role: "user", content: `${request.input}\n\n/no_think` }
        ],
        stream: false,
        think: false,
        format: request.jsonSchema,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? "10m",
        options: {
          temperature: Number(process.env.ATLAS_OLLAMA_TEMPERATURE ?? 0.2),
          num_predict: Math.max(128, Number(process.env.OLLAMA_MAX_OUTPUT_TOKENS ?? 600)),
          num_ctx: Math.max(2_048, Number(process.env.OLLAMA_CONTEXT_LENGTH ?? 8_192))
        }
      })
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      if (response.status === 404) throw new Error(`Ollama model "${this.model}" is not installed. Run ollama pull ${this.model}.`);
      throw new Error(`Ollama request failed (${response.status}): ${detail}`);
    }
    const payload = await response.json() as { message?: { content?: string } };
    let content = payload.message?.content?.trim() ?? "";
    const closingThink = content.lastIndexOf("</think>");
    if (closingThink >= 0) content = content.slice(closingThink + 8).trim();
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!content) throw new Error("Ollama returned no final answer.");
    if (request.jsonSchema) {
      try { JSON.parse(content); } catch { throw new Error("Ollama returned invalid structured JSON."); }
    }
    return content;
  }
}

export class LocalExecutionBackend implements ExecutionBackend {
  readonly name = "local";

  async inspect(): Promise<Record<string, Json>> {
    return {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      cpuCores: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytes: freemem(),
      nodeVersion: process.version
    };
  }

  async execute(command: string, cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
    const allowed: Record<string, [string, string[]]> = {
      "npm run typecheck": ["npm.cmd", ["run", "typecheck"]],
      "npm run lint": ["npm.cmd", ["run", "lint"]],
      "npm test": ["npm.cmd", ["test"]],
      "npm run check": ["npm.cmd", ["run", "check"]],
      "git status --short": ["git", ["status", "--short"]]
    };
    const selected = allowed[command];
    if (!selected) throw new Error("Command is not in the Development Assistant allowlist.");
    try {
      const result = await execFileAsync(selected[0], selected[1], {
        cwd,
        timeout: 120_000,
        windowsHide: true,
        maxBuffer: 2_000_000
      });
      return { code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error: any) {
      return {
        code: typeof error.code === "number" ? error.code : 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? error.message
      };
    }
  }
}

export class UnconfiguredBrowserProvider implements BrowserAgentProvider {
  readonly name = "unconfigured";
  async available(): Promise<boolean> {
    return false;
  }
}

export function createModelProvider(input: { provider: string; model: string; baseUrl?: string | null; apiKey?: string | undefined; timeoutMs?: number }): ModelProvider {
  if (input.provider === "ollama") return new OllamaProvider(input.model, input.baseUrl ?? "http://127.0.0.1:11434", input.timeoutMs ?? 120_000);
  const defaults: Record<string, string> = { groq: "https://api.groq.com/openai/v1", openrouter: "https://openrouter.ai/api/v1", openai: "https://api.openai.com/v1" };
  const baseUrl = input.baseUrl ?? defaults[input.provider];
  if (!baseUrl || !["groq", "openrouter", "openai"].includes(input.provider)) throw new Error("Unsupported model provider.");
  return new ResponsesApiProvider(input.provider, input.apiKey, input.model, baseUrl, input.provider === "openrouter" ? { "X-Title": "ATLAS" } : {});
}

export function createProviders(): {
  model: ModelProvider;
  execution: ExecutionBackend;
  browser: BrowserAgentProvider;
} {
  const requested = process.env.ATLAS_MODEL_PROVIDER?.toLowerCase();
  const provider = requested
    ?? (process.env.GROQ_API_KEY ? "groq"
      : process.env.OPENROUTER_API_KEY ? "openrouter"
        : "openai");
  const modelProviders: Record<string, ModelProvider> = {
    ollama: new OllamaProvider(),
    groq: new ResponsesApiProvider(
      "groq",
      process.env.GROQ_API_KEY,
      process.env.ATLAS_MODEL ?? "openai/gpt-oss-20b",
      process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1"
    ),
    openrouter: new ResponsesApiProvider(
      "openrouter",
      process.env.OPENROUTER_API_KEY,
      process.env.ATLAS_MODEL ?? "openrouter/free",
      process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      { "X-Title": "ATLAS" }
    ),
    openai: new ResponsesApiProvider(
      "openai",
      process.env.OPENAI_API_KEY,
      process.env.ATLAS_MODEL ?? "gpt-5.6-sol",
      process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
    )
  };
  const model = modelProviders[provider];
  if (!model) {
    throw new Error(`Unsupported ATLAS_MODEL_PROVIDER "${provider}". Use ollama, groq, openrouter, or openai.`);
  }
  return {
    model,
    execution: new LocalExecutionBackend(),
    browser: new UnconfiguredBrowserProvider()
  };
}
