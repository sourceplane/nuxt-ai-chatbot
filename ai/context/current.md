# nuxt-ai-chatbot — where this repository stands

The entry page for anyone (or any agent) picking this repository up. It is
this repository's own state and does not ship to a site built from it; the
two pages that do are [operations.md](operations.md) and
[deployment.md](deployment.md).

## What it is

Vercel's Nuxt AI Chatbot (nuxt-ui-templates/chat) — an AI chat with streaming
answers, tools, history, uploads and GitHub sign-in, one Nuxt app — built by
Nitro into one Cloudflare Worker with Static Assets, its models on Workers AI
through the Worker's own binding, its chats in a Cloudflare D1 database and
its uploads in an R2 bucket that Terraform provisions per environment, the
schema applied by db-migrate, packaged as an Orun baseline: `orun new
--blueprint repo-blueprint.yaml` builds a new chat in its own repository and
takes it to live on stage and prod in one landing (`01-product`), then
records what went live (`02-docs`). Workers Free is enough.

## Release

| | |
|---|---|
| Latest tag | `baseline-v1` — NC0 to NC2: the repository, the chat on Workers with D1, R2 and Workers AI, and the baseline (blueprint, phases, tests) |
| Proven live | Not yet: proven offline in Baseline CI only, a Workers AI stand-in answering the chat (risks NC-A, NC-B) |

## Where to read

| Question | Page |
|---|---|
| What shipped, and every departure from upstream | `specs/epics/nuxt-ai-chatbot/IMPLEMENTATION-STATUS.md` |
| Why it is built this way | [decisions.md](decisions.md), then `specs/epics/nuxt-ai-chatbot/design.md` |
| What could still go wrong | [open-risks.md](open-risks.md), then `specs/epics/nuxt-ai-chatbot/risks-and-open-questions.md` |
| How to instantiate it | `BOOTSTRAP.md`, `docs/phases/` |
| What the components are | each component's `docs/` (generated; `python3 tooling/catalog/gen-component-docs.py`) |

## Next

1. Bootstrap one chat from `baseline-v1` into a workspace with Cloudflare
   connected, chat with it on Workers AI, sign in once with a GitHub OAuth
   app, upload a file, and record the timings against the 7-minute estimate
   (closes NC-A and NC-B); then the registry row goes public with the
   measured minutes.
