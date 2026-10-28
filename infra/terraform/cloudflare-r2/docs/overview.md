# cloudflare-r2

Provisions the Cloudflare R2 bucket the chat stores uploads in (stage and prod)

Terraform-managed infrastructure, planned and applied per environment by its CI lane.

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Type         | `terraform`                                                                                          |
| Source       | `infra/terraform/cloudflare-r2`                                                                      |
| Environments | `stage`: `plan-only`, `apply` on a push to `main` · `prod`: `plan-only`, `apply` on a push to `main` |

## Depends on

- (none)

## Depended on by

- **web** — The chat (the Nuxt UI chat template on Cloudflare Workers + Static Assets through Nitro's cloudflare_module preset, with D1, R2 and Workers AI, per environment)
