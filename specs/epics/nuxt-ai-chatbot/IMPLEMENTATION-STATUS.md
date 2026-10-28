# nuxt-ai-chatbot — implementation status

| Milestone | State | Landed |
|---|---|---|
| NC0 — the spec | ✅ | NC-1 |
| NC1 — the chat on Workers, D1 and R2 | ✅ | NC-2 |
| NC2 — a baseline | planned | NC-3 |

## Departures from the upstream template

Everything not listed here is the template as it is on `main` at `3891852`.

| # | What | Why |
|---|---|---|
| 1 | The app lives in `apps/web` of a pnpm workspace on pnpm 10.12.1; upstream's `pnpm@12` pin, its `.github` CI, `renovate.json` and `.editorconfig` are not carried | The workspace's package manager; the product's CI is Orun's |
| 2 | Every dependency pinned to the version upstream's lockfile resolves; `h3` 1.15.11 a direct dependency (upstream's override, now also imported by the server utils); `rolldown` 1.2.12 a dev dependency | A fresh resolution picked a rolldown Nuxt 4.6.2 cannot load |
| 3 | `@vercel/blob` and `@libsql/client` removed | Vercel Blob and Turso are replaced |
| 4 | `nuxt.config.ts`: Nitro's `cloudflare_module` preset, `deployConfig` off (a `nitro:config` hook, since NuxtHub forces it on), NuxtHub's `d1` and `cloudflare-r2` drivers with dev migrations off, and Nuxt Icon's client bundle scanned over `app/` and `shared/` | Workers, D1, R2; icons rendered without a CDN fetch |
| 5 | `shared/utils/models.ts`: Workers AI's two models first, upstream's three marked `via: 'gateway'`; `DEFAULT_MODEL`, `TITLE_MODEL` | The models default to Workers AI |
| 6 | `server/api/chats/[id].post.ts`: the model resolved (`resolveModelId`), Workers AI or the gateway by id (`languageModel`), the title on the fast Workers AI model, Workers AI's thinking switch beside the providers' options, stored uploads inlined for the model | Workers AI by default; R2 has no public URLs |
| 7 | `server/api/capabilities.get.ts` (+ `server/utils/capabilities.ts`), `app/plugins/capabilities.ts`, `app/composables/useCapabilities.ts`; `useModels` offers only what can answer | The interface shows what the deployment has |
| 8 | The sidebar's "Login with GitHub" shows only with an OAuth app; otherwise "GitHub sign-in not connected". The microphone shows only with the gateway's key, and `/api/transcription/token` answers 404 without it. Web search is offered for Anthropic and OpenAI models only (upstream: every model but Google's) | Nothing is offered that would fail |
| 9 | `server/api/upload/[chatId].put.ts` answers each upload with `/api/files/<pathname>`; `server/api/files/[...pathname].get.ts` serves it from R2 | An R2 object has no URL |
| 10 | `server/middleware/session-password.ts`, `server/utils/app-secrets.ts` | The session key is generated in D1 |
| 11 | `shared/utils/site.ts` (`SITE_NAME`) is the page and Open Graph title (upstream: "Nuxt AI Chatbot template") | One rename seam |
| 12 | The user menu's "GitHub repository" links to the site's own repository; its "Deploy to Vercel" entry is gone | The product's own source |
| 13 | The schema is `packages/db`'s `010_chat`; `server/db/migrations` stays drizzle-kit's history for `nuxt db generate` | One schema, one ledger |
