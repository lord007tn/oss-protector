CREATE TABLE IF NOT EXISTS `AppEvent` (
	`id` text PRIMARY KEY,
	`deliveryId` text UNIQUE,
	`eventName` text NOT NULL,
	`action` text,
	`installationGithubId` text,
	`repositoryFullName` text,
	`actorLogin` text,
	`status` text DEFAULT 'processed' NOT NULL,
	`error` text,
	`rawPayloadJson` text,
	`processedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Appeal` (
	`id` text PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS `BackfillJob` (
	`id` text PRIMARY KEY,
	`login` text NOT NULL UNIQUE,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `BotReport` (
	`id` text PRIMARY KEY,
	`targetUserId` text NOT NULL,
	`reporterGithubId` text,
	`reporterLogin` text NOT NULL,
	`reporterAssociation` text DEFAULT 'NONE' NOT NULL,
	`reporterIsMaintainer` integer DEFAULT false NOT NULL,
	`repositoryId` text,
	`pullRequestId` text,
	`issueNumber` integer,
	`commentId` text,
	`sourceUrl` text NOT NULL,
	`commandText` text NOT NULL,
	`reasonCode` text DEFAULT 'maintainer_report' NOT NULL,
	`reasonText` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`aiVerdict` text,
	`aiRationale` text,
	`evidenceJson` text DEFAULT '[]' NOT NULL,
	`rawPayloadJson` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_BotReport_targetUserId_GithubUser_id_fk` FOREIGN KEY (`targetUserId`) REFERENCES `GithubUser`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_BotReport_repositoryId_Repository_id_fk` FOREIGN KEY (`repositoryId`) REFERENCES `Repository`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_BotReport_pullRequestId_PullRequest_id_fk` FOREIGN KEY (`pullRequestId`) REFERENCES `PullRequest`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `BotSignal` (
	`id` text PRIMARY KEY,
	`targetUserId` text NOT NULL,
	`repositoryId` text,
	`pullRequestId` text,
	`reportId` text,
	`signalType` text NOT NULL,
	`source` text NOT NULL,
	`sourceUrl` text,
	`weight` integer DEFAULT 0 NOT NULL,
	`metadataJson` text DEFAULT '{}' NOT NULL,
	`observedAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_BotSignal_targetUserId_GithubUser_id_fk` FOREIGN KEY (`targetUserId`) REFERENCES `GithubUser`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_BotSignal_repositoryId_Repository_id_fk` FOREIGN KEY (`repositoryId`) REFERENCES `Repository`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_BotSignal_pullRequestId_PullRequest_id_fk` FOREIGN KEY (`pullRequestId`) REFERENCES `PullRequest`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_BotSignal_reportId_BotReport_id_fk` FOREIGN KEY (`reportId`) REFERENCES `BotReport`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `GithubUser` (
	`id` text PRIMARY KEY,
	`githubUserId` text NOT NULL UNIQUE,
	`login` text NOT NULL,
	`avatarUrl` text,
	`htmlUrl` text,
	`accountType` text DEFAULT 'User' NOT NULL,
	`githubCreatedAt` integer,
	`followers` integer DEFAULT 0 NOT NULL,
	`following` integer DEFAULT 0 NOT NULL,
	`publicRepos` integer DEFAULT 0 NOT NULL,
	`totalStars` integer DEFAULT 0 NOT NULL,
	`totalContributions` integer DEFAULT 0 NOT NULL,
	`bio` text,
	`achievementsJson` text DEFAULT '[]' NOT NULL,
	`lastEnrichedAt` integer,
	`isKnownGithubBot` integer DEFAULT false NOT NULL,
	`firstSeenAt` integer DEFAULT (unixepoch()) NOT NULL,
	`lastSeenAt` integer DEFAULT (unixepoch()) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Installation` (
	`id` text PRIMARY KEY,
	`githubInstallationId` text NOT NULL UNIQUE,
	`accountGithubId` text,
	`accountLogin` text NOT NULL,
	`accountType` text DEFAULT 'Organization' NOT NULL,
	`installerGithubId` text,
	`repositorySelection` text DEFAULT 'all' NOT NULL,
	`suspendedAt` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `InstallationMaintainer` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`installationId` text NOT NULL,
	`role` text DEFAULT 'maintainer' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_InstallationMaintainer_installationId_Installation_id_fk` FOREIGN KEY (`installationId`) REFERENCES `Installation`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Notification` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`kind` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`read` integer DEFAULT false NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `PullRequest` (
	`id` text PRIMARY KEY,
	`repositoryId` text NOT NULL,
	`authorUserId` text NOT NULL,
	`githubPullRequestId` text NOT NULL UNIQUE,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`state` text DEFAULT 'open' NOT NULL,
	`htmlUrl` text NOT NULL,
	`headSha` text,
	`baseRef` text,
	`additions` integer DEFAULT 0 NOT NULL,
	`deletions` integer DEFAULT 0 NOT NULL,
	`changedFiles` integer DEFAULT 0 NOT NULL,
	`commitCount` integer DEFAULT 0 NOT NULL,
	`firstSeenAt` integer DEFAULT (unixepoch()) NOT NULL,
	`lastSeenAt` integer DEFAULT (unixepoch()) NOT NULL,
	`closedAt` integer,
	`mergedAt` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_PullRequest_repositoryId_Repository_id_fk` FOREIGN KEY (`repositoryId`) REFERENCES `Repository`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_PullRequest_authorUserId_GithubUser_id_fk` FOREIGN KEY (`authorUserId`) REFERENCES `GithubUser`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `RepoAccountDecision` (
	`id` text PRIMARY KEY,
	`repositoryId` text NOT NULL,
	`targetUserId` text NOT NULL,
	`decision` text NOT NULL,
	`note` text,
	`correctedByLogin` text NOT NULL,
	`correctedByUserId` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_RepoAccountDecision_repositoryId_Repository_id_fk` FOREIGN KEY (`repositoryId`) REFERENCES `Repository`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_RepoAccountDecision_targetUserId_GithubUser_id_fk` FOREIGN KEY (`targetUserId`) REFERENCES `GithubUser`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `RepoPolicy` (
	`repositoryId` text PRIMARY KEY,
	`enabled` integer,
	`analyzePrivateRepositories` integer,
	`minimumLikelyAbuseConfidence` integer,
	`trustedAuthorsJson` text,
	`ignoredPathsJson` text,
	`updatedByUserId` text,
	`updatedByLogin` text,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_RepoPolicy_repositoryId_Repository_id_fk` FOREIGN KEY (`repositoryId`) REFERENCES `Repository`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Repository` (
	`id` text PRIMARY KEY,
	`installationId` text,
	`githubRepositoryId` text NOT NULL UNIQUE,
	`fullName` text NOT NULL UNIQUE,
	`ownerLogin` text NOT NULL,
	`name` text NOT NULL,
	`defaultBranch` text,
	`htmlUrl` text,
	`isPrivate` integer DEFAULT false NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_Repository_installationId_Installation_id_fk` FOREIGN KEY (`installationId`) REFERENCES `Installation`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `RiskProfile` (
	`id` text PRIMARY KEY,
	`targetUserId` text NOT NULL UNIQUE,
	`status` text DEFAULT 'watch' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`reasonCodesJson` text DEFAULT '[]' NOT NULL,
	`summary` text,
	`importedSource` text,
	`reportCount` integer DEFAULT 0 NOT NULL,
	`validatedReportCount` integer DEFAULT 0 NOT NULL,
	`prCount` integer DEFAULT 0 NOT NULL,
	`commitCount` integer DEFAULT 0 NOT NULL,
	`repositoryCount` integer DEFAULT 0 NOT NULL,
	`firstSeenAt` integer DEFAULT (unixepoch()) NOT NULL,
	`lastSeenAt` integer DEFAULT (unixepoch()) NOT NULL,
	`lastSignalAt` integer,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT `fk_RiskProfile_targetUserId_GithubUser_id_fk` FOREIGN KEY (`targetUserId`) REFERENCES `GithubUser`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `SourceImport` (
	`id` text PRIMARY KEY,
	`sourceName` text NOT NULL,
	`sourceUrl` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`itemCount` integer DEFAULT 0 NOT NULL,
	`importedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Sponsor` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`logoUrl` text,
	`description` text,
	`tier` text DEFAULT 'supporter' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `UserPreferences` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`openrouterApiKeyEncrypted` text,
	`notificationKindsJson` text DEFAULT '["report","dispute","flag","correction","ok","info"]' NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `app_events_event_idx` ON `AppEvent` (`eventName`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `app_events_processed_idx` ON `AppEvent` (`processedAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `appeals_login_idx` ON `Appeal` (`login`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `appeals_status_idx` ON `Appeal` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `backfill_jobs_status_idx` ON `BackfillJob` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `bot_reports_comment_idx` ON `BotReport` (`commentId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bot_reports_target_idx` ON `BotReport` (`targetUserId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bot_reports_reporter_idx` ON `BotReport` (`reporterLogin`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bot_reports_status_idx` ON `BotReport` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bot_signals_target_idx` ON `BotSignal` (`targetUserId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bot_signals_observed_idx` ON `BotSignal` (`observedAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `github_users_login_idx` ON `GithubUser` (`login`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `github_users_last_seen_idx` ON `GithubUser` (`lastSeenAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `installations_account_login_idx` ON `Installation` (`accountLogin`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `installations_installer_idx` ON `Installation` (`installerGithubId`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `installation_maintainers_user_install_idx` ON `InstallationMaintainer` (`userId`,`installationId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `installation_maintainers_user_idx` ON `InstallationMaintainer` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_user_idx` ON `Notification` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_user_read_idx` ON `Notification` (`userId`,`read`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `pull_requests_repo_number_idx` ON `PullRequest` (`repositoryId`,`number`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pull_requests_author_idx` ON `PullRequest` (`authorUserId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pull_requests_last_seen_idx` ON `PullRequest` (`lastSeenAt`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `repo_account_decisions_repo_target_idx` ON `RepoAccountDecision` (`repositoryId`,`targetUserId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `repo_account_decisions_repo_idx` ON `RepoAccountDecision` (`repositoryId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `repo_account_decisions_target_idx` ON `RepoAccountDecision` (`targetUserId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `repositories_installation_idx` ON `Repository` (`installationId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `repositories_owner_idx` ON `Repository` (`ownerLogin`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `risk_profiles_status_idx` ON `RiskProfile` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `risk_profiles_score_idx` ON `RiskProfile` (`score`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sponsors_status_idx` ON `Sponsor` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sponsors_tier_idx` ON `Sponsor` (`tier`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_preferences_user_idx` ON `UserPreferences` (`userId`);