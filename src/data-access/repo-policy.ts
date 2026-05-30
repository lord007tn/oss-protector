import { eq } from "drizzle-orm";

import { database } from "@/db";
import { RepoPolicy } from "@/db/schema";
import type { RepositoryPolicy } from "@/helpers/repository-policy";
import { parseJsonArray } from "@/lib/json";

export interface RepoPolicyView {
	dbPolicy: Partial<RepositoryPolicy>;
	updatedAt: null | number;
	updatedByLogin: null | string;
}

export async function getRepoPolicy(
	repositoryId: string
): Promise<RepoPolicyView> {
	const [row] = await database
		.select()
		.from(RepoPolicy)
		.where(eq(RepoPolicy.repositoryId, repositoryId))
		.limit(1);
	if (!row) {
		return { dbPolicy: {}, updatedAt: null, updatedByLogin: null };
	}
	const dbPolicy: Partial<RepositoryPolicy> = {};
	if (row.enabled !== null) {
		dbPolicy.enabled = row.enabled;
	}
	if (row.analyzePrivateRepositories !== null) {
		dbPolicy.analyzePrivateRepositories = row.analyzePrivateRepositories;
	}
	if (row.minimumLikelyAbuseConfidence !== null) {
		dbPolicy.minimumLikelyAbuseConfidence = row.minimumLikelyAbuseConfidence;
	}
	if (row.trustedAuthorsJson) {
		dbPolicy.trustedAuthors = parseJsonArray<string>(row.trustedAuthorsJson)
			.filter((value): value is string => typeof value === "string")
			.map((login) => login.toLowerCase());
	}
	if (row.ignoredPathsJson) {
		dbPolicy.ignoredPaths = parseJsonArray<string>(row.ignoredPathsJson).filter(
			(value): value is string => typeof value === "string"
		);
	}
	return {
		dbPolicy,
		updatedAt: row.updatedAt,
		updatedByLogin: row.updatedByLogin,
	};
}

export interface UpsertRepoPolicyInput {
	policy: Partial<RepositoryPolicy>;
	repositoryId: string;
	updatedByLogin: string;
	updatedByUserId: string;
}

export async function upsertRepoPolicy(
	input: UpsertRepoPolicyInput
): Promise<void> {
	const now = Math.floor(Date.now() / 1000);
	const values = {
		analyzePrivateRepositories: input.policy.analyzePrivateRepositories ?? null,
		enabled: input.policy.enabled ?? null,
		ignoredPathsJson: input.policy.ignoredPaths
			? JSON.stringify(input.policy.ignoredPaths)
			: null,
		minimumLikelyAbuseConfidence:
			input.policy.minimumLikelyAbuseConfidence ?? null,
		repositoryId: input.repositoryId,
		trustedAuthorsJson: input.policy.trustedAuthors
			? JSON.stringify(input.policy.trustedAuthors)
			: null,
		updatedAt: now,
		updatedByLogin: input.updatedByLogin,
		updatedByUserId: input.updatedByUserId,
	};

	const [existing] = await database
		.select({ repositoryId: RepoPolicy.repositoryId })
		.from(RepoPolicy)
		.where(eq(RepoPolicy.repositoryId, input.repositoryId))
		.limit(1);

	if (existing) {
		await database
			.update(RepoPolicy)
			.set(values)
			.where(eq(RepoPolicy.repositoryId, input.repositoryId));
	} else {
		await database.insert(RepoPolicy).values(values);
	}
}

export async function clearRepoPolicy(repositoryId: string): Promise<void> {
	await database
		.delete(RepoPolicy)
		.where(eq(RepoPolicy.repositoryId, repositoryId));
}
