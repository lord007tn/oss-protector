CREATE TABLE `BackfillJob` (
	`id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `BackfillJob_login_unique` ON `BackfillJob` (`login`);
--> statement-breakpoint
CREATE INDEX `backfill_jobs_status_idx` ON `BackfillJob` (`status`);
