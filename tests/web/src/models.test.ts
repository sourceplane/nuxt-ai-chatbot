import { generateText } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MODEL, GATEWAY_MODELS, MODELS, TITLE_MODEL, WORKERS_AI_MODELS } from "#shared/utils/models";
import {
  availableModels,
  gatewayConfigured,
  isWorkersAiModel,
  languageModel,
  resolveModelId,
  workersAiOptions,
} from "@/server/utils/models";

// server/utils/models.ts: the chat runs on Workers AI through the Worker's AI
// binding unless its owner has set the AI Gateway's key; the gateway's models
// (upstream's list) are offered only then, and a model the deployment cannot
// use answers as the default Workers AI model instead of failing the chat.
type Event = Parameters<typeof languageModel>[0];
function eventWith(env: Record<string, unknown>): Event {
  return { context: { cloudflare: { env } } } as unknown as Event;
}

afterEach(() => {
  delete process.env.AI_GATEWAY_API_KEY;
});

describe("the model catalogue (shared/utils/models.ts)", () => {
  it("starts a chat on a Workers AI model and titles it with one", () => {
    expect(MODELS[0]?.value).toBe(DEFAULT_MODEL);
    expect(isWorkersAiModel(DEFAULT_MODEL)).toBe(true);
    expect(isWorkersAiModel(TITLE_MODEL)).toBe(true);
    expect(WORKERS_AI_MODELS.every((m) => m.value.startsWith("@cf/") && m.via === "workers-ai")).toBe(true);
  });

  it("keeps upstream's gateway models as upstream lists them", () => {
    expect(GATEWAY_MODELS.map((m) => m.value)).toEqual([
      "anthropic/claude-haiku-4.5",
      "google/gemini-3-flash",
      "openai/gpt-5-nano",
    ]);
    expect(GATEWAY_MODELS.every((m) => m.via === "gateway")).toBe(true);
  });
});

describe("without the AI Gateway's key", () => {
  it("offers Workers AI's models only", () => {
    expect(gatewayConfigured()).toBe(false);
    expect(availableModels()).toEqual(WORKERS_AI_MODELS);
  });

  it("answers a gateway model, or an unknown one, as the default", () => {
    expect(resolveModelId("anthropic/claude-haiku-4.5")).toBe(DEFAULT_MODEL);
    expect(resolveModelId("nobody/lists-this")).toBe(DEFAULT_MODEL);
  });

  it("keeps a Workers AI choice", () => {
    expect(resolveModelId("@cf/zai-org/glm-4.7-flash")).toBe("@cf/zai-org/glm-4.7-flash");
  });
});

describe("with the AI Gateway's key", () => {
  it("offers every model and keeps a gateway choice", () => {
    process.env.AI_GATEWAY_API_KEY = "an-owner-set-gateway-key";
    expect(gatewayConfigured()).toBe(true);
    expect(availableModels()).toEqual(MODELS);
    expect(resolveModelId("openai/gpt-5-nano")).toBe("openai/gpt-5-nano");
  });

  it("sends a gateway model through the gateway, never the binding", () => {
    process.env.AI_GATEWAY_API_KEY = "an-owner-set-gateway-key";
    const model = languageModel(eventWith({}), "anthropic/claude-haiku-4.5");
    expect(typeof model === "object" && model.modelId).toBe("anthropic/claude-haiku-4.5");
  });
});

describe("Workers AI through the AI binding", () => {
  it("runs the model on the request's binding, with no key", async () => {
    const calls: { model: string; inputs: Record<string, unknown> }[] = [];
    const AI = {
      async run(model: string, inputs: Record<string, unknown>) {
        calls.push({ model, inputs });
        return { response: "Hello from the binding", usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } };
      },
    };
    const { text } = await generateText({
      model: languageModel(eventWith({ AI }), DEFAULT_MODEL),
      prompt: "Hello",
      providerOptions: workersAiOptions(false),
    });
    expect(text).toBe("Hello from the binding");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe(DEFAULT_MODEL);
    expect(calls[0]?.inputs.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("fails plainly when the Worker has no AI binding", () => {
    expect(() => languageModel(eventWith({}), DEFAULT_MODEL)).toThrow(/AI binding is missing/);
  });

  it("turns thinking on or off per call", () => {
    expect(workersAiOptions(true)).toEqual({ "workers-ai": { chat_template_kwargs: { enable_thinking: true } } });
    expect(workersAiOptions(false)).toEqual({ "workers-ai": { chat_template_kwargs: { enable_thinking: false } } });
  });
});
