import type { MigrationManifest } from "./types.js";

// Every migration the runner applies, in order, with the sha256 of its file.
// `pnpm --filter @saas/db run manifest:check` verifies the checksums;
// `manifest:fix` rewrites them after a migration file changes (only ever
// before that migration has been applied anywhere — an applied migration's
// checksum is immutable).
export const manifest: MigrationManifest = {
  version: 1,
  migrations: [
    {
      id: "000_control_baseline",
      context: "control",
      path: "000_control/up.sql",
      checksum:
        "c7f11499fa82d6fd2baa1af7fc75eeb73cd7be252af2e56841509c66001d638b",
      description:
        "Baseline control migration — creates the migration tracking schema",
    },
    {
      id: "010_chat",
      context: "app",
      path: "010_chat/up.sql",
      checksum:
        "86c5c9c9e58acf2911fc3efe2aa703afe2af9d7a810240d8f377eb99697b6865",
      description:
        "The chat's schema — users, chats, messages and votes — as the template's three Drizzle migrations leave it, every object guarded",
    },
    {
      id: "020_app_secrets",
      context: "app",
      path: "020_app_secrets/up.sql",
      checksum:
        "b63d30c126c15c301f0117c10e4715e693073b9791e24b533561d58167515fed",
      description:
        "The site's generated secret (the session cookie's key), created once in this database",
    },
  ],
};
