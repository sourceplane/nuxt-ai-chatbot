// nuxt-auth-utils seals the session cookie — every visitor's, signed in or not,
// since the chats of a visitor who has not signed in belong to their session
// id — with NUXT_SESSION_PASSWORD, which it reads from process.env the first
// time a request uses a session. Upstream has its owner type one. Here, when
// no Worker secret sets it, it is the one the 020_app_secrets migration
// generated in the site's D1 database (server/utils/app-secrets.ts), put in
// place before any route reads a session.
export default defineEventHandler(async (event) => {
  if (process.env.NUXT_SESSION_PASSWORD) return
  process.env.NUXT_SESSION_PASSWORD = await appSecret(event, 'session')
})
