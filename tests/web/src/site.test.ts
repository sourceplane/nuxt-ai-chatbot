import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_NAME } from "#shared/utils/site";

const web = path.resolve(__dirname, "../../../apps/web");

describe("the site's name (apps/web/shared/utils/site.ts)", () => {
  it("is set", () => {
    expect(SITE_NAME.trim()).not.toBe("");
  });

  it("is written as the seam the bootstrap's rename reads", () => {
    // tooling/rebrand matches `SITE_NAME = "<name>"` exactly, and writes the
    // product's name back with JSON.stringify — double quotes, always.
    const source = readFileSync(path.join(web, "shared/utils/site.ts"), "utf8");
    expect(source).toContain(`SITE_NAME = ${JSON.stringify(SITE_NAME)}`);
  });

  it("is the page title and the Open Graph title", () => {
    const app = readFileSync(path.join(web, "app/app.vue"), "utf8");
    expect(app).toMatch(/const title = SITE_NAME\b/);
    expect(app).toMatch(/\btitle,\n/);
    expect(app).toMatch(/ogTitle: title\b/);
  });
});
