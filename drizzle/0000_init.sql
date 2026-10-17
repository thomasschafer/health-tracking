CREATE TABLE `backup_canary` (
	`id` integer PRIMARY KEY NOT NULL,
	`nonce` text NOT NULL,
	`written_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`checked_at` text NOT NULL,
	`ok` integer NOT NULL,
	`detail` text NOT NULL,
	CONSTRAINT "backup_checks_kind" CHECK("backup_checks"."kind" in ('replica', 'export'))
);
--> statement-breakpoint
CREATE TABLE `bp_readings` (
	`session_id` text NOT NULL,
	`position` integer NOT NULL,
	`systolic` integer NOT NULL,
	`diastolic` integer NOT NULL,
	`heart_rate` integer,
	PRIMARY KEY(`session_id`, `position`),
	FOREIGN KEY (`session_id`) REFERENCES `bp_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bp_readings_position" CHECK("bp_readings"."position" between 1 and 5),
	CONSTRAINT "bp_readings_systolic" CHECK("bp_readings"."systolic" between 50 and 300),
	CONSTRAINT "bp_readings_diastolic" CHECK("bp_readings"."diastolic" between 20 and 200),
	CONSTRAINT "bp_readings_order" CHECK("bp_readings"."systolic" > "bp_readings"."diastolic"),
	CONSTRAINT "bp_readings_heart_rate" CHECK("bp_readings"."heart_rate" is null or "bp_readings"."heart_rate" between 20 and 250)
);
--> statement-breakpoint
CREATE TABLE `bp_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`taken_at` text NOT NULL,
	`note` text,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "bp_sessions_source" CHECK("bp_sessions"."source" in ('app', 'sheet-import'))
);
--> statement-breakpoint
CREATE INDEX `bp_sessions_taken_at` ON `bp_sessions` (`taken_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
