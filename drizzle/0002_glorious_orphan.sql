CREATE TABLE `group_module_toggles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`module_name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_module_toggles_group_module_unique` ON `group_module_toggles` (`group_id`,`module_name`);