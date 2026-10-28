# nuxt-ai-chatbot

Vercel's [Nuxt AI Chatbot](https://vercel.com/templates/nuxt/nuxt-ai-chatbot)
— the [Nuxt UI chat template](https://github.com/nuxt-ui-templates/chat): an
AI chat with streaming answers, reasoning, chart and weather tools, chat
history, file uploads and GitHub sign-in — running on **Cloudflare Workers +
Static Assets** through Nitro's `cloudflare_module` preset, with its models on
**Workers AI** through the Worker's own binding, its chats in a **Cloudflare
D1** database and its uploads in an **R2** bucket, both provisioned by
Terraform through [Orun](https://github.com/sourceplane/orun) and the schema
applied by migrations, and packaged as an **Orun baseline**: one command takes
a new chat from nothing to live on stage and prod, in its own repository,
under its own name — in ONE landing. Workers Free is enough: the Worker is
about 1.2 MiB gzipped.

The template's code is the code. NuxtHub keeps its `hub:db` and `hub:blob`
with Cloudflare drivers — D1 in place of Turso, R2 in place of Vercel Blob —
and the port changes what the Workers runtime and an unattended deployment
force: the models default to Workers AI, so a fresh product chats with no
model key (the template's own AI Gateway models appear once its key is set,
as in [ai-chatbot](https://github.com/sourceplane/ai-chatbot)); the schema is
migrations applied before the Worker deploys; the session key is generated in
the database; uploads are served back by the Worker; and GitHub sign-in waits,
visibly, for its owner to connect it. What the baseline adds is everything
needed to make a copy of it somebody else's, built the way
[turso-starter](https://github.com/sourceplane/turso-starter) is. See
[`specs/epics/nuxt-ai-chatbot`](specs/epics/nuxt-ai-chatbot/README.md) for the
design, the milestones and the as-built status.

## Instantiating a product

```bash
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/nuxt-ai-chatbot
cd nuxt-ai-chatbot
orun new --blueprint repo-blueprint.yaml --out ~/sites/acme-chat --run-hooks --resume \
  --set reponame=acme-chat --set productname="Acme Chat" \
  --set githuborg=acme-inc --set subdomain=<workers-dev-subdomain>
```

Or, once the platform's registry lists it, from the Orun console (Baselines →
`nuxt-ai-chatbot` → Build). Two phases: **`01-product`** creates the
repository and lands the whole product as ONE pull request — intent, CI,
tooling, the D1 and R2 roots, the migrations, the chat and its tests — and
one convergence, per environment, applies the database and the bucket, then
the migrations, then deploys the chat with their names; **`02-docs`** records
the live deployment from probed facts. **[BOOTSTRAP.md](BOOTSTRAP.md)** is the
operator guide; [docs/phases/](docs/phases/README.md) has a page per phase.

The new repository receives the **product only** — the app, its D1 and R2
roots, its migrations and their runner, its tests, its CI, its tooling, a
README of its own and its operating contract — renamed throughout to the
product's name, repository, Cloudflare Worker, database and bucket names.
None of this repository's machinery ships. **No AI vendor key is asked for**:
the platform brokers none, and the chat runs on Workers AI.

| What makes it a baseline | Where |
|---|---|
| The console card (inputs, secrets, programme) | `blueprint.yaml` |
| The build document (modules, phases, hooks) | `repo-blueprint.yaml` |
| This tree's identity, and the bootstrap's task contracts | `.baseline/` |
| The rename engine | `tooling/rebrand/rebrand.mjs` |
| The bootstrap's helpers (deferrals, redeploy marker, work-tree strip) | `tooling/bootstrap/` |
| The deployment-record renderer | `hooks/render-deployment-docs.sh` |
| The product's README and context pack | `.baseline/product/README.md`, `ai/context/` |
| The baseline's tests: contract, wiring, leak, offline bootstrap, end to end | `testing/`, `.github/workflows/baseline.yml` |
| Cutting a `baseline-vN` tag | `.github/workflows/tag.yml` |

## What is here (the product)

| Surface | Where |
|---|---|
| The chat: its page, sidebar and history, the prompt, the model picker | `apps/web/app` |
| The API: chats, the streamed answer, votes, uploads and the files served back, what the deployment offers | `apps/web/server/api` |
| The models (Workers AI by default, the AI Gateway's with its key) | `apps/web/shared/utils/models.ts`, `apps/web/server/utils/models.ts` |
| The site's name, its generated session key | `apps/web/shared/utils/site.ts`, `apps/web/server/utils/app-secrets.ts` |
| Workers build, bindings and deploy contract | `apps/web/nuxt.config.ts`, `wrangler.template.jsonc` + `wiring.fixture.json` (→ the committed `wrangler.jsonc`), `component.yaml` |
| The D1 database and the R2 bucket (stage, prod) | `infra/terraform/cloudflare-d1`, `infra/terraform/cloudflare-r2` |
| The schema (migrations) and their runner | `packages/db`, run by `infra/db-migrate`; the Drizzle schema is `apps/web/server/db/schema.ts` |
| The wrangler renderer, the Worker-secret hand-off, the migration helpers | `tooling/wire`, `tooling/migrations` |
| Tests | `tests/web` (name, models, capabilities, session key, uploads, bindings), `tests/db` (the migrations through the runner, into real SQLite) |

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # render apps/web/wrangler.jsonc from the offline fixture
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # nuxt build → apps/web/.output (the Worker and its static assets)
```

```bash
pnpm --filter @app/web db:migrate:local   # the schema and the generated session key in wrangler's local D1
pnpm --filter @app/web preview            # wrangler dev over the built Worker, on the local D1 and R2
pnpm --filter @app/web dev                # nuxt dev — the bindings through wrangler's platform proxy
```

Workers AI has no local mode: both reach it remotely, so `wrangler login`
first.

## How it maps to Vercel

| Vercel-side | Here |
|---|---|
| Nuxt on Vercel (Nitro's Vercel preset) | One Cloudflare Worker (`.output/server/index.mjs`, Nitro's `cloudflare_module` preset) + Static Assets |
| The Vercel AI Gateway for every model (`AI_GATEWAY_API_KEY`) | Workers AI through the Worker's `AI` binding by default (`workers-ai-provider`; Kimi K2.6 for the chat, GLM 4.7 Flash for titles); upstream's three gateway models, its web search and its dictation offered only once `AI_GATEWAY_API_KEY` is set |
| Turso through NuxtHub's `libsql` driver (`TURSO_DATABASE_URL`) | Cloudflare D1 through NuxtHub's `d1` driver, the `DB` binding; its id rendered into `wrangler.jsonc` per environment from the D1 root's wiring document |
| Vercel Blob through NuxtHub (`BLOB_READ_WRITE_TOKEN`, a public URL per file) | Cloudflare R2 through NuxtHub's `cloudflare-r2` driver, the `BLOB` binding; files served back at `/api/files/<pathname>`, and handed to the model as their bytes |
| `nuxt db migrate` (NuxtHub applying the Drizzle migrations) | The schema as `packages/db` migrations (`010_chat`), applied by `infra/db-migrate` before the Worker deploys; NuxtHub never migrates |
| `NUXT_SESSION_PASSWORD` set in the project | Generated once per database by `020_app_secrets`; an Orun secret of the same name wins |
| GitHub OAuth keys set in the project (and a login button that fails without them) | Optional Orun secrets the deploy sets on the Worker; until they are set the sidebar says sign-in is not connected |
| Icons fetched by Nuxt Icon's server on a serverless host | Every icon the app names bundled with it (the server render reads the client bundle) |
| A database and a blob store created in the dashboard | `infra/terraform/cloudflare-d1` and `cloudflare-r2`, applied by Orun before the migrations and the Worker |
| Deploy on push | Orun applies the database and the bucket, migrates, and deploys `<repo>-web-{stage,prod}` on merge to `main` |
| "Deploy with Vercel" (clone the template) | `orun new --blueprint repo-blueprint.yaml` — a new repository, branded, deployed |

## How the database and the bucket reach the Worker

```
infra/terraform/cloudflare-d1 ──apply──► orun secret WIRING_CLOUDFLARE_D1 (stage, prod)
infra/terraform/cloudflare-r2 ──apply──► orun secret WIRING_CLOUDFLARE_R2 (stage, prod)
                                               │
                                               ▼
infra/db-migrate  dependsOn cloudflare-d1 (enforced on main) · secretEnv WIRING_CLOUDFLARE_D1
  apply:  packages/db's runner → POST …/d1/database/<id>/query, each pending migration once
                                               ▼
apps/web  dependsOn cloudflare-d1 + cloudflare-r2 + db-migrate (enforced on main)
          · secretEnv WIRING_CLOUDFLARE_D1_<ENV>, WIRING_CLOUDFLARE_R2_<ENV>
          · optionalSecretEnv the owner's GitHub OAuth app, AI Gateway key, session password
  build:  tooling/wire/live.mjs → wrangler.jsonc with the environment's database id and bucket
          (dev, verify-only, renders the fixture) → nuxt build (without the optional secrets)
          → tooling/wire/worker-secrets.mjs → `wrangler secret bulk` (deploy lanes only)
```

`wrangler.jsonc` is committed as the fixture render of
`wrangler.template.jsonc`, because the deploy lane's `verify-app-structure`
step checks the config exists before it builds; `testing/e2e.test.sh` fails
if the two disagree.

## CI

| Workflow | What it runs | Ships to a product |
|---|---|---|
| `ci.yml` | the Orun pipeline, and the only workflow a product carries: `orun plan --changed`, then one job per lane. A pull request runs the verify lanes (packages type-checked, linted, tested and built, both test suites, the chat built and dry-deployed per environment), except the bootstrap's own landings (`orun/BASE-*`), where `plan` alone is the check; a merge applies the D1 database and the R2 bucket, migrates the database, then deploys stage → prod. It plans nothing while `intent.yaml` names the placeholder workspace `ws_CHANGE_ME`, as this repository does. A manual run (Orunbase's Deploy button, or Run workflow on `main`) plans the environment and components it names under the push-to-main trigger, so they deploy as a merge deploys them | yes |
| `baseline.yml` | the baseline's own tiers: contract tests, the wiring path, the blueprint read by the pinned orun, the leak gate, the offline bootstrap with the product's own plan, the product built in the job tree, migrated, dry-deployed and served — a chat answered through a Workers AI stand-in, an upload written to R2 and back, the owner's secrets connected | no |
| `tag.yml` | cuts a `baseline-vN` tag (manual) | no |
