# apps/web — the chat

The Nuxt UI chat template ([nuxt-ui-templates/chat](https://github.com/nuxt-ui-templates/chat),
MIT — `LICENSE`): a streaming AI chat with history, uploads, charts and
weather tools and GitHub sign-in, built by Nuxt's Nitro (`cloudflare_module`
preset) into one Cloudflare Worker with Static Assets.

- `/` — a new chat; `/chat/<id>` — a chat and its history
- `/api/chats` — the visitor's chats (D1); `/api/chats/<id>` — streams an
  answer (POST); `/api/upload/<chatId>` — an upload to R2; `/api/files/<path>`
  — an upload served back
- `/api/capabilities` — the models this deployment can answer with, and
  whether dictation and GitHub sign-in are connected
- `/auth/github` — GitHub sign-in (once its OAuth app is set)

NuxtHub keeps the template's `hub:db` and `hub:blob`: the database is the
`DB` binding (Cloudflare D1, `drizzle-orm/d1`), the uploads the `BLOB` binding
(R2); both are rendered into `wrangler.jsonc` from `wrangler.template.jsonc`.
The models are Workers AI through the `AI` binding (`server/utils/models.ts`);
the template's own models, through the Vercel AI Gateway, appear once
`AI_GATEWAY_API_KEY` is set. The site's name is `shared/utils/site.ts`; its
session key is read from D1 (`server/utils/app-secrets.ts`).

```bash
pnpm db:migrate:local   # the schema and the generated session key in wrangler's local D1
pnpm build              # nuxt build → .output/ (the Worker and its static assets)
pnpm preview            # wrangler dev over the built Worker, on the local D1 and R2
pnpm dev                # nuxt dev on http://localhost:3000, the bindings through wrangler's platform proxy
pnpm db:generate        # after a change to server/db/schema.ts: drizzle-kit's SQL for the new migration
```

Workers AI has no local mode: `pnpm dev` and `pnpm preview` reach it
remotely, so run `wrangler login` first (`pnpm dev` cannot start its bindings
proxy without it).

How it is deployed — per environment, on merge to `main` — is the
repository's README and `component.yaml` beside this file.
