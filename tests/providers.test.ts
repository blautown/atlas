import assert from "node:assert/strict";
import test from "node:test";
import { OllamaProvider, ResponsesApiProvider } from "../src/providers.js";

test("Groq tool-call failures retry as schema-only responses", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<Record<string, any>> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    if (requests.length === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "Tool choice is none, but model called a tool",
          code: "tool_use_failed",
          failed_generation: "{\"name\":\"repo_browser.print_tree\"}"
        }
      }), { status: 400 });
    }
    return new Response(JSON.stringify({ output_text: "{\"status\":\"operational\"}" }), { status: 200 });
  };

  try {
    const provider = new ResponsesApiProvider("groq", "test-key", "openai/gpt-oss-20b", "https://api.groq.test");
    const output = await provider.generate({
      system: "Inspect the supplied repository inventory.",
      input: "Repository files are already supplied.",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        properties: { status: { type: "string" } }
      }
    });
    assert.equal(output, "{\"status\":\"operational\"}");
    assert.equal(requests.length, 2);
    assert.equal(requests[0]!.tool_choice, "none");
    assert.deepEqual(requests[0]!.tools, []);
    assert.match(requests[1]!.instructions, /Never emit or invoke a tool call/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Groq schema-validation failures retry with complete-field guidance", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<Record<string, any>> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    if (requests.length === 1) {
      return new Response(JSON.stringify({
        error: {
          message: "Generated JSON does not match the expected schema",
          code: "json_validate_failed",
          failed_generation: "{\"actions\":[{\"type\":\"read\"}]}"
        }
      }), { status: 400 });
    }
    return new Response(JSON.stringify({ output_text: "{\"status\":\"operational\"}" }), { status: 200 });
  };

  try {
    const provider = new ResponsesApiProvider("groq", "test-key", "openai/gpt-oss-20b", "https://api.groq.test");
    const output = await provider.generate({
      system: "Return structured JSON.",
      input: "Return status.",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        properties: { status: { type: "string" } }
      }
    });
    assert.equal(output, "{\"status\":\"operational\"}");
    assert.equal(requests.length, 2);
    assert.match(requests[1]!.instructions, /include every required property/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Groq rate limits retry once after the bounded provider delay", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: { message: "Rate limit reached. Please try again in 0s.", code: "rate_limit_exceeded" }
      }), { status: 429 });
    }
    return new Response(JSON.stringify({ output_text: "{\"status\":\"operational\"}" }), { status: 200 });
  };
  try {
    const provider = new ResponsesApiProvider("groq", "test-key", "openai/gpt-oss-20b", "https://api.groq.test");
    const output = await provider.generate({ system: "Return JSON.", input: "Status?" });
    assert.equal(output, "{\"status\":\"operational\"}");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Ollama disables thinking and returns only structured final content", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, any> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      message: { content: "private trace that must not escape</think>\n{\"status\":\"ready\"}", thinking: "hidden" }
    }), { status: 200 });
  };
  try {
    const provider = new OllamaProvider("qwen3:4b", "http://ollama.test");
    const output = await provider.generate({
      system: "Return status.", input: "Are you ready?",
      jsonSchema: { type: "object", required: ["status"], properties: { status: { type: "string" } } }
    });
    assert.equal(output, '{"status":"ready"}');
    assert.equal(requestBody?.think, false);
    assert.equal(requestBody?.stream, false);
    assert.match(requestBody?.messages[1].content, /\/no_think/);
    assert.deepEqual(requestBody?.format.required, ["status"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Ollama health distinguishes an installed model", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ name: "qwen3:4b" }] }), { status: 200 });
  try {
    const provider = new OllamaProvider("qwen3:4b", "http://ollama.test");
    assert.deepEqual(await provider.health(), { status: "online", model: "qwen3:4b", detail: "Local model ready." });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
