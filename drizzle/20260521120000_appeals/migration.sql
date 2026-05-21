CREATE TABLE IF NOT EXISTS `Appeal` (
	`id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`email` text,
	`relationship` text DEFAULT 'self' NOT NULL,
	`story` text NOT NULL,
	`evidenceJson` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submittedByUserId` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `appeals_login_idx` ON `Appeal` (`login`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `appeals_status_idx` ON `Appeal` (`status`);
