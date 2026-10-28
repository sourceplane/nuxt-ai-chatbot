# nuxt-ai-chatbot — operating contract (for humans and agents)

This is the standing guide to how this chat is deployed and operated.
Instance facts (live URLs, workspace, the secrets it uses) live in
[deployment.md](deployment.md), rendered from probed reality by the
bootstrap's `02-docs` phase; this file is the contract that stays true
between deployments. It is written to give an agent with repository read
access enough context to reason about and operate the chat without any
other source.

## What this system is

An AI chat — the Nuxt UI chat template — on Cloudflare alone, expressed as an
Orun component-native desired-state repo.

- **`infra/terraform/cloudflare-d1`** — one Cloudflare D1 database per
  deployed environment (`stage`, `prod`), applied by Terraform. After each
  apply it publishes a wiring document — `{d1_database_id, d1_database_name}`
  — as the Orun secret `WIRING_CLOUDFLARE_D1` on that environment.
- **`infra/terraform/cloudflare-r2`** — one R2 bucket per deployed
  environment, where the uploads live. After each apply it publishes
  `{r2_bucket_name}` as `WIRING_CLOUDFLARE_R2`.
- **`packages/db`** — the schema as migrations (`src/migrations/*/up.sql`,
  listed with their checksums in `src/manifest.ts`) and the runner that
  applies them to D1 over the REST API, recording each in a
  `_migrations_applied` table. `010_chat` is the chat's schema (users, chats,
  messages, votes); `020_app_secrets` generates the site's session key once,
  in the database.
- **`infra/db-migrate`** — runs that runner per environment: it plans offline
  on a pull request and applies on a merge, finding the database through
  `WIRING_CLOUDFLARE_D1`.
- **`apps/web`** — the chat: Nuxt 4 and Nuxt UI, built by Nitro's
  `cloudflare_module` preset into one Worker plus Static Assets. The page
  renders per request; `/api/chats` and its routes read and write D1 through
  the `DB` binding (NuxtHub's `hub:db`, Drizzle); uploads go to R2 through the
  `BLOB` binding (`hub:blob`) and are served back at `/api/files/<pathname>`;
  the answers stream from Workers AI through the `AI` binding
  (`server/utils/models.ts`), or from the Vercel AI Gateway's models once
  `AI_GATEWAY_API_KEY` is set. `/api/capabilities` says what the deployment
  offers. Nothing migrates the schema but db-migrate.
- **`tests/web`**, **`tests/db`** — the site's name, the models and what the
  deployment offers, the session key, the uploads' URLs and the Worker's
  bindings; and the migrations applied through the runner into real SQLite
  (vitest), verified on the `dev` rung.
- **`tooling/*`** — shared TypeScript and ESLint configuration, the wrangler
  renderer that turns `wrangler.template.jsonc` plus the wiring documents
  into `wrangler.jsonc`, the hand-off of the owner's secrets to the Worker
  (`tooling/wire/worker-secrets.mjs`), and the migration helpers (the
  manifest's checksum check, the local-D1 apply).

Environments: **`stage`** and **`prod`** are deployed; **`dev` is
verify-only by design** — lanes build and test, nothing deploys, and no
database or bucket exists for it (its build renders the committed fixture).

## Identity and tenancy

Every remote operation runs against ONE Orun workspace, declared in
`intent.yaml` under `execution.state.workspace` — committed, enforced, and
what CI uses. Do not remove it; headless credentials depend on it. If it
reads `ws_SET_ME`, the bootstrap had no workspace to write: set the real one
before anything else.

## How deployment works

1. Merge (or push) to `main`.
2. CI (`.github/workflows/ci.yml`) runs `orun plan --changed` — only
   components whose files changed are planned — then runs each planned lane
   with `orun run --remote-state`, authenticated by GitHub OIDC (the
   exchange resolves this repository's linked workspace server-side).
3. **The database and the bucket, then the schema, then the Worker**, per
   environment. `cloudflare-d1` and `cloudflare-r2` apply and publish their
   wiring documents. `db-migrate` declares an enforced `dependsOn` on
   `cloudflare-d1` for pushes to `main`, so it starts after that apply — a
   job resolves its secrets when it starts, so the document is there — and
   applies every pending migration. `apps/web` waits on all three the same
   way.
4. `apps/web` renders `wrangler.jsonc` from those documents (the real
   database id and bucket name), builds with `nuxt build` — without the
   owner's optional secrets in its environment — then sets those the
   environment has on the Worker as secrets (`wrangler secret bulk`),
   `wrangler deploy` ships `nuxt-ai-chatbot-web-<env>`, and a smoke test
   fetches `/`, `/api/chats` (the chat list read from the migrated database)
   and `/api/capabilities` (Workers AI's models offered).
5. `prod` deploys after `stage` has converged on the same commit
   (`environments.prod.promotion` in intent.yaml).
6. **The convergence run is the deployment.** A green run means every
   planned lane applied. Failed lanes are retried with
   `gh run rerun --failed`, which resumes the same execution.

On a pull request nothing applies or deploys: the D1 and R2 roots plan, the
migrations plan offline (their checksums verified), the chat builds and
dry-deploys, and the edges in step 3 are advisory.

Caveats that matter:

- A push that touches no component files plans zero lanes — that run is
  green and deployed nothing. Never treat "latest run green" as "site
  converged"; probe the URLs instead.
- A change to `intent.yaml`'s `environments` maps to no component and
  redeploys nothing on its own. Land it with a change under `apps/web`.
- `wrangler.jsonc` is generated. Edit `wrangler.template.jsonc`, run
  `pnpm run wire:fixture` and commit both; the deploy renders its own
  config from the template, so a stale committed render misleads local work.
- An applied migration is immutable: its checksum is recorded, and the
  runner refuses to run while a file no longer matches it. Change the
  schema with a NEW migration.
- Storing or changing an owner's secret redeploys nothing: run a deploy
  (below) so the build hands it to the Worker. A secret deleted from Orun
  stays on the Worker until `wrangler secret delete` removes it there.

## Secrets model

- **Brokered provider secrets**, minted per run from the workspace's
  Cloudflare connection — no long-lived values at rest, nothing to rotate by
  hand:
  - `CLOUDFLARE_API_TOKEN` (`workers-deploy`: Workers Scripts) — the chat's
    deploy, and setting the owner's secrets on the Worker;
  - `CLOUDFLARE_D1_TOKEN` (`d1-edit`: D1) — the D1 root's apply and the
    migration runner, which bind it as their `CLOUDFLARE_API_TOKEN`; the
    deploy token cannot touch D1;
  - `CLOUDFLARE_R2_TOKEN` (`r2-data`: R2) — the R2 root's apply;
  - `CLOUDFLARE_ACCOUNT_ID` — a connection fact all of them bind.
- **Wiring**: `WIRING_CLOUDFLARE_D1` and `WIRING_CLOUDFLARE_R2` on `stage`
  and `prod`, written by the roots' applies (lease-published), read by the
  migration runner and by the Worker's build as `WIRING_CLOUDFLARE_*_<ENV>`.
  They hold ids and names, not credentials.
- **Workers AI** needs no secret: the `AI` binding runs on the account the
  Worker deploys into, and its usage is that account's.
- **The owner's optional secrets**, Orun secrets of the product on each
  environment, set on the Worker by the deploy:
  - `NUXT_OAUTH_GITHUB_CLIENT_ID`, `NUXT_OAUTH_GITHUB_CLIENT_SECRET` — a
    GitHub OAuth app (callback `https://<the site>/auth/github`); without
    them the chat works signed out, and uploads and dictation are off;
  - `AI_GATEWAY_API_KEY` — the Vercel AI Gateway: the template's models, web
    search and dictation;
  - `NUXT_SESSION_PASSWORD` — replaces the generated session key (below).
- **The site's own secret** — the key nuxt-auth-utils seals the session
  cookie with — is generated once per database by the `020_app_secrets`
  migration (table `app_secrets`) and read by the Worker from D1. Rotating
  it signs everyone out, and visitors who never signed in lose the chats
  their old session owned.
- Inspect by NAME only: `orun secrets list --org <ws> --project` and
  `--env stage|prod`. No tooling in this repository prints a secret value,
  and no document in `ai/context/` may contain one.

## Verifying the system

```bash
# the chat on each environment (also recorded, probed, in deployment.md);
# /api/chats answers from D1, /api/capabilities names the models offered
curl -s https://nuxt-ai-chatbot-web-stage.your-workers-subdomain.workers.dev/api/chats
curl -s https://nuxt-ai-chatbot-web-prod.your-workers-subdomain.workers.dev/api/capabilities

# the wiring the migrations and deploys read, and workspace readiness
orun secrets list --org <ws> --env stage && orun secrets list --org <ws> --env prod
orun integrations list --org <ws> --json && orun cloud check --org <ws>
```

## Common operations

| task | how |
|---|---|
| change the chat's code | `apps/web/app` (the page and components), `apps/web/server` (the API), its name `apps/web/shared/utils/site.ts`; merge |
| change the models | `apps/web/shared/utils/models.ts` (Workers AI's list, the gateway's list, the default and the title model); merge |
| connect GitHub sign-in | a GitHub OAuth app per environment, its id and secret as the Orun secrets `NUXT_OAUTH_GITHUB_CLIENT_ID` and `NUXT_OAUTH_GITHUB_CLIENT_SECRET`, then deploy by hand |
| connect the AI Gateway | `AI_GATEWAY_API_KEY` as an Orun secret on the environment, then deploy by hand |
| change the schema (a table or a column) | edit `apps/web/server/db/schema.ts`, `pnpm --filter @app/web db:generate`, copy the SQL drizzle-kit writes into `packages/db/src/migrations/<NNN>_<name>/up.sql` (guarded where SQLite allows), list it in `packages/db/src/manifest.ts`, `pnpm --filter @saas/db run manifest:fix`, merge — db-migrate applies it before the chat redeploys |
| try the schema locally | `pnpm --filter @app/web db:migrate:local` applies every migration to wrangler's local D1 |
| deploy a change | merge to `main`; watch the run; failed lanes → `gh run rerun --failed` |
| deploy by hand | Orunbase's Deploy button, or `gh workflow run ci.yml --ref main -f environment=<env> [-f component=<a,b>]` — the named components (blank: every one) run in that environment as a merge runs them; started off `main` it is refused |
| redeploy without a change | edit the last line of `apps/web/component.yaml` (`# orun: redeploy <reason> <stamp>`) and merge — it is a deploy trigger, nothing reads it |
| query a live database | `wrangler d1 execute <name> --remote --command "SELECT count(*) FROM chats"` (the name is in the environment's `WIRING_CLOUDFLARE_D1`) |
| remove an owner's secret | delete it from Orun, then `pnpm exec wrangler secret delete <NAME> --name nuxt-ai-chatbot-web-<env>` from `apps/web` |
| add a binding (KV, another D1) | a Terraform root under `infra/terraform/` that publishes `WIRING_<ROOT>`, a token in `wrangler.template.jsonc`, its fixture entry, the root in the build's `--components`, the `WIRING_<ROOT>_<ENV>` secretEnv and an enforced `dependsOn` on it in `apps/web/component.yaml` |
| serve a custom domain | attach it to the Worker in Cloudflare, point the GitHub OAuth app's callback at it, then replace the placeholder `nuxt-ai-chatbot.example.com` in `intent.yaml`'s `BASE_DOMAIN` with it (README, "Custom domain") |
| headless credentials | `ORUN_TOKEN` (workspace-scoped) + `GITHUB_TOKEN` |

The deployment record is the bootstrap's `02-docs` phase. Re-running it (the
Orun console's Retry on that phase, or `orun new … --phase 02-docs`)
re-probes the URLs and re-renders [deployment.md](deployment.md); it is
idempotent.

## Evolution

D1 has no interactive transactions and caps a database's size (10 GB on
Workers Paid, 500 MB on Free); the chat's queries are single statements.
Structural changes follow the same contract that deployed the chat: add a
component under `apps/`, `infra/` or `packages/` with a `component.yaml`, land
it as a pull request, and the convergence run applies it.
