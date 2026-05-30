ALTER TABLE `GithubUser` ADD `following` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `GithubUser` ADD `totalStars` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `GithubUser` ADD `totalContributions` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `GithubUser` ADD `bio` text;
--> statement-breakpoint
ALTER TABLE `GithubUser` ADD `achievementsJson` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `GithubUser` ADD `lastEnrichedAt` integer;
