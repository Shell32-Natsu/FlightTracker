CREATE TABLE `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`received_at` text NOT NULL,
	`from_addr` text,
	`subject` text,
	`r2_key` text,
	`parse_status` text DEFAULT 'pending' NOT NULL,
	`parse_method` text,
	`error` text,
	`flight_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flights` (
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
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flights_dedupe` ON `flights` (`airline`,`flight_number`,`flight_date`,`dep_airport`);--> statement-breakpoint
CREATE INDEX `flights_date` ON `flights` (`flight_date`);--> statement-breakpoint
CREATE INDEX `flights_status` ON `flights` (`status`);--> statement-breakpoint
CREATE TABLE `lookup_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`response_json` text NOT NULL,
	`fetched_at` text NOT NULL
);
