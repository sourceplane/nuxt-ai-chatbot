# nuxt-ai-chatbot — decisions

The choices that shape this repository, one line each, with where the full
reasoning lives. Superseded decisions stay listed, marked, so the history
reads in order.

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | The template from `main` at `3891852`, every dependency pinned to the version its lockfile resolves | The repository has no tags; a fresh pnpm 10 resolution picks a rolldown Nuxt 4.6.2 cannot load | risk NC-D |
| 2 | Nitro's `cloudflare_module` preset; the committed `wrangler.jsonc` is the deploy config, so Nitro writes none (a `nitro:config` hook undoes NuxtHub's `deployConfig: true`) | One Worker + Static Assets, deployed the way every sibling deploys | `apps/web/nuxt.config.ts` |
| 3 | Workers AI through the `AI` binding by default; upstream's gateway models, web search and dictation only with `AI_GATEWAY_API_KEY` | A fresh chat answers with no key; the gateway is not a composition Orun has — ai-chatbot's choice | `specs/epics/nuxt-ai-chatbot/design.md` |
| 4 | NuxtHub's `d1` and `cloudflare-r2` drivers for Turso and Vercel Blob | The template's `hub:db` and `hub:blob` imports stay as they are | design.md |
| 5 | The schema is `packages/db`'s migrations (`010_chat`: upstream's three Drizzle migrations folded into one, guarded), applied by db-migrate over the D1 API; NuxtHub never migrates | One place for the schema and one ledger, applied before the Worker that reads it (turso-starter's shape) | `tests/db` |
| 6 | The session key is generated in D1 by `020_app_secrets`; an Orun secret of the same name wins | A chat comes up with nothing typed | risk NC-G |
| 7 | GitHub sign-in and the gateway's key are optional Orun secrets; the build runs without them and the deploy sets them on the Worker | No bundle carries a secret; the chat works before either is connected | `apps/web/component.yaml`, `tooling/wire/worker-secrets.mjs` |
| 8 | Uploads served back at `/api/files/<pathname>`, inlined as bytes for the model | An R2 object has no public URL, and no provider can fetch the Worker's | design.md |
| 9 | Every icon the app names is bundled | Nuxt Icon's serverless fallback fetches whole collections from a CDN at render | risk NC-H |
| 10 | Four brokered keys in one reconcile: `workers-deploy`, `d1-edit`, `r2-data`, the account id | The deploy token can touch neither D1 nor R2; Workers AI needs none | `repo-blueprint.yaml` |
| 11 | One landing (`01-product`) then the record (`02-docs`), each checked in the build box | turso-starter's shape: the plan carries the order (database and bucket, then schema, then Worker) | `docs/phases/README.md` |
| 12 | `ci.yml` plans nothing while `intent.yaml` names `ws_CHANGE_ME`; no Checks workflow; stack-tectonic 0.19.0 | As every sibling | `.github/workflows/ci.yml`, `intent.yaml` |
| 13 | Component docs are generated from the manifests and checked in CI | A hand-written copy drifts silently | `tooling/catalog/gen-component-docs.py` |
| 14 | `subdomain` is read from the Cloudflare connection, never asked; the console asks for no domain | Both belong to the account or the owner, not to the build | `blueprint.yaml` |
