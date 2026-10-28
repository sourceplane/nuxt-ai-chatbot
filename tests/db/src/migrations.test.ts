import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { manifest } from "@saas/db/manifest";
import { D1ApiAdapter, loadD1CredentialsFromEnv, runMigrations } from "@saas/db/runner";
import type { MigrationManifest } from "@saas/db/types";

const migrationsDir = path.resolve(__dirname, "../../../packages/db/src/migrations");

// node:sqlite is real SQLite — D1's engine — so the migrations run here
// against the database semantics they meet in production. Loaded through
// require: it is newer than the bundler's list of Node built-ins.
type Row = Record<string, unknown>;
interface Sqlite {
  prepare(sql: string): { all(...params: unknown[]): Row[] };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (file: string) => Sqlite;
};

// A stand-in for D1's REST API (`POST …/d1/database/{id}/query`, one statement
// per call, `{ sql, params }` in, `{ success, result: [{ results }] }` out),
// over a real SQLite database: the adapter is exercised through the same
// request and response shapes the db-migrate lane sends to Cloudflare.
function fakeD1(db: Sqlite) {
  const requests: { url: string; auth: string | null; sql: string }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const { sql, params } = JSON.parse(String(init?.body)) as { sql: string; params: unknown[] };
    requests.push({ url: String(input), auth: new Headers(init?.headers).get("authorization"), sql });
    try {
      const results = db.prepare(sql).all(...params);
      return new Response(JSON.stringify({ success: true, result: [{ results, success: true }] }), { status: 200 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ success: false, errors: [{ code: 7500, message }] }), { status: 400 });
    }
  }) as typeof fetch;
  return { fetchImpl, requests };
}

function tables(db: Sqlite): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => String(r.name));
}

describe("the migration manifest (packages/db)", () => {
  it("starts with the control migration, in id order, and names every file with its checksum", () => {
    const ids = manifest.migrations.map((m) => m.id);
    expect(ids[0]).toBe("000_control_baseline");
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of manifest.migrations) {
      const file = readFileSync(path.join(migrationsDir, entry.path));
      expect(createHash("sha256").update(file).digest("hex"), entry.id).toBe(entry.checksum);
    }
  });

  it("writes every CREATE of the chat's schema idempotently", () => {
    const sql = readFileSync(path.join(migrationsDir, "010_chat/up.sql"), "utf8");
    const creates = sql.match(/^CREATE (UNIQUE )?(TABLE|INDEX) .*/gm) ?? [];
    expect(creates.length).toBe(7); // four tables, three indexes
    for (const line of creates) expect(line, line).toMatch(/ IF NOT EXISTS /);
  });

  it("is the schema the app's Drizzle tables declare (apps/web/server/db/schema.ts)", () => {
    // Every column Drizzle reads and writes exists in the migration, under
    // the same SQL name: the queries are typed from schema.ts, the database
    // is made by this file.
    const schema = readFileSync(path.resolve(migrationsDir, "../../../../apps/web/server/db/schema.ts"), "utf8");
    const db = new DatabaseSync(":memory:");
    for (const stmt of D1ApiAdapter.splitStatements(readFileSync(path.join(migrationsDir, "010_chat/up.sql"), "utf8"))) {
      db.prepare(stmt).all();
    }
    for (const [, table, body] of schema.matchAll(/sqliteTable\('(\w+)', \{([\s\S]*?)\n\}/g)) {
      const declared = [...(body ?? "").matchAll(/(?:text|integer)\('(\w+)'/g)].map((m) => m[1]);
      if (/\.\.\.timestamps/.test(body ?? "")) declared.push("created_at");
      const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => String(r.name));
      expect(columns.sort(), String(table)).toEqual([...declared].sort());
    }
  });

  it("plans every migration as pending offline (a pull request's plan profile)", async () => {
    const result = await runMigrations(manifest, { mode: "plan", migrationsDir, adapter: null });
    expect(result.failed).toBeNull();
    expect(result.applied).toEqual(manifest.migrations.map((m) => m.id));
  });

  it("refuses a file that no longer matches its checksum, even offline", async () => {
    const tampered: MigrationManifest = {
      version: 1,
      migrations: manifest.migrations.map((m, i) => (i === 1 ? { ...m, checksum: "0".repeat(64) } : m)),
    };
    await expect(runMigrations(tampered, { mode: "plan", migrationsDir, adapter: null })).rejects.toThrow(
      /Checksum mismatch for 010_chat/,
    );
  });
});

describe("db-migrate apply, over the D1 REST API, into real SQLite", () => {
  let db: Sqlite;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
  });

  it("creates the schema the chat reads and writes, and records what it applied", async () => {
    const { fetchImpl, requests } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    const result = await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    expect(result.failed).toBeNull();
    expect(result.applied).toEqual(["000_control_baseline", "010_chat", "020_app_secrets"]);
    expect(tables(db)).toEqual(["_migrations_applied", "_migrations_lock", "app_secrets", "chats", "messages", "users", "votes"]);
    expect(db.prepare("SELECT id FROM _migrations_applied ORDER BY id").all().map((r) => r.id)).toEqual([
      "000_control_baseline",
      "010_chat",
      "020_app_secrets",
    ]);
    // The lock is released, and every call was the account's database with the token.
    expect(db.prepare("SELECT * FROM _migrations_lock").all()).toEqual([]);
    expect(new Set(requests.map((r) => r.url))).toEqual(
      new Set(["https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db-id/query"]),
    );
    expect(new Set(requests.map((r) => r.auth))).toEqual(new Set(["Bearer token"]));

    // A chat the way the app writes one — a visitor's, private by default —
    // its message, and a vote on it; deleting the chat takes both with it.
    db.prepare("PRAGMA foreign_keys = ON").all();
    db.prepare("INSERT INTO chats (id, title, user_id, created_at) VALUES (?, ?, ?, ?)").all("c1", "Hello", "session-1", 1);
    db.prepare("INSERT INTO messages (id, chat_id, role, parts, created_at) VALUES (?, ?, ?, ?, ?)").all(
      "m1", "c1", "user", JSON.stringify([{ type: "text", text: "Hello" }]), 1);
    db.prepare("INSERT INTO votes (chat_id, message_id, is_upvoted) VALUES (?, ?, ?)").all("c1", "m1", 1);
    expect(db.prepare("SELECT visibility FROM chats").all().map((r) => r.visibility)).toEqual(["private"]);
    db.prepare("DELETE FROM chats WHERE id = ?").all("c1");
    expect(db.prepare("SELECT count(*) AS n FROM messages").all()[0]?.n).toBe(0);
    expect(db.prepare("SELECT count(*) AS n FROM votes").all()[0]?.n).toBe(0);
    // A GitHub user is one row per account.
    const user = "INSERT INTO users (id, email, name, avatar, username, provider, provider_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    db.prepare(user).all("u1", "ada@example.invalid", "Ada", "", "ada", "github", "1", 1);
    expect(() => db.prepare(user).all("u2", "ada@example.invalid", "Ada", "", "ada", "github", "1", 1)).toThrow(/UNIQUE/);
  });

  it("generates the site's secret once, and never replaces it", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    const read = () =>
      Object.fromEntries(db.prepare("SELECT name, value FROM app_secrets ORDER BY name").all().map((r) => [r.name, r.value]));
    const first = read();
    expect(Object.keys(first)).toEqual(["session"]);
    // nuxt-auth-utils needs a password of at least 32 characters.
    expect(String(first.session)).toMatch(/^[0-9a-f]{64}$/);
    // The file itself, run again (a local re-run), keeps every value.
    const sql = readFileSync(path.join(migrationsDir, "020_app_secrets/up.sql"), "utf8");
    for (const stmt of D1ApiAdapter.splitStatements(sql)) db.prepare(stmt).all();
    expect(read()).toEqual(first);
  });

  it("applies nothing twice: a second run skips what the ledger recorded", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    db.prepare("INSERT INTO chats (id, title, user_id, created_at) VALUES (?, ?, ?, ?)").all("c1", "kept", "session-1", 1);
    const again = await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    expect(again.applied).toEqual([]);
    expect(again.skipped).toEqual(["000_control_baseline", "010_chat", "020_app_secrets"]);
    expect(db.prepare("SELECT title FROM chats").all().map((r) => r.title)).toEqual(["kept"]);
  });

  it("takes a schema the template's own Drizzle migrations already created as there", async () => {
    // NuxtHub (`nuxt db migrate`) applies the template's three Drizzle files
    // without IF NOT EXISTS; a database it migrated (a local one, say) takes
    // this runner's files as no-ops.
    const drizzle = path.resolve(migrationsDir, "../../../../apps/web/server/db/migrations/sqlite");
    for (const file of ["0000_amusing_ozymandias.sql", "0001_aromatic_inhumans.sql", "0002_eager_gorilla_man.sql"]) {
      for (const stmt of readFileSync(path.join(drizzle, file), "utf8").split("--> statement-breakpoint")) {
        if (stmt.trim()) db.prepare(stmt).all();
      }
    }
    db.prepare("INSERT INTO chats (id, title, user_id, created_at) VALUES (?, ?, ?, ?)").all("c0", "from before", "s", 1);
    const { fetchImpl } = fakeD1(db);
    const result = await runMigrations(manifest, {
      mode: "apply",
      migrationsDir,
      adapter: new D1ApiAdapter("acct", "db-id", "token", fetchImpl),
    });
    expect(result.failed).toBeNull();
    expect(db.prepare("SELECT title FROM chats").all().map((r) => r.title)).toEqual(["from before"]);
  });

  it("refuses to run while another runner holds the lock", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await adapter.connect();
    db.prepare("INSERT INTO _migrations_lock (id, acquired_at) VALUES (?, ?)").all(
      "migrate-839201008",
      new Date().toISOString(),
    );
    await expect(runMigrations(manifest, { mode: "apply", migrationsDir, adapter })).rejects.toThrow(
      /advisory lock/,
    );
    expect(tables(db)).not.toContain("users");
  });

  it("refuses an applied migration whose file has since changed", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await runMigrations(manifest, { mode: "apply", migrationsDir, adapter });
    db.prepare("UPDATE _migrations_applied SET checksum = ? WHERE id = ?").all("f".repeat(64), "010_chat");
    await expect(runMigrations(manifest, { mode: "apply", migrationsDir, adapter })).rejects.toThrow(
      /Checksum mismatch for already-applied migrations: 010_chat/,
    );
  });

  it("names the statement D1 refused", async () => {
    const { fetchImpl } = fakeD1(db);
    const adapter = new D1ApiAdapter("acct", "db-id", "token", fetchImpl);
    await adapter.connect();
    await expect(adapter.executeSql("CREATE TABLE ok(x);\nINSERT INTO nope VALUES (1);")).rejects.toThrow(
      /no such table: nope — at: INSERT INTO nope/,
    );
  });
});

describe("D1ApiAdapter.splitStatements", () => {
  it("splits on top-level semicolons only, and drops comment-only chunks", () => {
    const sql = "-- a comment; with a semicolon\nCREATE TABLE a(x TEXT DEFAULT 'a;b');\n-- trailing; note\nINSERT INTO a VALUES ('it''s');\n";
    expect(D1ApiAdapter.splitStatements(sql)).toEqual([
      "-- a comment; with a semicolon\nCREATE TABLE a(x TEXT DEFAULT 'a;b')",
      "-- trailing; note\nINSERT INTO a VALUES ('it''s')",
    ]);
  });
});

describe("the runner's environment (what the component's secretEnv resolves)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("reads the database id from the cloudflare-d1 wiring document", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_API_TOKEN = "token";
    delete process.env.D1_DATABASE_ID;
    process.env.WIRING_CLOUDFLARE_D1 = JSON.stringify({ d1_database_id: "uuid-1", d1_database_name: "stg-x-stage" });
    expect(loadD1CredentialsFromEnv()).toEqual({ accountId: "acct", databaseId: "uuid-1", apiToken: "token" });
  });

  it("refuses to guess without a database id", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_API_TOKEN = "token";
    delete process.env.D1_DATABASE_ID;
    delete process.env.WIRING_CLOUDFLARE_D1;
    expect(() => loadD1CredentialsFromEnv()).toThrow(/No D1 database id/);
  });

  it("sends to CLOUDFLARE_API_BASE_URL when it is set, as wrangler does", async () => {
    process.env.CLOUDFLARE_API_BASE_URL = "http://127.0.0.1:9/client/v4/";
    const { fetchImpl, requests } = fakeD1(new DatabaseSync(":memory:"));
    await new D1ApiAdapter("acct", "db-id", "token", fetchImpl).connect();
    expect(requests[0]?.url).toBe("http://127.0.0.1:9/client/v4/accounts/acct/d1/database/db-id/query");
  });
});
