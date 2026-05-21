ALTER TABLE `Installation` ADD `installerGithubId` text;
--> statement-breakpoint
CREATE INDEX `installations_installer_idx` ON `Installation` (`installerGithubId`);
