#!/usr/bin/env tsx
/**
 * Post-deploy smoke test: open a synthetic fixture PR on the e2e repo and
 * assert the bot comments within a budget. Detects waitUntil() cancellations,
 * webhook routing breakage, and missing GitHub App permissions before users do.
 *
 * Run via `pnpm run smoke`. Requires `gh` CLI auth and the GitHub App installed
 * on the configured E2E_REPO.
 *
 * Env:
 *   E2E_REPO (default: lord007tn/oss-protector-e2e)
 *   SMOKE_BUDGET_MS (default: 25000)
 *   SMOKE_POLL_INTERVAL_MS (default: 3000)
 */
import { spawnSync } from "node:child_process";

const REPO = process.env.E2E_REPO ?? "lord007tn/oss-protector-e2e";
const BUDGET_MS = Number(process.env.SMOKE_BUDGET_MS ?? 25_000);
const POLL_INTERVAL_MS = Number(process.env.SMOKE_POLL_INTERVAL_MS ?? 3000);

const BOT_LOGIN = "oss-protector[bot]";
const NOW = new Date().toISOString().replace(/[:.]/g, "-");
const BRANCH = `e2e/smoke-${NOW}`;
const README_PATH = "README.md";

interface GhResult {
	exitCode: number;
	stderr: string;
	stdout: string;
}

const gh = (args: string[], stdin?: string): GhResult => {
	const result = spawnSync("gh", args, {
		encoding: "utf8",
		input: stdin,
	});
	return {
		exitCode: result.status ?? -1,
		stderr: result.stderr ?? "",
		stdout: result.stdout ?? "",
	};
};

const ghJson = <T>(args: string[], stdin?: string): T => {
	const { exitCode, stderr, stdout } = gh(args, stdin);
	if (exitCode !== 0) {
		throw new Error(`gh ${args.join(" ")} failed: ${stderr.trim()}`);
	}
	return JSON.parse(stdout) as T;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
	console.log(`[smoke] repo=${REPO} budget=${BUDGET_MS}ms`);

	// 1. Branch from main.
	const mainRef = ghJson<{ object: { sha: string } }>([
		"api",
		`repos/${REPO}/git/refs/heads/main`,
	]);
	const mainSha = mainRef.object.sha;
	console.log(`[smoke] main sha=${mainSha.slice(0, 7)}, creating ${BRANCH}`);
	gh(
		["api", "-X", "POST", `repos/${REPO}/git/refs`, "--input", "-"],
		JSON.stringify({
			ref: `refs/heads/${BRANCH}`,
			sha: mainSha,
		})
	);

	// 2. Update README on the branch with a benign change.
	const readme = ghJson<{ sha: string }>([
		"api",
		`repos/${REPO}/contents/${README_PATH}?ref=main`,
	]);
	const content = Buffer.from(
		`# OSS Protector smoke test\n\nFixture commit at ${NOW}.\n`
	).toString("base64");
	gh(
		[
			"api",
			"-X",
			"PUT",
			`repos/${REPO}/contents/${README_PATH}`,
			"--input",
			"-",
		],
		JSON.stringify({
			branch: BRANCH,
			content,
			message: "smoke: synthetic fixture commit",
			sha: readme.sha,
		})
	);

	// 3. Open the PR.
	const pr = ghJson<{ number: number; html_url: string }>(
		["api", "-X", "POST", `repos/${REPO}/pulls`, "--input", "-"],
		JSON.stringify({
			base: "main",
			body: "Automated post-deploy smoke test. Will be closed and the branch deleted at end of run.",
			head: BRANCH,
			title: `smoke: ${NOW}`,
		})
	);
	console.log(`[smoke] opened PR #${pr.number}`);

	// 4. Poll for the bot's analysis comment.
	const deadline = Date.now() + BUDGET_MS;
	let landed = false;
	let attempts = 0;
	while (Date.now() < deadline) {
		attempts += 1;
		const comments = ghJson<Array<{ user: { login: string }; body: string }>>([
			"api",
			`repos/${REPO}/issues/${pr.number}/comments`,
		]);
		if (
			comments.some(
				(c) =>
					c.user.login === BOT_LOGIN &&
					c.body.includes("oss-protector:auto-review:")
			)
		) {
			landed = true;
			break;
		}
		await sleep(POLL_INTERVAL_MS);
	}

	// 5. Always clean up the PR and branch — even on failure.
	console.log(`[smoke] cleanup: closing PR #${pr.number}, deleting ${BRANCH}`);
	gh([
		"api",
		"-X",
		"PATCH",
		`repos/${REPO}/pulls/${pr.number}`,
		"-F",
		"state=closed",
	]);
	gh(["api", "-X", "DELETE", `repos/${REPO}/git/refs/heads/${BRANCH}`]);

	if (!landed) {
		console.error(
			`[smoke] FAIL: no bot comment after ${attempts} polls in ${BUDGET_MS}ms`
		);
		process.exit(1);
	}
	console.log(
		`[smoke] OK: bot comment landed after ~${attempts * POLL_INTERVAL_MS}ms`
	);
};

main().catch((error) => {
	console.error("[smoke] error:", error);
	process.exit(1);
});
