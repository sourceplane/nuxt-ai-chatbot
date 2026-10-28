#!/usr/bin/env node
// A nuxt-auth-utils session cookie, sealed the way the Worker seals one — by
// the h3 the app itself ships (apps/web's own copy, resolved from the
// directory given), under the password given — for testing/e2e.test.sh to
// act as a signed-in user without a GitHub round trip. Prints
// `nuxt-session=<sealed>`.
//
//   node seal-session.mjs <apps/web dir> <password> '<user json>'
import { createServer } from "node:http";
import { createRequire } from "node:module";
import * as path from "node:path";

const [webDir, password, userJson] = process.argv.slice(2);
if (!webDir || !password || !userJson) {
  console.error("usage: seal-session.mjs <apps/web dir> <password> '<user json>'");
  process.exit(2);
}
const require = createRequire(path.join(path.resolve(webDir), "package.json"));
const { createApp, eventHandler, toNodeListener, useSession } = await import(require.resolve("h3"));

const app = createApp();
app.use(
  eventHandler(async (event) => {
    // nuxt-auth-utils' own session settings (runtimeConfig.session).
    const session = await useSession(event, { password, name: "nuxt-session", cookie: { sameSite: "lax" } });
    await session.update({ user: JSON.parse(userJson), loggedInAt: Date.now() });
    return "sealed";
  }),
);
const server = createServer(toNodeListener(app));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const res = await fetch(`http://127.0.0.1:${port}/`);
const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")]).find((c) => c?.startsWith("nuxt-session="));
server.close();
if (!cookie) {
  console.error("seal-session: h3 set no nuxt-session cookie");
  process.exit(1);
}
process.stdout.write(cookie.split(";")[0]);
