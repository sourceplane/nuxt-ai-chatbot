import { beforeEach, describe, expect, it, vi } from "vitest";

// server/utils/app-secrets.ts: the key nuxt-auth-utils seals the session
// cookie with is NUXT_SESSION_PASSWORD when one is set, and otherwise the key
// the environment's database generated for itself (migration 020_app_secrets)
// — read once per isolate. The D1 binding is a stand-in: what is tested is
// which key wins and when the database is asked.
const STORED = "c".repeat(64);

function d1(value: string | null | Error) {
  const queries: { sql: string; params: unknown[] }[] = [];
  return {
    queries,
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          queries.push({ sql, params });
          return {
            first: async (_column: string) => {
              if (value instanceof Error) throw value;
              return value;
            },
          };
        },
      };
    },
  };
}

async function load() {
  const mod = await import("@/server/utils/app-secrets");
  type Event = Parameters<typeof mod.appSecret>[0];
  const eventWith = (env: Record<string, unknown>) => ({ context: { cloudflare: { env } } }) as unknown as Event;
  return { appSecret: mod.appSecret, eventWith };
}

describe("the session key (server/utils/app-secrets.ts)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NUXT_SESSION_PASSWORD;
  });

  it("is NUXT_SESSION_PASSWORD when one is set, without asking the database", async () => {
    process.env.NUXT_SESSION_PASSWORD = "an-owner-set-password-of-enough-length";
    const { appSecret, eventWith } = await load();
    const db = d1(STORED);
    expect(await appSecret(eventWith({ DB: db }), "session")).toBe("an-owner-set-password-of-enough-length");
    expect(db.queries).toHaveLength(0);
  });

  it("is the generated key otherwise, read once per isolate", async () => {
    const { appSecret, eventWith } = await load();
    const db = d1(STORED);
    expect(await appSecret(eventWith({ DB: db }), "session")).toBe(STORED);
    expect(await appSecret(eventWith({ DB: db }), "session")).toBe(STORED);
    expect(db.queries).toEqual([{ sql: "SELECT value FROM app_secrets WHERE name = ?", params: ["session"] }]);
  });

  it("refuses to serve, 503, when the migrations have not run", async () => {
    const { appSecret, eventWith } = await load();
    await expect(appSecret(eventWith({ DB: d1(null) }), "session")).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringMatching(/020_app_secrets/),
    });
  });

  it("refuses to serve, 503, on a database with no app_secrets table yet", async () => {
    const { appSecret, eventWith } = await load();
    await expect(
      appSecret(eventWith({ DB: d1(new Error("D1_ERROR: no such table: app_secrets")) }), "session"),
    ).rejects.toMatchObject({ statusCode: 503, message: expect.stringMatching(/apply packages\/db's migrations/) });
  });

  it("refuses to serve, 503, when the Worker has no database bound", async () => {
    const { appSecret, eventWith } = await load();
    await expect(appSecret(eventWith({}), "session")).rejects.toMatchObject({ statusCode: 503 });
  });
});
