# nuxt-ai-chatbot — design

## The template

[nuxt-ui-templates/chat](https://github.com/nuxt-ui-templates/chat) is the
Nuxt app behind Vercel's Nuxt AI Chatbot: Nuxt 4, Nuxt UI 4 and the AI SDK 7.
A chat streams its answer from `POST /api/chats/:id` (reasoning, a chart tool,
a weather tool, the providers' web search), titles itself with a fast model,
and is stored with its messages and votes through Drizzle in NuxtHub's
`hub:db`; uploads go through NuxtHub's `hub:blob`; GitHub sign-in is
nuxt-auth-utils, with every visitor's chats owned by their session until they
sign in; dictation streams microphone audio to the AI Gateway's transcription
model. On Vercel, every model is a string id the AI SDK sends to the Vercel AI
Gateway, the database is Turso and the blob store is Vercel Blob.

## How each Vercel piece maps to Cloudflare

| Vercel | Cloudflare, here | How |
|---|---|---|
| Nuxt on Vercel | One Worker + Static Assets | Nitro's `cloudflare_module` preset; `nuxt build` writes `.output/server/index.mjs` and `.output/public`, deployed by one `wrangler deploy` of the committed `wrangler.jsonc` (NuxtHub turns Nitro's own `deployConfig` on; a `nitro:config` hook turns it back off) |
| The AI Gateway, for every model | Workers AI, through the `AI` binding, by default | `workers-ai-provider` on the request's binding (`server/utils/models.ts`); Kimi K2.6 answers, GLM 4.7 Flash titles. Upstream's three models, web search (a provider tool) and dictation (the gateway's transcription) are offered only once `AI_GATEWAY_API_KEY` is set — the picker reads `/api/capabilities`, and a model the deployment cannot use answers as the default |
| Turso (`hub:db`, `libsql`) | D1 (`hub:db`, NuxtHub's `d1` driver, the `DB` binding) | The queries are untouched. NuxtHub never migrates D1 (no build-time migration; `applyMigrationsDuringDev` off); the schema is `packages/db`'s `010_chat`, the template's three Drizzle migrations folded into one, applied by `infra/db-migrate` before the Worker deploys |
| Vercel Blob (`hub:blob`) | R2 (`hub:blob`, NuxtHub's `cloudflare-r2` driver, the `BLOB` binding) | An R2 object has no public URL, so the upload answers with `/api/files/<pathname>`, a route that serves the object back; the copy of a chat sent to the model carries each stored upload's bytes, read from R2 (`server/utils/files.ts`) |
| `NUXT_SESSION_PASSWORD`, typed | Generated in the database | `020_app_secrets` writes a 64-character key once; a server middleware puts it where nuxt-auth-utils reads it before any route uses a session; an owner-set secret wins |
| GitHub OAuth keys, typed | Optional Orun secrets | The build runs without them; the deploy sets them on the Worker (`tooling/wire/worker-secrets.mjs`, `wrangler secret bulk`). Until they exist the sidebar says sign-in is not connected, rather than offering a button that fails |
| Icons fetched on the server | Bundled | Nuxt Icon's server falls back to fetching whole collections from a CDN on a serverless host; every icon the app names is in the client bundle, which serves the server render too |
| A database and a blob store from the dashboard | Terraform | `infra/terraform/cloudflare-d1` and `cloudflare-r2`, per environment, lease-publishing their wiring documents |

## The repository

turso-starter's shape, as payload-website extended it with blob-starter's R2
root: `apps/web` (the Nuxt app), `packages/db` (the migrations and their D1
REST API runner), `infra/db-migrate`, `infra/terraform/cloudflare-d1`,
`infra/terraform/cloudflare-r2`, `tests/web` and `tests/db`, and the shared
tooling. `apps/web/wrangler.jsonc` is rendered from `wrangler.template.jsonc`
— from `wiring.fixture.json` for local work and dev, from the roots' wiring
documents on stage and prod.

## The build and the deploy

Per environment, on a merge: the D1 and R2 applies, then db-migrate (enforced
on the D1 apply), then the web lane (enforced on all three) — render the
config, `nuxt build` with no optional secret in its environment, hand the
secrets the environment has to the Worker, deploy, and smoke-test the page,
`/api/chats` (read from D1) and `/api/capabilities`. A pull request plans the
roots, plans the migrations offline and builds and dry-deploys the chat.

## Alternatives rejected

- **Keep the AI Gateway as the only model path.** A fresh chat would need a
  key nobody brokers, and the gateway is not a composition Orun has; Workers
  AI is the account's own, so the chat works on its first deploy.
- **Turn the template's Drizzle migrations over to NuxtHub on Workers.**
  NuxtHub's D1 driver applies nothing at build or at runtime; Orun's
  db-migrate applies a reviewed ledger before the deploy, as every D1 starter
  here does.
- **`agents/models/ai-sdk`'s `createAI`, which deprecates
  `workers-ai-provider`.** It is built around the AI Gateway and brings in a
  far larger dependency tree; the binding provider is what ai-chatbot runs.
