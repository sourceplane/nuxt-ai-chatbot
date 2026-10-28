import type { H3Event } from 'h3'
import { createError } from 'h3'

// The site's own secrets, generated once per database by packages/db's
// 020_app_secrets migration (table `app_secrets`), so a site built from the
// template needs none typed anywhere. A Worker secret of the upper-case name
// wins over the generated value. Read once per isolate, then cached.
const ENV_NAMES = {
  session: 'NUXT_SESSION_PASSWORD'
} as const

export type AppSecretName = keyof typeof ENV_NAMES

const cache = new Map<AppSecretName, string>()

// The part of the D1 binding this reads with.
interface D1Binding {
  prepare(sql: string): { bind(...values: unknown[]): { first(column: string): Promise<unknown> } }
}

export async function appSecret(event: H3Event, name: AppSecretName): Promise<string> {
  const fromEnv = process.env[ENV_NAMES[name]]
  if (fromEnv) return fromEnv
  const cached = cache.get(name)
  if (cached) return cached
  const d1 = event.context.cloudflare?.env?.DB as D1Binding | undefined
  let value: string | null = null
  if (d1) {
    try {
      value = await d1.prepare('SELECT value FROM app_secrets WHERE name = ?').bind(name).first('value') as string | null
    } catch {
      // No app_secrets table: the database has not been migrated yet.
      value = null
    }
  }
  if (!value) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Site secret unavailable',
      message: `No ${ENV_NAMES[name]}: the database has no generated \`${name}\` secret — apply packages/db's migrations (020_app_secrets), or set the Worker secret`
    })
  }
  cache.set(name, value)
  return value
}
