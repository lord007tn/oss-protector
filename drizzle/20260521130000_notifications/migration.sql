CREATE TABLE IF NOT EXISTS `InstallationMaintainer` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`installationId` text NOT NULL,
	`role` text DEFAULT 'maintainer' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`installationId`) REFERENCES `Installation`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `installation_maintainers_user_install_idx` ON `InstallationMaintainer` (`userId`,`installationId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `installation_maintainers_user_idx` ON `InstallationMaintainer` (`userId`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Notification` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kind` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`read` integer DEFAULT false NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_user_idx` ON `Notification` (`userId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_user_read_idx` ON `Notification` (`userId`,`read`);
