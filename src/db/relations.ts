import { defineRelations } from "drizzle-orm";
// Drizzle's beta relation helper consumes the schema namespace.
// biome-ignore lint/performance/noNamespaceImport: Drizzle's beta relation helper consumes the schema namespace.
import * as schema from "./schema";

export const relations = defineRelations(
	schema,
	({
		BotReport,
		BotSignal,
		GithubUser,
		Installation,
		PullRequest,
		Repository,
		RiskProfile,
		many,
		one,
	}) => ({
		GithubUser: {
			pullRequests: many.PullRequest({
				from: GithubUser.id,
				to: PullRequest.authorUserId,
			}),
			reportsTargeted: many.BotReport({
				from: GithubUser.id,
				to: BotReport.targetUserId,
			}),
			riskProfile: one.RiskProfile({
				from: GithubUser.id,
				to: RiskProfile.targetUserId,
			}),
			signals: many.BotSignal({
				from: GithubUser.id,
				to: BotSignal.targetUserId,
			}),
		},
		Installation: {
			repositories: many.Repository({
				from: Installation.id,
				to: Repository.installationId,
			}),
		},
		Repository: {
			installation: one.Installation({
				from: Repository.installationId,
				to: Installation.id,
			}),
			pullRequests: many.PullRequest({
				from: Repository.id,
				to: PullRequest.repositoryId,
			}),
			reports: many.BotReport({
				from: Repository.id,
				to: BotReport.repositoryId,
			}),
			signals: many.BotSignal({
				from: Repository.id,
				to: BotSignal.repositoryId,
			}),
		},
		PullRequest: {
			author: one.GithubUser({
				from: PullRequest.authorUserId,
				optional: false,
				to: GithubUser.id,
			}),
			repository: one.Repository({
				from: PullRequest.repositoryId,
				optional: false,
				to: Repository.id,
			}),
			reports: many.BotReport({
				from: PullRequest.id,
				to: BotReport.pullRequestId,
			}),
			signals: many.BotSignal({
				from: PullRequest.id,
				to: BotSignal.pullRequestId,
			}),
		},
		BotReport: {
			pullRequest: one.PullRequest({
				from: BotReport.pullRequestId,
				to: PullRequest.id,
			}),
			repository: one.Repository({
				from: BotReport.repositoryId,
				to: Repository.id,
			}),
			targetUser: one.GithubUser({
				from: BotReport.targetUserId,
				optional: false,
				to: GithubUser.id,
			}),
		},
		BotSignal: {
			pullRequest: one.PullRequest({
				from: BotSignal.pullRequestId,
				to: PullRequest.id,
			}),
			report: one.BotReport({
				from: BotSignal.reportId,
				to: BotReport.id,
			}),
			repository: one.Repository({
				from: BotSignal.repositoryId,
				to: Repository.id,
			}),
			targetUser: one.GithubUser({
				from: BotSignal.targetUserId,
				optional: false,
				to: GithubUser.id,
			}),
		},
		RiskProfile: {
			targetUser: one.GithubUser({
				from: RiskProfile.targetUserId,
				optional: false,
				to: GithubUser.id,
			}),
		},
	})
);
