# nuxt-ai-chatbot

An AI chat — the [Nuxt UI chat template](https://github.com/nuxt-ui-templates/chat):
streaming answers with reasoning, chart and weather tools, chat history, file
uploads, GitHub sign-in, a command palette and light and dark mode — as one
Nuxt app on **Cloudflare Workers + Static Assets** through Nitro's
`cloudflare_module` preset. The models are **Workers AI**, through the
Worker's own binding, so it chats with no AI key. The chats are in a
**Cloudflare D1** database and the uploads in an **R2** bucket, both
provisioned by Terraform per environment; the schema is applied by
migrations before every deploy.

## Live deployment

<!-- 02-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace and the secrets the site uses into
[ai/context/deployment.md](ai/context/deployment.md); how the site deploys
and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## What is here

| Surface | Where |
|---|---|
| The chat page, its sidebar and history, the prompt and its menu | `apps/web/app` |
| The API: chats, the streamed answer, votes, uploads, the files served back | `apps/web/server/api` |
| Which models answer — Workers AI, or the AI Gateway once its key is set | `apps/web/shared/utils/models.ts`, `apps/web/server/utils/models.ts` |
| What the interface offers (models, dictation, sign-in) | `apps/web/server/utils/capabilities.ts` |
| GitHub sign-in | `apps/web/server/routes/auth/github.get.ts` (nuxt-auth-utils) |
| The site's name | `apps/web/shared/utils/site.ts` |
| The session key (read from D1) | `apps/web/server/utils/app-secrets.ts`, `apps/web/server/middleware/session-password.ts` |
| Workers build, bindings and deploy contract | `apps/web/nuxt.config.ts`, `wrangler.template.jsonc` + `wiring.fixture.json` (→ `wrangler.jsonc`), `component.yaml` |
| The D1 database and the R2 bucket (stage, prod) | `infra/terraform/cloudflare-d1`, `infra/terraform/cloudflare-r2` |
| The schema (migrations) and their runner | `packages/db`, applied by `infra/db-migrate`; the Drizzle schema the queries use is `apps/web/server/db/schema.ts` |
| Tests | `tests/web`, `tests/db` (vitest) |

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
pnpm --filter @app/web dev                # nuxt dev on http://localhost:3000, the bindings through wrangler's platform proxy
```

Workers AI has no local mode, so both reach it remotely: run `wrangler login`
first.

## The models

The chat answers with **Workers AI** — Kimi K2.6 by default, GLM 4.7 Flash
for the titles — through the Worker's `AI` binding, on the Cloudflare account
it deploys into: nothing to configure, and the account's Workers AI usage is
what it costs. The template's own models — Claude Haiku 4.5, Gemini 3 Flash
and GPT-5 Nano, through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) —
and its web search and dictation appear once you give it the gateway's key:
store it as the product's Orun secret `AI_GATEWAY_API_KEY` on each
environment, then redeploy (below). The picker only ever shows what can
answer.

## Signing in with GitHub

The chat works without an account: each visitor's chats belong to their
browser session. GitHub sign-in keeps them across devices and turns on
uploads and dictation. To connect it:

1. Create a GitHub OAuth app (GitHub → Settings → Developer settings → OAuth
   Apps) with the callback URL `https://<the site>/auth/github`, one per
   environment (stage and prod have different URLs).
2. Store its client id and a client secret as the product's Orun secrets
   `NUXT_OAUTH_GITHUB_CLIENT_ID` and `NUXT_OAUTH_GITHUB_CLIENT_SECRET` on
   that environment.
3. Redeploy (below). Until then the sidebar says sign-in is not connected.

## Secrets

The session key — what nuxt-auth-utils seals the session cookie with — is
generated once per database by the `020_app_secrets` migration and read by
the Worker from D1, so nothing is typed anywhere. To set one yourself, store
the product's Orun secret `NUXT_SESSION_PASSWORD` (32 characters or more);
it wins over the generated value. Every optional secret above reaches the
Worker the same way: the deploy runs the build without it, then sets it on
the Worker as a Worker secret (`tooling/wire/worker-secrets.mjs`), so no
bundle carries it. A secret you delete from Orun stays on the Worker until
`pnpm exec wrangler secret delete <NAME> --name nuxt-ai-chatbot-web-<env>`
(from `apps/web`) removes it there.

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. Per environment, the D1 database and
the R2 bucket apply first, then the migrations, then the chat builds with
that environment's database and bucket and deploys — to `stage`, then to
`prod` once stage has converged on the same commit; `dev` only verifies. The
Worker is `nuxt-ai-chatbot-web-<env>` on your account's workers.dev
subdomain, and every deploy is smoke-tested over HTTP: the page, the chat
list read from D1, and the models offered. A pull request runs the same
pipeline's verify lanes: the packages type-checked, linted, tested and
built, both test suites, and the chat built and dry-deployed for each
environment, with nothing deployed. (A push to `main` applies, migrates,
builds and deploys.)

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare tokens (one to deploy, one scoped to D1, one to R2) and the
account id are brokered per run from the workspace's Cloudflare connection,
and the database ids and bucket names travel as Orun secrets; nothing
provider-shaped is stored in the repository or in GitHub.

**Deploy by hand.** Orunbase's **Deploy** button on a component, or **Run
workflow** on the CI workflow in GitHub's Actions tab (on `main`), runs
`ci.yml` for the environment and components you pick, and each one deploys
exactly as a merge would deploy it. Leave the component blank to redeploy
every component in that environment, with nothing changed: after storing a
secret, say. A component with nothing to run in that environment (a test
suite in `prod`) is left out with a notice.

## Custom domain

The site answers on workers.dev from its first deploy. To serve it on your
own domain:

1. Add the domain to the Cloudflare account the site deploys into, and attach
   it to the Worker (dashboard → Workers & Pages →
   `nuxt-ai-chatbot-web-prod` → Settings → Domains & Routes → Add →
   Custom domain).
2. Point the GitHub OAuth app's callback URL at it
   (`https://<your domain>/auth/github`). The chat builds no absolute link of
   its own, so nothing else changes.

   The site was born with the reserved placeholder
   `nuxt-ai-chatbot.example.com` where its domain goes: `BASE_DOMAIN` under
   each environment in `intent.yaml`. Replace it with your domain, and land
   it with a change under `apps/web` so the merge redeploys the site.

## Credits

The chat is the Nuxt UI chat template
([nuxt-ui-templates/chat](https://github.com/nuxt-ui-templates/chat), MIT —
`apps/web/LICENSE`), Vercel's Nuxt AI Chatbot. The Workers AI stand-in its
tests use and the shape of its model catalogue follow
[sourceplane/ai-chatbot](https://github.com/sourceplane/ai-chatbot).
