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

export class ResponsesApiProvider implements ModelProvider {
  constructor(
    readonly name: string,
    private readonly apiKey: string | undefined,
    private readonly model: string,
    private readonly baseUrl: string,
    private readonly extraHeaders: Record<string, string> = {}
  ) {}

  async generate(request: {
    system: string;
    input: string;
    jsonSchema?: Record<string, unknown>;
  }): Promise<string> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    const body: Record<string, unknown> = {
      model: this.model,
      instructions: request.system,
      input: request.input
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
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...this.extraHeaders
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`${this.name} request failed (${response.status}): ${detail}`);
    }
    return extractOutput(await response.json());
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
    throw new Error(`Unsupported ATLAS_MODEL_PROVIDER "${provider}". Use groq, openrouter, or openai.`);
  }
  return {
    model,
    execution: new LocalExecutionBackend(),
    browser: new UnconfiguredBrowserProvider()
  };
}
