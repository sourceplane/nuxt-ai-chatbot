# Epics

Orun-style work programs. Each epic is a folder carrying `epic.yaml` (the
declaration the platform reads: slug, key prefix, milestones with exit
criteria and task keys) beside its doc set. The pull request that adds the
folder is the adoption; the merge creates the epic in the workspace.

| Epic | Cluster | Status | What it is |
|------|---------|--------|------------|
| [`nuxt-ai-chatbot/`](./nuxt-ai-chatbot/) | **NC** | In progress (NC0) | Vercel's Nuxt AI Chatbot — the Nuxt UI chat template — on Cloudflare Workers, D1, R2 and Workers AI, and an Orun baseline that instantiates it (NC2) |

As-built ≠ intent: what shipped lives in each epic's `IMPLEMENTATION-STATUS.md`.
