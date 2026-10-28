-- The site's own secret, generated once in the database the first time this
-- migration runs on it, so a site built from the template needs no secret
-- typed anywhere to come up:
--   session  — NUXT_SESSION_PASSWORD, the key nuxt-auth-utils seals the
--              session cookie with (64 hex characters; it needs at least 32)
-- A Worker secret of the same upper-case name (wrangler secret put
-- NUXT_SESSION_PASSWORD) wins over the generated value. Rotating it is
-- updating its row (or setting the Worker secret), and signs everyone out —
-- anonymous visitors lose the chats their old session owned.
-- INSERT OR IGNORE: a value, once generated, is never replaced by a re-run.
CREATE TABLE IF NOT EXISTS app_secrets (
  name        TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO app_secrets (name, value) VALUES ('session', lower(hex(randomblob(32))));
