export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface ModelProvider {
  readonly name: string;
  generate(request: {
    system: string;
    input: string;
    jsonSchema?: Record<string, unknown>;
  }): Promise<string>;
}

export interface ExecutionBackend {
  readonly name: string;
  inspect(): Promise<Record<string, Json>>;
  execute(command: string, cwd: string): Promise<{ code: number; stdout: string; stderr: string }>;
}

export interface BrowserAgentProvider {
  readonly name: string;
  available(): Promise<boolean>;
}
