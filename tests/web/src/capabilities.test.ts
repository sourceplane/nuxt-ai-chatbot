import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MODELS, WORKERS_AI_MODELS } from "#shared/utils/models";
import { capabilitiesFor } from "@/server/utils/capabilities";

// server/utils/capabilities.ts (GET /api/capabilities): the interface offers
// what the deployment has — the picker, the microphone, the sign-in button.
afterEach(() => {
  delete process.env.AI_GATEWAY_API_KEY;
});

describe("what a fresh deployment offers", () => {
  it("is Workers AI's models, no dictation and no sign-in", () => {
    expect(capabilitiesFor(undefined)).toEqual({
      models: WORKERS_AI_MODELS,
      defaultModel: DEFAULT_MODEL,
      dictation: false,
      githubSignIn: false,
    });
    expect(capabilitiesFor({ clientId: "", clientSecret: "" }).githubSignIn).toBe(false);
  });
});

describe("what its owner connects afterwards", () => {
  it("is GitHub sign-in once the OAuth app's id and secret are both set", () => {
    expect(capabilitiesFor({ clientId: "Iv1.0123456789abcdef", clientSecret: "" }).githubSignIn).toBe(false);
    expect(capabilitiesFor({ clientId: "Iv1.0123456789abcdef", clientSecret: "a-secret" }).githubSignIn).toBe(true);
  });

  it("is every model and dictation once the AI Gateway's key is set", () => {
    process.env.AI_GATEWAY_API_KEY = "an-owner-set-gateway-key";
    const offered = capabilitiesFor(undefined);
    expect(offered.models).toEqual(MODELS);
    expect(offered.dictation).toBe(true);
  });
});
