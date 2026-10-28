// https://nuxt.com/docs/api/configuration/nuxt-config
//
// Vercel's hosting becomes Nitro's Cloudflare Workers preset: `nuxt build`
// emits .output/server/index.mjs — the Worker, which renders every page and
// answers the API — and .output/public, the static assets, both deployed by one
// `wrangler deploy` of the committed wrangler.jsonc.
//
// NuxtHub keeps the template's own `hub:db` and `hub:blob` imports, with
// Cloudflare drivers in place of Turso and Vercel Blob:
//   - the database is Cloudflare D1 through the Worker's `DB` binding
//     (drizzle-orm/d1). Its schema is packages/db's migrations, applied by
//     the db-migrate component before every deploy and locally by
//     `pnpm db:migrate:local`, so NuxtHub never migrates it (D1 has no
//     build-time migration, and `applyMigrationsDuringDev` is off).
//     server/db/schema.ts stays the Drizzle schema the queries are typed
//     with, and server/db/migrations is drizzle-kit's history for
//     `nuxt db generate`.
//   - uploads go to an R2 bucket through the `BLOB` binding.
// The models are Workers AI through the `AI` binding by default
// (server/utils/models.ts); the AI Gateway's models, as upstream lists them,
// appear once its key is set.
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@comark/nuxt',
    '@nuxthub/core',
    'nuxt-auth-utils',
    'nuxt-csurf'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  experimental: {
    viewTransition: true
  },

  compatibilityDate: '2026-06-30',

  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: false,
      nodeCompat: true
    },
    experimental: {
      openAPI: true
    }
  },

  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'd1',
      applyMigrationsDuringDev: false
    },
    blob: {
      driver: 'cloudflare-r2',
      binding: 'BLOB'
    }
  },

  vite: {
    optimizeDeps: {
      include: ['striptags']
    }
  },

  hooks: {
    // NuxtHub turns Nitro's `deployConfig` on, which writes a wrangler.json
    // of its own into .output and a .wrangler/deploy redirect that wrangler
    // would follow instead of the committed wrangler.jsonc. The deploy config
    // is wrangler.jsonc (rendered from wrangler.template.jsonc), so it goes
    // back off once the modules have run.
    'nitro:config'(config) {
      config.cloudflare = { ...config.cloudflare, deployConfig: false }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Every icon the app names — in its components and in the data it renders
  // (the models, the files, the tools) — is bundled with it, and the bundle
  // serves the server render as well as the browser. On a serverless host Nuxt
  // Icon's server falls back to fetching a whole collection (megabytes of
  // JSON) from a CDN for an icon it lacks, which on a Worker would spend a
  // request's CPU budget; upstream leans on that fallback, and it is left for
  // a name only known at runtime.
  icon: {
    clientBundle: {
      scan: {
        globInclude: ['{app,shared}/**/*.{vue,ts}']
      }
    }
  }
})
