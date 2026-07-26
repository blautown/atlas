import { createProviders } from "../dist/src/providers.js";

const { model } = createProviders();
const response = await model.generate({
  system: "Return only the requested structured result.",
  input: "Confirm the provider is operational.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["operational"] }
    }
  }
});

const parsed = JSON.parse(response);
if (parsed.status !== "operational") {
  throw new Error("Provider returned an unexpected structured result.");
}

console.log(`Provider smoke passed: ${model.name} structured output is operational.`);
