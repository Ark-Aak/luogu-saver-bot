CREATE TABLE `caves` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sender_name` text NOT NULL,
	`sender_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`raw_text` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `command_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` integer DEFAULT 0 NOT NULL,
	`alias` text NOT NULL,
	`target_command` text NOT NULL,
	`arg_template` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `command_alias_scope_alias_unique` ON `command_aliases` (`scope_type`,`scope_id`,`alias`);--> statement-breakpoint
CREATE TABLE `poll_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`option_index` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `poll_votes_poll_group_user_unique` ON `poll_votes` (`poll_id`,`group_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `polls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`creator_id` integer NOT NULL,
	`title` text NOT NULL,
	`options` text NOT NULL,
	`is_closed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE TABLE `binds` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`lid` integer NOT NULL
);
