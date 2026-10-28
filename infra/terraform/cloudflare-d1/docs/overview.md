# cloudflare-d1

Provisions the Cloudflare D1 database the chat stores its users, chats and messages in, for stage and prod

Terraform-managed infrastructure, planned and applied per environment by its CI lane.

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Type         | `terraform`                                                                                          |
| Source       | `infra/terraform/cloudflare-d1`                                                                      |
| Environments | `stage`: `plan-only`, `apply` on a push to `main` · `prod`: `plan-only`, `apply` on a push to `main` |

## Depends on

- (none)

## Depended on by

- **db-migrate** — Applies the chat's schema and the site's generated session key (packages/db's migrations) to the stage and prod Cloudflare D1 databases
- **web** — The chat (the Nuxt UI chat template on Cloudflare Workers + Static Assets through Nitro's cloudflare_module preset, with D1, R2 and Workers AI, per environment)
