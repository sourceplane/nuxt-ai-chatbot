# web

The chat (the Nuxt UI chat template on Cloudflare Workers + Static Assets through Nitro's cloudflare_module preset, with D1, R2 and Workers AI, per environment)

A Cloudflare Worker with Static Assets (server rendering plus static files), deployed per environment by its CI lane.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Type         | `cloudflare-workers-assets-turbo`                                                                                  |
| Source       | `apps/web`                                                                                                         |
| Package      | `@app/web`                                                                                                         |
| Environments | `dev`: `verify` · `stage`: `verify`, `deploy` on a push to `main` · `prod`: `verify`, `deploy` on a push to `main` |

## Depends on

- **cloudflare-d1** — Provisions the Cloudflare D1 database the chat stores its users, chats and messages in, for stage and prod
- **cloudflare-r2** — Provisions the Cloudflare R2 bucket the chat stores uploads in (stage and prod)
- **db-migrate** — Applies the chat's schema and the site's generated session key (packages/db's migrations) to the stage and prod Cloudflare D1 databases

## Depended on by

- (none)
