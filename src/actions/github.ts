import type { ReasonCode } from "@/constants/reason-codes";
import {
	createBotReport,
	getPullRequestByRepositoryNumber,
	markRepositoryInactive,
	recalculateRiskProfile,
	recordAppEvent,
	recordSignal,
	upsertGithubUser,
	upsertInstallation,
	upsertPullRequest,
	upsertRepository,
} from "@/data-access/guard";
import { runtimeEnv } from "@/env";
import {
	validatePullRequestWithOpenRouter,
	validateReportWithOpenRouter,
} from "@/integrations/openrouter/validation";

type GithubUserPayload = {
	avatar_url?: null | string;
	html_url?: null | string;
	id: number;
	login: string;
	type?: null | string;
};

type GithubRepositoryPayload = {
	default_branch?: null | string;
	full_name: string;
	html_url?: null | string;
	id: number;
	name: string;
	owner?: GithubUserPayload;
	private?: boolean;
};

type GithubPullRequestPayload = {
	additions?: null | number;
	base?: { ref?: null | string };
	body?: null | string;
	changed_files?: null | number;
	closed_at?: null | string;
	commits?: null | number;
	deletions?: null | number;
	head?: { sha?: null | string };
	html_url: string;
	id: number;
	merged_at?: null | string;
	number: number;
	state: string;
	title: string;
	user: GithubUserPayload;
};

type GithubWebhookPayload = {
	action?: string;
	comment?: {
		author_association?: string;
		body?: string;
		html_url?: string;
		id?: number;
		user?: GithubUserPayload;
	};
	installation?: {
		account?: GithubUserPayload;
		id: number;
		repository_selection?: string;
		suspended_at?: null | string;
		target_type?: string;
	};
	issue?: {
		html_url?: string;
		number?: number;
		pull_request?: { html_url?: string; url?: string };
		title?: string;
		user?: GithubUserPayload;
	};
	pull_request?: GithubPullRequestPayload;
	repositories?: GithubRepositoryPayload[];
	repositories_added?: GithubRepositoryPayload[];
	repositories_removed?: GithubRepositoryPayload[];
	repository?: GithubRepositoryPayload;
	sender?: GithubUserPayload;
};

export interface GithubWebhookRequest {
	body: string;
	deliveryId?: null | string;
	eventName: string;
	skipSignatureVerification?: boolean;
	signature?: null | string;
}

const textEncoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer) =>
	[...new Uint8Array(buffer)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

const constantTimeEqual = (left: string, right: string) => {
	if (left.length !== right.length) {
		return false;
	}
	let result = 0;
	for (let index = 0; index < left.length; index += 1) {
		result |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return result === 0;
};

export const verifyGithubSignature = async ({
	body,
	signature,
}: {
	body: string;
	signature?: null | string;
}) => {
	const secret = runtimeEnv().GITHUB_WEBHOOK_SECRET;
	if (!secret) {
		const appUrl = runtimeEnv().VITE_APP_URL ?? "";
		return (
			runtimeEnv().ALLOW_UNSIGNED_GITHUB_WEBHOOKS === "true" ||
			appUrl.includes("localhost") ||
			appUrl.includes("127.0.0.1")
		);
	}
	if (!signature?.startsWith("sha256=")) {
		return false;
	}
	const key = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"],
	);
	const digest = await crypto.subtle.sign(
		"HMAC",
		key,
		textEncoder.encode(body),
	);
	return constantTimeEqual(`sha256=${toHex(digest)}`, signature);
};

const parseCommand = (body: string) => {
	const match = body.match(
		/(?:@(?:clankers-list|ossguard|botguard|this-product)\b|\/(?:clankers|ossguard|botguard))(?<command>.*)/is,
	);
	if (!match?.groups?.command) {
		return null;
	}
	const command = match.groups.command.trim();
	if (!/(bot|spam|abuse|report|flag|fake|bounty)/i.test(command)) {
		return null;
	}
	return command || body.trim();
};

const inferReasonCode = (command: string): ReasonCode => {
	const normalized = command.toLowerCase();
	if (normalized.includes("bounty")) {
		return "fake_bounty";
	}
	if (normalized.includes("duplicate")) {
		return "duplicate_pr";
	}
	if (normalized.includes("phish") || normalized.includes("credential")) {
		return "credential_phishing";
	}
	if (normalized.includes("malicious") || normalized.includes("backdoor")) {
		return "malicious_code";
	}
	if (normalized.includes("imperson")) {
		return "impersonation";
	}
	if (normalized.includes("ai") || normalized.includes("low quality")) {
		return "low_quality_ai";
	}
	if (normalized.includes("spam")) {
		return "spam_pr";
	}
	return "maintainer_report";
};

const isMaintainerAssociation = (association?: string) =>
	association === "OWNER" ||
	association === "MEMBER" ||
	association === "COLLABORATOR";

const upsertRepoFromPayload = async (
	repository: GithubRepositoryPayload,
	installationId?: null | number,
) =>
	upsertRepository({
		defaultBranch: repository.default_branch,
		fullName: repository.full_name,
		githubRepositoryId: repository.id,
		htmlUrl: repository.html_url,
		installationGithubId: installationId,
		isPrivate: repository.private,
		name: repository.name,
		ownerLogin: repository.owner?.login ?? repository.full_name.split("/")[0],
	});

const upsertInstallationFromPayload = async (
	installation: GithubWebhookPayload["installation"],
) => {
	if (!installation?.account) {
		return null;
	}
	return upsertInstallation({
		accountGithubId: installation.account.id,
		accountLogin: installation.account.login,
		accountType: installation.target_type ?? installation.account.type,
		githubInstallationId: installation.id,
		repositorySelection: installation.repository_selection,
		suspendedAt: installation.suspended_at,
	});
};

const handleInstallationRepositories = async (
	payload: GithubWebhookPayload,
) => {
	await upsertInstallationFromPayload(payload.installation);
	for (const repository of payload.repositories_added ??
		payload.repositories ??
		[]) {
		await upsertRepoFromPayload(repository, payload.installation?.id);
	}
	for (const repository of payload.repositories_removed ?? []) {
		await markRepositoryInactive(repository.id);
	}
};

const handlePullRequest = async (payload: GithubWebhookPayload) => {
	if (!(payload.repository && payload.pull_request)) {
		return;
	}
	await upsertInstallationFromPayload(payload.installation);
	const repository = await upsertRepoFromPayload(
		payload.repository,
		payload.installation?.id,
	);
	const author = await upsertGithubUser({
		avatarUrl: payload.pull_request.user.avatar_url,
		githubUserId: payload.pull_request.user.id,
		htmlUrl: payload.pull_request.user.html_url,
		login: payload.pull_request.user.login,
		type: payload.pull_request.user.type,
	});
	const pullRequestRecord = await upsertPullRequest({
		author,
		pullRequest: {
			additions: payload.pull_request.additions,
			baseRef: payload.pull_request.base?.ref,
			body: payload.pull_request.body,
			changedFiles: payload.pull_request.changed_files,
			closedAt: payload.pull_request.closed_at,
			commitCount: payload.pull_request.commits,
			deletions: payload.pull_request.deletions,
			githubPullRequestId: payload.pull_request.id,
			headSha: payload.pull_request.head?.sha,
			htmlUrl: payload.pull_request.html_url,
			mergedAt: payload.pull_request.merged_at,
			number: payload.pull_request.number,
			state: payload.pull_request.state,
			title: payload.pull_request.title,
		},
		repository,
	});

	if (
		payload.action === "opened" ||
		payload.action === "reopened" ||
		payload.action === "ready_for_review" ||
		payload.action === "synchronize"
	) {
		const analysis = await validatePullRequestWithOpenRouter({
			body: payload.pull_request.body,
			targetLogin: author.login,
			title: payload.pull_request.title,
			url: payload.pull_request.html_url,
		});
		if (analysis.verdict === "likely_abuse" && analysis.confidence >= 65) {
			await recordSignal({
				metadata: {
					aiConfidence: analysis.confidence,
					aiRationale: analysis.rationale,
					aiVerdict: analysis.verdict,
					reasonCode: analysis.reasonCode,
				},
				pullRequestId: pullRequestRecord.id,
				repositoryId: repository.id,
				signalType: "ai_pr_review",
				source: "openrouter",
				sourceUrl: payload.pull_request.html_url,
				targetUserId: author.id,
				weight: analysis.confidence >= 80 ? 22 : 12,
			});
			await recalculateRiskProfile(author.id);
		}
	}
};

const handleIssueComment = async (payload: GithubWebhookPayload) => {
	if (
		payload.action !== "created" ||
		!payload.comment?.body ||
		!payload.issue?.pull_request ||
		!(payload.repository && payload.issue.user && payload.comment.user)
	) {
		return;
	}

	const command = parseCommand(payload.comment.body);
	if (!command) {
		return;
	}

	await upsertInstallationFromPayload(payload.installation);
	const repository = await upsertRepoFromPayload(
		payload.repository,
		payload.installation?.id,
	);
	const targetUser = await upsertGithubUser({
		avatarUrl: payload.issue.user.avatar_url,
		githubUserId: payload.issue.user.id,
		htmlUrl: payload.issue.user.html_url,
		login: payload.issue.user.login,
		type: payload.issue.user.type,
	});
	const pullRequest = payload.issue.number
		? await getPullRequestByRepositoryNumber(
				repository.id,
				payload.issue.number,
			)
		: null;
	const reporterAssociation = payload.comment.author_association ?? "NONE";
	const reporterIsMaintainer = isMaintainerAssociation(reporterAssociation);
	const reasonCode = inferReasonCode(command);
	const validation = await validateReportWithOpenRouter({
		commandText: command,
		pullRequest: {
			body: pullRequest?.body ?? null,
			title: pullRequest?.title ?? payload.issue.title ?? null,
			url: pullRequest?.htmlUrl ?? payload.issue.pull_request.html_url ?? null,
		},
		reasonText: command,
		reporterAssociation,
		reporterIsMaintainer,
		targetLogin: targetUser.login,
	});

	await createBotReport({
		aiRationale: validation.rationale,
		aiVerdict: validation.verdict,
		commandText: command,
		commentId: payload.comment.id,
		confidence: validation.confidence,
		evidence: [
			{
				type: "github_issue_comment",
				url: payload.comment.html_url ?? payload.issue.html_url,
			},
			{
				type: "github_pull_request",
				url: pullRequest?.htmlUrl ?? payload.issue.pull_request.html_url,
			},
		],
		issueNumber: payload.issue.number,
		pullRequestId: pullRequest?.id ?? null,
		rawPayload: payload,
		reasonCode,
		reasonText: command,
		reporterAssociation,
		reporterGithubId: payload.comment.user.id,
		reporterIsMaintainer,
		reporterLogin: payload.comment.user.login,
		repositoryId: repository.id,
		sourceUrl: payload.comment.html_url ?? payload.issue.html_url ?? "",
		status: validation.status,
		targetUserId: targetUser.id,
	});
};

const handlePullRequestReviewComment = async (
	payload: GithubWebhookPayload,
) => {
	if (
		payload.action !== "created" ||
		!payload.comment?.body ||
		!(payload.repository && payload.pull_request && payload.comment.user)
	) {
		return;
	}

	const command = parseCommand(payload.comment.body);
	if (!command) {
		return;
	}

	await upsertInstallationFromPayload(payload.installation);
	const repository = await upsertRepoFromPayload(
		payload.repository,
		payload.installation?.id,
	);
	const targetUser = await upsertGithubUser({
		avatarUrl: payload.pull_request.user.avatar_url,
		githubUserId: payload.pull_request.user.id,
		htmlUrl: payload.pull_request.user.html_url,
		login: payload.pull_request.user.login,
		type: payload.pull_request.user.type,
	});
	const pullRequest =
		(await getPullRequestByRepositoryNumber(
			repository.id,
			payload.pull_request.number,
		)) ??
		(await upsertPullRequest({
			author: targetUser,
			pullRequest: {
				additions: payload.pull_request.additions,
				baseRef: payload.pull_request.base?.ref,
				body: payload.pull_request.body,
				changedFiles: payload.pull_request.changed_files,
				closedAt: payload.pull_request.closed_at,
				commitCount: payload.pull_request.commits,
				deletions: payload.pull_request.deletions,
				githubPullRequestId: payload.pull_request.id,
				headSha: payload.pull_request.head?.sha,
				htmlUrl: payload.pull_request.html_url,
				mergedAt: payload.pull_request.merged_at,
				number: payload.pull_request.number,
				state: payload.pull_request.state,
				title: payload.pull_request.title,
			},
			repository,
		}));
	const reporterAssociation = payload.comment.author_association ?? "NONE";
	const reporterIsMaintainer = isMaintainerAssociation(reporterAssociation);
	const reasonCode = inferReasonCode(command);
	const validation = await validateReportWithOpenRouter({
		commandText: command,
		pullRequest: {
			body: payload.pull_request.body,
			title: payload.pull_request.title,
			url: payload.pull_request.html_url,
		},
		reasonText: command,
		reporterAssociation,
		reporterIsMaintainer,
		targetLogin: targetUser.login,
	});

	await createBotReport({
		aiRationale: validation.rationale,
		aiVerdict: validation.verdict,
		commandText: command,
		commentId: payload.comment.id,
		confidence: validation.confidence,
		evidence: [
			{
				type: "github_pull_request_review_comment",
				url: payload.comment.html_url ?? payload.pull_request.html_url,
			},
			{
				type: "github_pull_request",
				url: payload.pull_request.html_url,
			},
		],
		issueNumber: payload.pull_request.number,
		pullRequestId: pullRequest.id,
		rawPayload: payload,
		reasonCode,
		reasonText: command,
		reporterAssociation,
		reporterGithubId: payload.comment.user.id,
		reporterIsMaintainer,
		reporterLogin: payload.comment.user.login,
		repositoryId: repository.id,
		sourceUrl: payload.comment.html_url ?? payload.pull_request.html_url,
		status: validation.status,
		targetUserId: targetUser.id,
	});
};

export const handleGithubWebhook = async ({
	body,
	deliveryId,
	eventName,
	skipSignatureVerification,
	signature,
}: GithubWebhookRequest) => {
	const verified =
		skipSignatureVerification ||
		(await verifyGithubSignature({ body, signature }));
	if (!verified) {
		return new Response("Invalid GitHub webhook signature", { status: 401 });
	}

	const payload = JSON.parse(body) as GithubWebhookPayload;
	try {
		if (
			eventName === "installation" ||
			eventName === "installation_repositories"
		) {
			await handleInstallationRepositories(payload);
		}
		if (eventName === "pull_request") {
			await handlePullRequest(payload);
		}
		if (eventName === "issue_comment") {
			await handleIssueComment(payload);
		}
		if (eventName === "pull_request_review_comment") {
			await handlePullRequestReviewComment(payload);
		}

		await recordAppEvent({
			action: payload.action,
			actorLogin: payload.sender?.login,
			deliveryId,
			eventName,
			installationGithubId: payload.installation?.id,
			rawPayload: payload,
			repositoryFullName: payload.repository?.full_name,
			status: "processed",
		});
		return Response.json({ ok: true });
	} catch (caught) {
		await recordAppEvent({
			action: payload.action,
			actorLogin: payload.sender?.login,
			deliveryId,
			error: caught instanceof Error ? caught.message : "Unknown webhook error",
			eventName,
			installationGithubId: payload.installation?.id,
			rawPayload: payload,
			repositoryFullName: payload.repository?.full_name,
			status: "failed",
		});
		throw caught;
	}
};
