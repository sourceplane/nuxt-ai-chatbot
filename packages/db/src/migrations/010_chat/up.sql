-- The chat's schema: users (GitHub sign-ins), chats, their messages and the
-- votes on them — the template's server/db/schema.ts as its three Drizzle
-- migrations leave it (apps/web/server/db/migrations/sqlite/0000-0002:
-- the tables, then votes, then chats.visibility), written as one migration
-- with every object guarded (IF NOT EXISTS), so a re-run, or a database that
-- already carries the tables, changes nothing.
-- Owner: app bounded context
CREATE TABLE IF NOT EXISTS `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `name` text NOT NULL,
  `avatar` text NOT NULL,
  `username` text NOT NULL,
  `provider` text NOT NULL,
  `provider_id` text NOT NULL,
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `users_provider_id_idx` ON `users` (`provider`, `provider_id`);

CREATE TABLE IF NOT EXISTS `chats` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text,
  `user_id` text NOT NULL,
  `visibility` text DEFAULT 'private' NOT NULL,
  `created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `chats_user_id_idx` ON `chats` (`user_id`);

CREATE TABLE IF NOT EXISTS `messages` (
  `id` text PRIMARY KEY NOT NULL,
  `chat_id` text NOT NULL,
  `role` text NOT NULL,
  `parts` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `messages_chat_id_idx` ON `messages` (`chat_id`);

CREATE TABLE IF NOT EXISTS `votes` (
  `chat_id` text NOT NULL,
  `message_id` text NOT NULL,
  `is_upvoted` integer NOT NULL,
  PRIMARY KEY(`chat_id`, `message_id`),
  FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
