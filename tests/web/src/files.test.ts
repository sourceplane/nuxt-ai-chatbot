import { afterEach, describe, expect, it } from "vitest";
import { blob } from "hub:blob";
import { FILES_ROUTE, fileUrl, inlineStoredFiles } from "@/server/utils/files";

// server/utils/files.ts: an R2 object has no public URL, so an upload is
// served back at /api/files/<pathname> and stored in the chat with that URL;
// the copy of the chat sent to the model carries each stored upload's bytes
// instead, read from the bucket (hub:blob is an in-memory stand-in here).
type Messages = Parameters<typeof inlineStoredFiles>[0];

afterEach(() => {
  (blob as unknown as { clear(): void }).clear();
});

describe("an upload's URL", () => {
  it("is the Worker's file route, each path segment encoded", () => {
    expect(FILES_ROUTE).toBe("/api/files/");
    expect(fileUrl("ada/chat-1/a photo-x1y2.png")).toBe("/api/files/ada/chat-1/a%20photo-x1y2.png");
  });
});

describe("the chat the model is sent", () => {
  it("carries a stored upload's bytes as a data URL", async () => {
    await blob.put("ada/chat-1/pixel-x1y2.png", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    const messages = [
      {
        id: "m1",
        role: "user",
        parts: [
          { type: "text", text: "What is this?" },
          { type: "file", mediaType: "image/png", url: fileUrl("ada/chat-1/pixel-x1y2.png") },
        ],
      },
    ] as unknown as Messages;
    const [message] = await inlineStoredFiles(messages);
    expect(message?.parts[0]).toEqual({ type: "text", text: "What is this?" });
    expect(message?.parts[1]).toEqual({ type: "file", mediaType: "image/png", url: "data:image/png;base64,iVBORw==" });
    // The stored chat keeps its URL: only the copy is rewritten.
    expect((messages[0]?.parts[1] as { url: string }).url).toBe("/api/files/ada/chat-1/pixel-x1y2.png");
  });

  it("leaves a file it does not hold, or one that is not its own, as it was", async () => {
    const messages = [
      {
        id: "m2",
        role: "user",
        parts: [
          { type: "file", mediaType: "image/png", url: "/api/files/ada/chat-1/gone.png" },
          { type: "file", mediaType: "image/png", url: "https://example.com/elsewhere.png" },
          { type: "file", mediaType: "image/png", url: "/api/files/ada/../secrets" },
        ],
      },
    ] as unknown as Messages;
    const [message] = await inlineStoredFiles(messages);
    expect(message?.parts.map((p) => (p as { url: string }).url)).toEqual([
      "/api/files/ada/chat-1/gone.png",
      "https://example.com/elsewhere.png",
      "/api/files/ada/../secrets",
    ]);
  });
});
