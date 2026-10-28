# nuxt-ai-chatbot — open risks

What is not yet proven or not yet decided. The full write-up of every risk,
including the accepted and resolved ones, is
`specs/epics/nuxt-ai-chatbot/risks-and-open-questions.md`; this page lists
only what is still live, so it should be short.

| ID | Risk | State | What closes it |
|---|---|---|---|
| NC-A | `baseline-v1` is not yet proven live; it is proven offline in Baseline CI (the offline bootstrap, the lanes' own steps, the chat served by `wrangler dev`: migrated, a chat answered through a Workers AI stand-in, an upload in R2, the owner's secrets connected) | OPEN | One console bootstrap from `baseline-v1` |
| NC-B | No real Workers AI answer offline — Workers AI has no local mode | OPEN | The live build's first chat |
| NC-C | `workers-ai-provider` is deprecated in favour of a gateway-centred `createAI` | WATCH | A replacement that drives the binding without a gateway |
| NC-H | An icon name built at runtime would be fetched from a CDN by the Worker | WATCH | Keep icon names literal; the bundle scan covers `app/` and `shared/` |

Accepted, and worth knowing before you change them: NC-D (the template from
`main`, pinned), NC-E (dictation and web search need the gateway), NC-F
(uploads public by URL), NC-G (the session key lives in D1), NC-I (nuxt-csurf's
per-build secret), NC-J (the e2e's AbortSignal flag).
