-- 多用户：新增 users 表；flights / settings / emails 加 user_id。
-- 迁移前的数据先归到占位用户 'legacy'，第一个登录的用户会认领（见 src/worker/users.ts）。
-- SQLite 不能给已有数据的表直接加 NOT NULL 且无默认值的列，所以 flights 和 settings 重建表。
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `__new_flights` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`source` text NOT NULL,
	`flight_date` text NOT NULL,
	`airline` text NOT NULL,
	`flight_number` text NOT NULL,
	`operating_airline` text,
	`dep_airport` text NOT NULL,
	`arr_airport` text NOT NULL,
	`sched_dep_utc` text,
	`sched_arr_utc` text,
	`actual_dep_utc` text,
	`actual_arr_utc` text,
	`aircraft_type` text,
	`registration` text,
	`seat` text,
	`cabin` text,
	`purpose` text,
	`confirmation_code` text,
	`distance_km` integer,
	`duration_min` integer,
	`track_key` text,
	`email_id` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_flights` (
	`id`, `status`, `source`, `flight_date`, `airline`, `flight_number`, `operating_airline`,
	`dep_airport`, `arr_airport`, `sched_dep_utc`, `sched_arr_utc`, `actual_dep_utc`, `actual_arr_utc`,
	`aircraft_type`, `registration`, `seat`, `cabin`, `purpose`, `confirmation_code`,
	`distance_km`, `duration_min`, `track_key`, `email_id`, `notes`, `created_at`, `updated_at`, `user_id`
)
SELECT
	`id`, `status`, `source`, `flight_date`, `airline`, `flight_number`, `operating_airline`,
	`dep_airport`, `arr_airport`, `sched_dep_utc`, `sched_arr_utc`, `actual_dep_utc`, `actual_arr_utc`,
	`aircraft_type`, `registration`, `seat`, `cabin`, `purpose`, `confirmation_code`,
	`distance_km`, `duration_min`, `track_key`, `email_id`, `notes`, `created_at`, `updated_at`, 'legacy'
FROM `flights`;
--> statement-breakpoint
DROP TABLE `flights`;--> statement-breakpoint
ALTER TABLE `__new_flights` RENAME TO `flights`;--> statement-breakpoint
CREATE INDEX `flights_user_date` ON `flights` (`user_id`,`flight_date`);--> statement-breakpoint
CREATE INDEX `flights_user_status` ON `flights` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `flights_dedupe` ON `flights` (`user_id`,`airline`,`flight_number`,`flight_date`,`dep_airport`);--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`)
);
--> statement-breakpoint
INSERT INTO `__new_settings` (`user_id`, `key`, `value`, `updated_at`)
SELECT 'legacy', `key`, `value`, `updated_at` FROM `settings`;
--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
ALTER TABLE `emails` ADD `user_id` text;
