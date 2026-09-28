ALTER TABLE `emails` ADD `to_addr` text;--> statement-breakpoint
ALTER TABLE `emails` ADD `body_html` text;--> statement-breakpoint
ALTER TABLE `emails` ADD `body_text` text;--> statement-breakpoint
CREATE INDEX `emails_user_received` ON `emails` (`user_id`,`received_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `inbox_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_inbox_token` ON `users` (`inbox_token`);