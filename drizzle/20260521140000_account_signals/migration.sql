ALTER TABLE `GithubUser` ADD `githubCreatedAt` integer;
--> statement-breakpoint
ALTER TABLE `GithubUser` ADD `followers` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `GithubUser` ADD `publicRepos` integer DEFAULT 0 NOT NULL;
