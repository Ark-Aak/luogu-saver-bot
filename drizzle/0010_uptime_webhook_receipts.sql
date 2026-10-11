CREATE TABLE `uptime_webhook_receipts` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `event_id` text NOT NULL,
    `recipient_type` text NOT NULL,
    `recipient_id` integer NOT NULL,
    `delivered_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uptime_webhook_receipts_event_recipient_unique`
ON `uptime_webhook_receipts` (`event_id`, `recipient_type`, `recipient_id`);
