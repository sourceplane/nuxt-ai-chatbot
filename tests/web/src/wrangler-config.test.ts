import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

// apps/web/wrangler.template.jsonc (and its committed fixture render,
// wrangler.jsonc): the Worker is Nitro's output, and it binds what the app
// reads — the D1 database as DB and the R2 bucket as BLOB (NuxtHub's drivers),
// Workers AI as AI — and never carries a secret as a plain var.
const web = path.resolve(__dirname, "../../../apps/web");
const strip = (jsonc: string) => JSON.parse(jsonc.replace(/^\s*\/\/.*$/gm, "").replace(/\/\/[^"\n]*$/gm, ""));

for (const file of ["wrangler.template.jsonc", "wrangler.jsonc"]) {
  describe(`apps/web/${file}`, () => {
    const config = strip(readFileSync(path.join(web, file), "utf8"));

    it("deploys Nitro's Worker and its static assets", () => {
      expect(config.main).toBe("./.output/server/index.mjs");
      expect(config.assets).toEqual({ directory: "./.output/public", binding: "ASSETS" });
      expect(config.compatibility_flags).toContain("nodejs_compat");
    });

    it("binds D1 as DB, R2 as BLOB and Workers AI as AI", () => {
      expect(config.d1_databases.map((d: { binding: string }) => d.binding)).toEqual(["DB"]);
      expect(config.r2_buckets.map((b: { binding: string }) => b.binding)).toEqual(["BLOB"]);
      expect(config.ai).toEqual({ binding: "AI" });
    });

    it("sets no secret as a var", () => {
      const vars = Object.keys(config.vars ?? {});
      for (const secret of ["NUXT_SESSION_PASSWORD", "NUXT_OAUTH_GITHUB_CLIENT_SECRET", "AI_GATEWAY_API_KEY"]) {
        expect(vars).not.toContain(secret);
      }
    });
  });
}
