# nuxt-ai-chatbot — implementation plan

## NC0 — the spec (NC-1)

The repository is born with `intent.yaml` (the placeholder workspace, so CI
plans nothing until it is linked), `ci.yml` byte for byte turso-starter's, the
shared TypeScript and ESLint configuration, the wrangler renderer and the
spec index; then this doc set and the three task contracts land.

## NC1 — the chat on Workers, D1 and R2 (NC-2)

- The template from `main` into `apps/web`, with every dependency pinned to
  the version upstream's lockfile resolves (pnpm 10 re-resolves the
  workspace); `@vercel/blob` and `@libsql/client` dropped; `h3` held at 1.15.11
  (upstream's own override) and `rolldown` at 1.2.12 for Nuxt's peer.
- Nitro's `cloudflare_module` preset; NuxtHub's `d1` and `cloudflare-r2`
  drivers; `wrangler.template.jsonc` binding DB, BLOB and AI.
- `server/utils/models.ts`, `capabilities.ts`, `app-secrets.ts`, `files.ts`;
  the session-password middleware; `/api/capabilities`, `/api/files/**`; the
  picker, the microphone and the sign-in button driven by what the
  deployment offers.
- `packages/db`: `010_chat`, `020_app_secrets`; the D1 and R2 roots;
  db-migrate.
- `tests/web` (the seam, the models, capabilities, the session key, the file
  helpers, the bindings) and `tests/db` (the migrations through the runner,
  against the app's Drizzle schema).
- Checked under `wrangler dev` with a Workers AI stand-in: a chat answered
  and persisted, an upload written to R2 and served back.

## NC2 — a baseline (NC-3)

turso-starter's machinery on this tree, as payload-website carried it: the
card and the build document (01-product, 02-docs), `.baseline/`, the rename
engine, the bootstrap helpers, the deployment-record renderer, the phase
pages, the context pack, and the baseline's tests through to an end-to-end
tier that serves the built Worker — refused unmigrated, then a chat streamed
through the stand-in, another visitor shut out, an upload signed in, and the
owner's secrets connected.
