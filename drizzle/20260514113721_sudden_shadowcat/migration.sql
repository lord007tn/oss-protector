CREATE TABLE `AppEvent` (
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
CREATE TABLE `BotReport` (
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
CREATE TABLE `BotSignal` (
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
CREATE TABLE `GithubUser` (
	`id` text PRIMARY KEY,
	`githubUserId` text NOT NULL UNIQUE,
	`login` text NOT NULL,
	`avatarUrl` text,
	`htmlUrl` text,
	`accountType` text DEFAULT 'User' NOT NULL,
	`isKnownGithubBot` integer DEFAULT false NOT NULL,
	`firstSeenAt` integer DEFAULT (unixepoch()) NOT NULL,
	`lastSeenAt` integer DEFAULT (unixepoch()) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Installation` (
	`id` text PRIMARY KEY,
	`githubInstallationId` text NOT NULL UNIQUE,
	`accountGithubId` text,
	`accountLogin` text NOT NULL,
	`accountType` text DEFAULT 'Organization' NOT NULL,
	`repositorySelection` text DEFAULT 'all' NOT NULL,
	`suspendedAt` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `PullRequest` (
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
CREATE TABLE `Repository` (
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
CREATE TABLE `RiskProfile` (
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
CREATE TABLE `SourceImport` (
	`id` text PRIMARY KEY,
	`sourceName` text NOT NULL,
	`sourceUrl` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`itemCount` integer DEFAULT 0 NOT NULL,
	`importedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_events_event_idx` ON `AppEvent` (`eventName`);--> statement-breakpoint
CREATE INDEX `app_events_processed_idx` ON `AppEvent` (`processedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `bot_reports_comment_idx` ON `BotReport` (`commentId`);--> statement-breakpoint
CREATE INDEX `bot_reports_target_idx` ON `BotReport` (`targetUserId`);--> statement-breakpoint
CREATE INDEX `bot_reports_reporter_idx` ON `BotReport` (`reporterLogin`);--> statement-breakpoint
CREATE INDEX `bot_reports_status_idx` ON `BotReport` (`status`);--> statement-breakpoint
CREATE INDEX `bot_signals_target_idx` ON `BotSignal` (`targetUserId`);--> statement-breakpoint
CREATE INDEX `bot_signals_observed_idx` ON `BotSignal` (`observedAt`);--> statement-breakpoint
CREATE INDEX `github_users_login_idx` ON `GithubUser` (`login`);--> statement-breakpoint
CREATE INDEX `github_users_last_seen_idx` ON `GithubUser` (`lastSeenAt`);--> statement-breakpoint
CREATE INDEX `installations_account_login_idx` ON `Installation` (`accountLogin`);--> statement-breakpoint
CREATE UNIQUE INDEX `pull_requests_repo_number_idx` ON `PullRequest` (`repositoryId`,`number`);--> statement-breakpoint
CREATE INDEX `pull_requests_author_idx` ON `PullRequest` (`authorUserId`);--> statement-breakpoint
CREATE INDEX `pull_requests_last_seen_idx` ON `PullRequest` (`lastSeenAt`);--> statement-breakpoint
CREATE INDEX `repositories_installation_idx` ON `Repository` (`installationId`);--> statement-breakpoint
CREATE INDEX `repositories_owner_idx` ON `Repository` (`ownerLogin`);--> statement-breakpoint
CREATE INDEX `risk_profiles_status_idx` ON `RiskProfile` (`status`);--> statement-breakpoint
CREATE INDEX `risk_profiles_score_idx` ON `RiskProfile` (`score`);