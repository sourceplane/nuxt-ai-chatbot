# nuxt-ai-chatbot — Vercel's Nuxt AI Chatbot on Cloudflare

**The Nuxt UI chat template, kept as it is, on Cloudflare's own pieces: Nitro's
Workers preset for Vercel's hosting, NuxtHub's D1 and R2 drivers for Turso and
Vercel Blob, Workers AI through the Worker's binding for the AI Gateway — so a
fresh chat answers with no key — the schema as migrations applied before the
Worker deploys, and the session key generated in the database; and the
baseline that makes a copy of it somebody else's chat in one landing.**

| | |
|---|---|
| Status | In progress — NC0 on main |
| Upstream | [nuxt-ui-templates/chat](https://github.com/nuxt-ui-templates/chat) (MIT), `main` at `3891852` (the repository has no tags) |
| Reference | [ai-chatbot](https://github.com/sourceplane/ai-chatbot) — Workers AI by default, the gateway's models with its key, the Workers AI stand-in; [turso-starter](https://github.com/sourceplane/turso-starter) — D1, migrations, db-migrate; [blob-starter](https://github.com/sourceplane/blob-starter) — R2; [nuxt-boilerplate](https://github.com/sourceplane/nuxt-boilerplate) — Nitro's Workers preset |
| Key | `NC` |

## Read in this order

1. [design.md](design.md) — the template, how each Vercel piece maps to
   Cloudflare, the repository and the build, and the alternatives rejected.
2. [implementation-plan.md](implementation-plan.md) — the milestones.
3. [risks-and-open-questions.md](risks-and-open-questions.md) — what is not
   proven, and what was accepted.
4. [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) — what shipped, and
   every departure from the upstream template.

## Milestones

| Milestone | What it lands | Task |
|---|---|---|
| NC0 — the spec | the repository, its intent, CI, tooling and spec index; this doc set | NC-1 |
| NC1 — the chat on Workers, D1 and R2 | the template in `apps/web`, its models on Workers AI, its schema as migrations, the D1 and R2 roots, the tests | NC-2 |
| NC2 — a baseline | the console card, the build document, the context pack and the baseline's tests | NC-3 |
