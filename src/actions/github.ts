import type { ReasonCode } from "@/constants/reason-codes";
import {
	allowlistUser,
	correctionAlreadyApplied,
	createRiskReport,
	dismissReportsForUser,
	getPullRequestByRepositoryNumber,
	markRepositoryInactive,
	recalculateRiskProfile,
	recordAppEvent,
	replacePullRequestAiSignal,
	resetRiskProfile,
	upsertGithubUser,
	upsertInstallation,
	upsertPullRequest,
	upsertRepository,
	validateLatestReportForUser,
} from "@/data-access/directory";
import {
	type CorrectionCommand,
	type GithubRepositoryPayload,
	type GithubUserPayload,
	type GithubWebhookPayload,
	type GithubWebhookRequest,
	inferReasonCode,
	isMaintainerAssociation,
	isOwnBotUser,
	type PullRequestFileSummary,
	parseCommand,
	parseCorrectionCommand,
	parseRepositoryFullName,
	verifyGithubSignature,
} from "@/helpers/github-webhook";
import {
	createCorrectionAcknowledgementComment,
	createInstallationClient,
	createPullRequestAnalysisComment,
	createReportAcknowledgementComment,
} from "@/integrations/github/comments";
import {
	validatePullRequestWithOpenRouter,
	validateReportWithOpenRouter,
} from "@/integrations/openrouter/validation";
import { aiPrSignalWeight } from "@/lib/scoring";

const acknowledgeReport = async ({
	confidence,
	installationId,
	issueNumber,
	reasonCode,
	repositoryFullName,
	sourceCommentId,
	status,
	targetLogin,
	verdict,
	evidenceSummary,
	scoreBreakdown,
}: {
	confidence: number;
	evidenceSummary?: null | string;
	installationId?: null | number;
	issueNumber?: null | number;
	reasonCode: ReasonCode;
	repositoryFullName?: null | string;
	scoreBreakdown?: null | {
		aiQuality: number;
		contributionValue: number;
		credentialRisk: number;
		farmingRisk: number;
		maliciousRisk: number;
		novelty: number;
	};
	sourceCommentId?: null | number | string;
	status: "dismissed" | "needs_review" | "pending" | "validated";
	targetLogin: string;
	verdict?: null | string;
}) => {
	try {
		await createReportAcknowledgementComment({
			confidence,
			evidenceSummary,
			installationId,
			issueNumber,
			reasonCode,
			repositoryFullName,
			scoreBreakdown,
			sourceCommentId,
			status,
			targetLogin,
			verdict,
		});
	} catch (caught) {
		console.warn("Failed to create GitHub report acknowledgement", caught);
	}
};

const fetchPullRequestFiles = async ({
	installationId,
	pullNumber,
	repositoryFullName,
}: {
	installationId?: null | number;
	pullNumber: number;
	repositoryFullName: string;
}): Promise<PullRequestFileSummary[]> => {
	const repository = parseRepositoryFullName(repositoryFullName);
	if (!repository) {
		return [];
	}
	const octokit = await createInstallationClient({
		installationId,
	});
	if (!octokit) {
		return [];
	}

	const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
		owner: repository.owner,
		per_page: 100,
		pull_number: pullNumber,
		repo: repository.repo,
	});

	return files.slice(0, 40).map((file) => ({
		additions: file.additions,
		changes: file.changes,
		deletions: file.deletions,
		filename: file.filename,
		patch: file.patch?.slice(0, 1800),
		status: file.status,
	}));
};

const postPullRequestAnalysis = async ({
	analysis,
	authorLogin,
	fileCount,
	headSha,
	installationId,
	issueNumber,
	repositoryFullName,
}: {
	analysis: Awaited<ReturnType<typeof validatePullRequestWithOpenRouter>>;
	authorLogin?: null | string;
	fileCount: number;
	headSha?: null | string;
	installationId?: null | number;
	issueNumber: number;
	repositoryFullName: string;
}) => {
	try {
		await createPullRequestAnalysisComment({
			authorLogin,
			causes: analysis.causes,
			confidence: analysis.confidence,
			evidenceSummary: analysis.evidenceSummary,
			fileCount,
			headSha,
			installationId,
			issueNumber,
			rationale: analysis.rationale,
			reasonCode: analysis.reasonCode,
			repositoryFullName,
			scoreBreakdown: analysis.scoreBreakdown,
			verdict: analysis.verdict,
		});
	} catch (caught) {
		console.warn("Failed to create GitHub PR analysis comment", caught);
	}
};

const upsertRepoFromPayload = async (
	repository: GithubRepositoryPayload,
	installationId?: null | number
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

const upsertInstallationFromPayload = (
	installation: GithubWebhookPayload["installation"]
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
	payload: GithubWebhookPayload
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

const PR_ANALYSIS_ACTIONS = new Set([
	"opened",
	"reopened",
	"ready_for_review",
	"synchronize",
]);

const PR_TRACKING_ACTIONS = new Set([
	...PR_ANALYSIS_ACTIONS,
	"edited",
	"labeled",
	"unlabeled",
	"assigned",
	"unassigned",
]);

const handlePullRequest = async (payload: GithubWebhookPayload) => {
	if (!(payload.repository && payload.pull_request)) {
		return;
	}
	// Skip everything except the actions we actually act on. closed/merged
	// trigger this webhook too and would otherwise cost an OpenRouter call
	// just to record state we already have. Tracking actions still update
	// the PullRequest row but don't re-run the analysis pipeline.
	if (
		!(
			PR_TRACKING_ACTIONS.has(payload.action ?? "") ||
			PR_ANALYSIS_ACTIONS.has(payload.action ?? "")
		)
	) {
		return;
	}
	await upsertInstallationFromPayload(payload.installation);
	const repository = await upsertRepoFromPayload(
		payload.repository,
		payload.installation?.id
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

	if (PR_ANALYSIS_ACTIONS.has(payload.action ?? "")) {
		// Repo-insider PRs aren't the abuse vector this tool is designed for.
		// An OWNER/MEMBER/COLLABORATOR opening a PR on a repo they have
		// write access to is a normal workflow — we'd just be flagging
		// commit-hygiene smells (like accidentally committing .env) as if
		// they were external attacks. Skip the AI pipeline entirely; still
		// upserted the PR row above so we have the audit trail.
		const authorAssociation = payload.pull_request.author_association ?? "NONE";
		if (isMaintainerAssociation(authorAssociation)) {
			console.log(
				`pr-analysis: skipped, author_association=${authorAssociation} pr=${payload.repository.full_name}#${payload.pull_request.number}`
			);
			return;
		}

		const files = await fetchPullRequestFiles({
			installationId: payload.installation?.id,
			pullNumber: payload.pull_request.number,
			repositoryFullName: payload.repository.full_name,
		});
		const analysis = await validatePullRequestWithOpenRouter({
			body: payload.pull_request.body,
			files,
			targetLogin: author.login,
			title: payload.pull_request.title,
			url: payload.pull_request.html_url,
		});
		await postPullRequestAnalysis({
			analysis,
			authorLogin: author.login,
			fileCount: files.length || (payload.pull_request.changed_files ?? 0),
			headSha: payload.pull_request.head?.sha,
			installationId: payload.installation?.id,
			issueNumber: payload.pull_request.number,
			repositoryFullName: payload.repository.full_name,
		});
		const aiSignalWeight =
			analysis.verdict === "likely_abuse"
				? aiPrSignalWeight(analysis.confidence)
				: 0;
		// Replace any prior ai_pr_review signal on this same PR. Without this
		// dedupe, repeated synchronizes on a single PR stack the score (we
		// caught nassimna at score=100 from 6 signals on one PR).
		await replacePullRequestAiSignal({
			aiSignalWeight,
			analysis,
			pullRequestId: pullRequestRecord.id,
			pullRequestUrl: payload.pull_request.html_url,
			repositoryId: repository.id,
			targetUserId: author.id,
		});
		await recalculateRiskProfile(author.id);
	}
};

const acknowledgeCorrection = async (input: {
	correctedByLogin: string;
	crossTargetMention?: null | string;
	installationId?: null | number;
	issueNumber?: null | number;
	kind: CorrectionCommand["kind"];
	note?: null | string;
	repositoryFullName?: null | string;
	sourceCommentId?: null | number | string;
	targetLogin: string;
}) => {
	try {
		await createCorrectionAcknowledgementComment(input);
	} catch (caught) {
		console.warn("Failed to post correction acknowledgement", caught);
	}
};

const handleMaintainerCorrection = async ({
	correction,
	installationId,
	issueNumber,
	pullRequestId,
	repositoryFullName,
	repositoryId,
	reporterLogin,
	sourceCommentId,
	sourceUrl,
	targetLogin,
	targetUserId,
}: {
	correction: CorrectionCommand;
	installationId?: null | number;
	issueNumber?: null | number;
	pullRequestId?: null | string;
	repositoryFullName?: null | string;
	repositoryId?: null | string;
	reporterLogin: string;
	sourceCommentId?: null | number | string;
	sourceUrl: string;
	targetLogin: string;
	targetUserId: string;
}) => {
	const correctionInput = {
		correctedByLogin: reporterLogin,
		pullRequestId,
		repositoryId,
		sourceUrl,
		targetUserId,
	};

	// Idempotency guard: if GitHub re-delivers this webhook, the correction signal
	// will already exist for (sourceUrl, kind). Skip re-applying so we don't
	// re-promote a different report on confirm or stack negative weight on dismiss.
	const alreadyApplied = await correctionAlreadyApplied({
		kind: correction.kind,
		sourceUrl,
	});
	if (alreadyApplied) {
		return;
	}

	if (correction.kind === "dismiss") {
		await dismissReportsForUser(correctionInput);
	} else if (correction.kind === "confirm") {
		await validateLatestReportForUser(correctionInput);
	} else if (correction.kind === "reset") {
		await resetRiskProfile(correctionInput);
	} else {
		await allowlistUser(correctionInput);
	}

	await acknowledgeCorrection({
		correctedByLogin: reporterLogin,
		crossTargetMention: correction.crossTargetMention,
		installationId,
		issueNumber,
		kind: correction.kind,
		note: correction.command,
		repositoryFullName,
		sourceCommentId,
		targetLogin,
	});
};

const upsertTargetUser = (user: GithubUserPayload) =>
	upsertGithubUser({
		avatarUrl: user.avatar_url,
		githubUserId: user.id,
		htmlUrl: user.html_url,
		login: user.login,
		type: user.type,
	});

const writeIssueCommentReport = async ({
	command,
	payload,
	pullRequest,
	repository,
	reporterAssociation,
	reporterIsMaintainer,
	targetUser,
}: {
	command: string;
	payload: GithubWebhookPayload;
	pullRequest: Awaited<
		ReturnType<typeof getPullRequestByRepositoryNumber>
	> | null;
	repository: { id: string };
	reporterAssociation: string;
	reporterIsMaintainer: boolean;
	targetUser: { id: string; login: string };
}) => {
	if (!(payload.repository && payload.issue && payload.comment?.user)) {
		return;
	}
	const reasonCode = inferReasonCode(command);
	const validation = await validateReportWithOpenRouter({
		commandText: command,
		pullRequest: {
			body: pullRequest?.body ?? null,
			title: pullRequest?.title ?? payload.issue.title ?? null,
			url: pullRequest?.htmlUrl ?? payload.issue.pull_request?.html_url ?? null,
		},
		reasonText: command,
		reporterAssociation,
		reporterIsMaintainer,
		targetLogin: targetUser.login,
	});

	await createRiskReport({
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
				causes: validation.causes ?? [],
				evidenceSummary: validation.evidenceSummary,
				scoreBreakdown: validation.scoreBreakdown,
				type: "validation_causes",
			},
			{
				type: "github_pull_request",
				url: pullRequest?.htmlUrl ?? payload.issue.pull_request?.html_url,
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
	await acknowledgeReport({
		confidence: validation.confidence,
		evidenceSummary: validation.evidenceSummary,
		installationId: payload.installation?.id,
		issueNumber: payload.issue.number,
		reasonCode,
		repositoryFullName: payload.repository.full_name,
		scoreBreakdown: validation.scoreBreakdown,
		sourceCommentId: payload.comment.id,
		status: validation.status,
		targetLogin: targetUser.login,
		verdict: validation.verdict,
	});
};

const handleIssueComment = async (payload: GithubWebhookPayload) => {
	if (
		payload.action !== "created" ||
		!payload.comment?.body ||
		!payload.issue?.pull_request ||
		!(payload.repository && payload.issue.user && payload.comment.user) ||
		isOwnBotUser(payload.comment.user)
	) {
		return;
	}

	const correction = parseCorrectionCommand(payload.comment.body);
	const command = correction ? null : parseCommand(payload.comment.body);
	if (!(correction || command)) {
		return;
	}

	await upsertInstallationFromPayload(payload.installation);
	const repository = await upsertRepoFromPayload(
		payload.repository,
		payload.installation?.id
	);
	const targetUser = await upsertTargetUser(payload.issue.user);
	const pullRequest = payload.issue.number
		? await getPullRequestByRepositoryNumber(
				repository.id,
				payload.issue.number
			)
		: null;
	const reporterAssociation = payload.comment.author_association ?? "NONE";
	const reporterIsMaintainer = isMaintainerAssociation(reporterAssociation);

	if (correction) {
		if (!reporterIsMaintainer) {
			return;
		}
		await handleMaintainerCorrection({
			correction,
			installationId: payload.installation?.id,
			issueNumber: payload.issue.number,
			pullRequestId: pullRequest?.id ?? null,
			repositoryFullName: payload.repository.full_name,
			repositoryId: repository.id,
			reporterLogin: payload.comment.user.login,
			sourceCommentId: payload.comment.id,
			sourceUrl: payload.comment.html_url ?? payload.issue.html_url ?? "",
			targetLogin: targetUser.login,
			targetUserId: targetUser.id,
		});
		return;
	}

	if (!command) {
		return;
	}
	await writeIssueCommentReport({
		command,
		payload,
		pullRequest,
		repository,
		reporterAssociation,
		reporterIsMaintainer,
		targetUser,
	});
};

const ensurePullRequestForReviewComment = async ({
	payload,
	repository,
	targetUser,
}: {
	payload: GithubWebhookPayload;
	repository: Awaited<ReturnType<typeof upsertRepoFromPayload>>;
	targetUser: Awaited<ReturnType<typeof upsertTargetUser>>;
}) => {
	if (!payload.pull_request) {
		throw new Error("pull_request payload required");
	}
	const existing = await getPullRequestByRepositoryNumber(
		repository.id,
		payload.pull_request.number
	);
	if (existing) {
		return existing;
	}
	return upsertPullRequest({
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
	});
};

const writeReviewCommentReport = async ({
	command,
	payload,
	pullRequest,
	repository,
	reporterAssociation,
	reporterIsMaintainer,
	targetUser,
}: {
	command: string;
	payload: GithubWebhookPayload;
	pullRequest: Awaited<ReturnType<typeof ensurePullRequestForReviewComment>>;
	repository: { id: string };
	reporterAssociation: string;
	reporterIsMaintainer: boolean;
	targetUser: { id: string; login: string };
}) => {
	if (!(payload.repository && payload.pull_request && payload.comment?.user)) {
		return;
	}
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

	await createRiskReport({
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
				causes: validation.causes ?? [],
				evidenceSummary: validation.evidenceSummary,
				scoreBreakdown: validation.scoreBreakdown,
				type: "validation_causes",
			},
			{ type: "github_pull_request", url: payload.pull_request.html_url },
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
	await acknowledgeReport({
		confidence: validation.confidence,
		evidenceSummary: validation.evidenceSummary,
		installationId: payload.installation?.id,
		issueNumber: payload.pull_request.number,
		reasonCode,
		repositoryFullName: payload.repository.full_name,
		scoreBreakdown: validation.scoreBreakdown,
		sourceCommentId: payload.comment.id,
		status: validation.status,
		targetLogin: targetUser.login,
		verdict: validation.verdict,
	});
};

const handlePullRequestReviewComment = async (
	payload: GithubWebhookPayload
) => {
	if (
		payload.action !== "created" ||
		!payload.comment?.body ||
		!(payload.repository && payload.pull_request && payload.comment.user) ||
		isOwnBotUser(payload.comment.user)
	) {
		return;
	}

	const correction = parseCorrectionCommand(payload.comment.body);
	const command = correction ? null : parseCommand(payload.comment.body);
	if (!(correction || command)) {
		return;
	}

	await upsertInstallationFromPayload(payload.installation);
	const repository = await upsertRepoFromPayload(
		payload.repository,
		payload.installation?.id
	);
	const targetUser = await upsertTargetUser(payload.pull_request.user);
	const pullRequest = await ensurePullRequestForReviewComment({
		payload,
		repository,
		targetUser,
	});
	const reporterAssociation = payload.comment.author_association ?? "NONE";
	const reporterIsMaintainer = isMaintainerAssociation(reporterAssociation);

	if (correction) {
		if (!reporterIsMaintainer) {
			return;
		}
		await handleMaintainerCorrection({
			correction,
			installationId: payload.installation?.id,
			issueNumber: payload.pull_request.number,
			pullRequestId: pullRequest.id,
			repositoryFullName: payload.repository.full_name,
			repositoryId: repository.id,
			reporterLogin: payload.comment.user.login,
			sourceCommentId: payload.comment.id,
			sourceUrl: payload.comment.html_url ?? payload.pull_request.html_url,
			targetLogin: targetUser.login,
			targetUserId: targetUser.id,
		});
		return;
	}

	if (!command) {
		return;
	}
	await writeReviewCommentReport({
		command,
		payload,
		pullRequest,
		repository,
		reporterAssociation,
		reporterIsMaintainer,
		targetUser,
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
	const eventStart = Date.now();
	// Record the event up-front with status=pending. If Cloudflare cancels the
	// waitUntil() task before the heavy processing finishes, we still have an
	// audit row instead of a silently-dropped webhook.
	await recordAppEvent({
		action: payload.action,
		actorLogin: payload.sender?.login,
		deliveryId,
		eventName,
		installationGithubId: payload.installation?.id,
		rawPayload: payload,
		repositoryFullName: payload.repository?.full_name,
		status: "pending",
	});
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

		console.log(
			`webhook: event=${eventName} action=${payload.action ?? "_"} elapsed_ms=${
				Date.now() - eventStart
			} status=processed`
		);
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
		console.warn(
			`webhook: event=${eventName} action=${payload.action ?? "_"} elapsed_ms=${
				Date.now() - eventStart
			} status=failed`,
			caught
		);
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
