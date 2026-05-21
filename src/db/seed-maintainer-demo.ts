import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

// Seeds a self-contained maintainer demo: one installation, three repos, a few
// flagged authors with pending reports, one allowlisted author, plus an
// InstallationMaintainer membership + notifications linked to a signed-in user.
//
// The membership/notifications resolve the user by email (the account must
// already exist — sign in once via email OTP or GitHub first). Run with:
//   pnpm db:seed:demo                       # links fariq@joodlab.com (default)
//   pnpm db:seed:demo --email you@host.dev   # link a different account
//   pnpm db:seed:demo --print                # print SQL only

const args = process.argv.slice(2);
const remoteMode = args.includes("--remote");
const printOnly = args.includes("--print");
const resetMode = args.includes("--reset");
const emailArgIndex = args.indexOf("--email");
const email =
	emailArgIndex >= 0 && args[emailArgIndex + 1]
		? args[emailArgIndex + 1]
		: (process.env.DEMO_USER_EMAIL ?? "fariq@joodlab.com");
const databaseName = process.env.CLOUDFLARE_D1_DATABASE_NAME ?? "oss-protector";

const INSTALLATION_ID = "demo-install-1";
const now = Math.floor(Date.now() / 1000);
const HOUR = 3600;
const DAY = 86_400;

const sqlString = (value: null | number | string) => {
	if (value === null) {
		return "NULL";
	}
	if (typeof value === "number") {
		return String(value);
	}
	return `'${value.replaceAll("'", "''")}'`;
};

interface DemoAuthor {
	avatar: string;
	confidence: number;
	githubUserId: string;
	login: string;
	reasonCodes: string[];
	score: number;
	status: "allow" | "high_risk" | "review" | "watch";
	summary: string;
}

interface DemoRepo {
	fullName: string;
	githubRepositoryId: string;
	id: string;
	name: string;
}

interface DemoPullRequest {
	authorGithubUserId: string;
	githubPullRequestId: string;
	id: string;
	number: number;
	repoId: string;
	title: string;
}

interface DemoReport {
	commentId: string;
	confidence: number;
	id: string;
	pullRequestId: string;
	reasonCode: string;
	repoId: string;
	status: "needs_review" | "pending";
	targetGithubUserId: string;
}

interface DemoNotification {
	body: string;
	id: string;
	kind: string;
	link: string;
	read: boolean;
	title: string;
}

const REPOS: DemoRepo[] = [
	{
		fullName: "acme-oss/web",
		githubRepositoryId: "demo-gh-repo-1",
		id: "demo-repo-1",
		name: "web",
	},
	{
		fullName: "acme-oss/api",
		githubRepositoryId: "demo-gh-repo-2",
		id: "demo-repo-2",
		name: "api",
	},
	{
		fullName: "acme-oss/cli",
		githubRepositoryId: "demo-gh-repo-3",
		id: "demo-repo-3",
		name: "cli",
	},
];

const AUTHORS: DemoAuthor[] = [
	{
		avatar: "https://github.com/autopr-helper-99.png",
		confidence: 95,
		githubUserId: "demo:autopr-helper-99",
		login: "autopr-helper-99",
		reasonCodes: ["ai_slop"],
		score: 88,
		status: "high_risk",
		summary: "Automated PR farming across unrelated repositories.",
	},
	{
		avatar: "https://github.com/fix-typo-bot-42.png",
		confidence: 78,
		githubUserId: "demo:fix-typo-bot-42",
		login: "fix-typo-bot-42",
		reasonCodes: ["spam_pr"],
		score: 64,
		status: "review",
		summary: "Repeated low-value typo PRs.",
	},
	{
		avatar: "https://github.com/good-first-grinder.png",
		confidence: 82,
		githubUserId: "demo:good-first-grinder",
		login: "good-first-grinder",
		reasonCodes: ["fake_bounty"],
		score: 58,
		status: "review",
		summary: "Reward-seeking contribution pattern.",
	},
	{
		avatar: "https://github.com/miketcosta.png",
		confidence: 0,
		githubUserId: "demo:miketcosta",
		login: "miketcosta",
		reasonCodes: [],
		score: 0,
		status: "allow",
		summary: "Allowlisted by maintainer; trusted contributor.",
	},
];

const PULL_REQUESTS: DemoPullRequest[] = [
	{
		authorGithubUserId: "demo:autopr-helper-99",
		githubPullRequestId: "demo-gh-pr-1",
		id: "demo-pr-1",
		number: 4012,
		repoId: "demo-repo-1",
		title: "fix: typo in error string",
	},
	{
		authorGithubUserId: "demo:fix-typo-bot-42",
		githubPullRequestId: "demo-gh-pr-2",
		id: "demo-pr-2",
		number: 1188,
		repoId: "demo-repo-2",
		title: "refactor: extract helper to utils",
	},
	{
		authorGithubUserId: "demo:good-first-grinder",
		githubPullRequestId: "demo-gh-pr-3",
		id: "demo-pr-3",
		number: 4018,
		repoId: "demo-repo-1",
		title: "chore: bump esbuild 0.21 to 0.22",
	},
	{
		authorGithubUserId: "demo:miketcosta",
		githubPullRequestId: "demo-gh-pr-4",
		id: "demo-pr-4",
		number: 220,
		repoId: "demo-repo-3",
		title: "feat: add --json flag to status command",
	},
];

const REPORTS: DemoReport[] = [
	{
		commentId: "demo-comment-1",
		confidence: 95,
		id: "demo-report-1",
		pullRequestId: "demo-pr-1",
		reasonCode: "ai_slop",
		repoId: "demo-repo-1",
		status: "pending",
		targetGithubUserId: "demo:autopr-helper-99",
	},
	{
		commentId: "demo-comment-2",
		confidence: 78,
		id: "demo-report-2",
		pullRequestId: "demo-pr-2",
		reasonCode: "spam_pr",
		repoId: "demo-repo-2",
		status: "needs_review",
		targetGithubUserId: "demo:fix-typo-bot-42",
	},
	{
		commentId: "demo-comment-3",
		confidence: 82,
		id: "demo-report-3",
		pullRequestId: "demo-pr-3",
		reasonCode: "fake_bounty",
		repoId: "demo-repo-1",
		status: "pending",
		targetGithubUserId: "demo:good-first-grinder",
	},
];

const NOTIFICATIONS: DemoNotification[] = [
	{
		body: "@autopr-helper-99 — AI slop · score 95/100",
		id: "demo-notif-1",
		kind: "flag",
		link: "/accounts/autopr-helper-99",
		read: false,
		title: "PR #4012 flagged in acme-oss/web",
	},
	{
		body: "Fake bounty · pending · 82% confidence",
		id: "demo-notif-2",
		kind: "report",
		link: "/accounts/good-first-grinder",
		read: false,
		title: "New report on @good-first-grinder",
	},
	{
		body: "A trusted author was added to your allowlist.",
		id: "demo-notif-3",
		kind: "correction",
		link: "/accounts/miketcosta",
		read: true,
		title: "Added to allowlist",
	},
];

// Per-email id suffix so seeding more than one account doesn't collide on the
// hardcoded primary keys of the membership / notification rows.
const emailSlug = email.replace(/[^a-z0-9]/gi, "-").toLowerCase();

const installationStatement = () => `
INSERT INTO Installation (
	id, githubInstallationId, accountGithubId, accountLogin, accountType,
	repositorySelection, createdAt, updatedAt
) VALUES (
	${sqlString(INSTALLATION_ID)}, '900000001', '90000001', 'acme-oss',
	'Organization', 'all', ${now - 30 * DAY}, ${now}
)
ON CONFLICT(githubInstallationId) DO NOTHING;`;

const repoStatement = (repo: DemoRepo) => `
INSERT INTO Repository (
	id, installationId, githubRepositoryId, fullName, ownerLogin, name,
	htmlUrl, isPrivate, isActive, createdAt, updatedAt
) VALUES (
	${sqlString(repo.id)}, ${sqlString(INSTALLATION_ID)},
	${sqlString(repo.githubRepositoryId)}, ${sqlString(repo.fullName)},
	'acme-oss', ${sqlString(repo.name)},
	${sqlString(`https://github.com/${repo.fullName}`)}, false, true,
	${now - 30 * DAY}, ${now}
)
ON CONFLICT(githubRepositoryId) DO NOTHING;`;

const authorStatement = (author: DemoAuthor) => `
INSERT INTO GithubUser (
	id, githubUserId, login, avatarUrl, htmlUrl, accountType, isKnownGithubBot,
	firstSeenAt, lastSeenAt, createdAt, updatedAt
) VALUES (
	${sqlString(`demo-user-${author.login}`)}, ${sqlString(author.githubUserId)},
	${sqlString(author.login)}, ${sqlString(author.avatar)},
	${sqlString(`https://github.com/${author.login}`)}, 'User', false,
	${now - 27 * DAY}, ${now - HOUR}, ${now - 27 * DAY}, ${now}
)
ON CONFLICT(githubUserId) DO UPDATE SET lastSeenAt = excluded.lastSeenAt;`;

const profileStatement = (author: DemoAuthor) => `
INSERT INTO RiskProfile (
	id, targetUserId, status, confidence, score, reasonCodesJson, summary,
	prCount, firstSeenAt, lastSeenAt, lastSignalAt, updatedAt
) VALUES (
	${sqlString(`demo-profile-${author.login}`)},
	(SELECT id FROM GithubUser WHERE githubUserId = ${sqlString(author.githubUserId)}),
	${sqlString(author.status)}, ${author.confidence}, ${author.score},
	${sqlString(JSON.stringify(author.reasonCodes))}, ${sqlString(author.summary)},
	1, ${now - 27 * DAY}, ${now - HOUR}, ${now - HOUR}, ${now}
)
ON CONFLICT(targetUserId) DO UPDATE SET
	status = excluded.status, score = excluded.score,
	confidence = excluded.confidence, summary = excluded.summary,
	reasonCodesJson = excluded.reasonCodesJson, updatedAt = excluded.updatedAt;`;

const pullRequestStatement = (pullRequest: DemoPullRequest) => `
INSERT INTO PullRequest (
	id, repositoryId, authorUserId, githubPullRequestId, number, title, state,
	htmlUrl, firstSeenAt, lastSeenAt, createdAt, updatedAt
) VALUES (
	${sqlString(pullRequest.id)}, ${sqlString(pullRequest.repoId)},
	(SELECT id FROM GithubUser WHERE githubUserId = ${sqlString(pullRequest.authorGithubUserId)}),
	${sqlString(pullRequest.githubPullRequestId)}, ${pullRequest.number},
	${sqlString(pullRequest.title)}, 'open',
	${sqlString(`https://github.com/acme-oss/pull/${pullRequest.number}`)},
	${now - 2 * DAY}, ${now - HOUR}, ${now - 2 * DAY}, ${now}
)
ON CONFLICT(githubPullRequestId) DO NOTHING;`;

const reportStatement = (report: DemoReport) => `
INSERT INTO BotReport (
	id, targetUserId, reporterLogin, reporterAssociation, reporterIsMaintainer,
	repositoryId, pullRequestId, commentId, sourceUrl, commandText, reasonCode,
	status, confidence, aiVerdict, aiRationale, evidenceJson, createdAt, updatedAt
) VALUES (
	${sqlString(report.id)},
	(SELECT id FROM GithubUser WHERE githubUserId = ${sqlString(report.targetGithubUserId)}),
	'octo-maintainer', 'MEMBER', true, ${sqlString(report.repoId)},
	${sqlString(report.pullRequestId)}, ${sqlString(report.commentId)},
	${sqlString(`https://github.com/acme-oss/pull/comment/${report.commentId}`)},
	'@oss-protector review this user', ${sqlString(report.reasonCode)},
	${sqlString(report.status)}, ${report.confidence}, 'likely_abuse',
	'Automatic review flagged abuse-pattern signals.', '[]',
	${now - HOUR}, ${now - HOUR}
)
ON CONFLICT(commentId) DO NOTHING;`;

const membershipStatement = () => `
INSERT INTO InstallationMaintainer (id, userId, installationId, role, createdAt)
SELECT ${sqlString(`demo-maintainer-${emailSlug}`)}, id, ${sqlString(INSTALLATION_ID)}, 'owner', ${now}
FROM user WHERE email = ${sqlString(email)} LIMIT 1
ON CONFLICT(userId, installationId) DO NOTHING;`;

const notificationStatement = (notification: DemoNotification) => `
INSERT INTO Notification (id, userId, kind, title, body, link, read, createdAt)
SELECT ${sqlString(`${emailSlug}-${notification.id}`)}, id, ${sqlString(notification.kind)},
	${sqlString(notification.title)}, ${sqlString(notification.body)},
	${sqlString(notification.link)}, ${notification.read ? 1 : 0}, ${now - HOUR}
FROM user WHERE email = ${sqlString(email)} LIMIT 1
ON CONFLICT(id) DO NOTHING;`;

// --reset wipes all demo rows (children before parents) so a fresh seed starts
// from a clean slate. Useful after clicking through the demo decisions.
const resetStatements = (): string[] => [
	"DELETE FROM Notification WHERE id LIKE '%demo-notif-%';",
	"DELETE FROM InstallationMaintainer WHERE installationId = 'demo-install-1';",
	"DELETE FROM BotSignal WHERE targetUserId IN (SELECT id FROM GithubUser WHERE githubUserId LIKE 'demo:%');",
	"DELETE FROM BotReport WHERE id LIKE 'demo-report-%';",
	"DELETE FROM PullRequest WHERE id LIKE 'demo-pr-%';",
	"DELETE FROM RiskProfile WHERE id LIKE 'demo-profile-%';",
	"DELETE FROM Repository WHERE id LIKE 'demo-repo-%';",
	"DELETE FROM Installation WHERE id = 'demo-install-1';",
	"DELETE FROM GithubUser WHERE githubUserId LIKE 'demo:%';",
];

const buildDemoSql = () => {
	const statements: string[] = ["PRAGMA foreign_keys = ON;"];
	if (resetMode) {
		statements.push(...resetStatements());
	}
	statements.push(installationStatement());
	for (const repo of REPOS) {
		statements.push(repoStatement(repo));
	}
	for (const author of AUTHORS) {
		statements.push(authorStatement(author));
		statements.push(profileStatement(author));
	}
	for (const pullRequest of PULL_REQUESTS) {
		statements.push(pullRequestStatement(pullRequest));
	}
	for (const report of REPORTS) {
		statements.push(reportStatement(report));
	}
	statements.push(membershipStatement());
	for (const notification of NOTIFICATIONS) {
		statements.push(notificationStatement(notification));
	}
	return `${statements.join("\n")}\n`;
};

const WINDOWS_SHELL_SPECIAL_CHARACTERS = /[\s&()^[\]{}=;!'+,`~|<>"]/;

const windowsShellArg = (value: string) => {
	if (!WINDOWS_SHELL_SPECIAL_CHARACTERS.test(value)) {
		return value;
	}
	return `"${value.replaceAll('"', '\\"')}"`;
};

const runWrangler = async (sql: string) => {
	const filePath = join(tmpdir(), `maintainer-demo-${Date.now()}.sql`);
	await writeFile(filePath, sql, "utf8");

	const wranglerArgs = [
		"d1",
		"execute",
		databaseName,
		remoteMode ? "--remote" : "--local",
		"--file",
		filePath,
	];
	const child =
		process.platform === "win32"
			? spawn(
					process.env.ComSpec ?? "cmd.exe",
					[
						"/d",
						"/s",
						"/c",
						["wrangler.cmd", ...wranglerArgs.map(windowsShellArg)].join(" "),
					],
					{ stdio: "inherit" }
				)
			: spawn("wrangler", wranglerArgs, { stdio: "inherit" });

	await new Promise<void>((resolve, reject) => {
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`wrangler exited with code ${code}`));
		});
	});
};

const main = async () => {
	const sql = buildDemoSql();
	if (printOnly) {
		console.log(sql);
		return;
	}
	await runWrangler(sql);
	console.log(
		`Seeded maintainer demo into ${databaseName} (${remoteMode ? "remote" : "local"}) for ${email}.`
	);
	console.log(
		"If the dashboard is still empty, sign in once with that email/account, then re-run."
	);
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
