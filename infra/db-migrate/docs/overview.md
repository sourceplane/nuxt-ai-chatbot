# db-migrate

Applies the chat's schema and the site's generated session key (packages/db's migrations) to the stage and prod Cloudflare D1 databases

Applies this repository's ordered database migrations per environment: plan on pull requests, apply on merge to `main`.

|              |                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------ |
| Type         | `db-migrate`                                                                               |
| Source       | `infra/db-migrate`                                                                         |
| Environments | `stage`: `plan`, `apply` on a push to `main` · `prod`: `plan`, `apply` on a push to `main` |

## Depends on

- **db** — The chat's schema and the site's generated session key as migrations, and the runner that applies them to D1 (built by the db-migrate component before it plans or applies)
- **cloudflare-d1** — Provisions the Cloudflare D1 database the chat stores its users, chats and messages in, for stage and prod

## Depended on by

- **web** — The chat (the Nuxt UI chat template on Cloudflare Workers + Static Assets through Nitro's cloudflare_module preset, with D1, R2 and Workers AI, per environment)
