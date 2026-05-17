import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { config as loadEnv } from "dotenv";

loadEnv();

const CLANKERS_SOURCE_URL =
	"https://raw.githubusercontent.com/UnsafeLabs/Bounty-Hunters/main/clankers.json";
const SOURCE_NAME = "UnsafeLabs/Bounty-Hunters clankers.json";

interface ClankerEntry {
	first_pr?: string;
	last_pr?: string;
	total_prs?: number;
	username?: string;
}

const args = process.argv.slice(2);
const remoteMode = args.includes("--remote");
const printOnly = args.includes("--print");
const databaseName = process.env.CLOUDFLARE_D1_DATABASE_NAME ?? "oss-protector";

const sqlString = (value: null | number | string) => {
	if (value === null) {
		return "NULL";
	}
	if (typeof value === "number") {
		return String(value);
	}
	return `'${value.replaceAll("'", "''")}'`;
};

const unixSeconds = (value?: string) => {
	if (!value) {
		return Math.floor(Date.now() / 1000);
	}
	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp)
		? Math.floor(Date.now() / 1000)
		: Math.floor(timestamp / 1000);
};

const riskForTotalPrs = (totalPrs: number) => {
	const score = Math.min(84, 40 + Math.max(0, totalPrs));
	if (score >= 75) {
		return {
			score,
			status: "high_risk" as const,
		};
	}
	if (score >= 55) {
		return {
			score,
			status: "review" as const,
		};
	}
	return {
		score,
		status: "watch" as const,
	};
};

const WINDOWS_SHELL_SPECIAL_CHARACTERS = /[\s&()^[\]{}=;!'+,`~|<>"]/;

const buildSeedSql = (entries: ClankerEntry[]) => {
	const now = Math.floor(Date.now() / 1000);
	const statements: string[] = ["PRAGMA foreign_keys = ON;"];

	for (const entry of entries) {
		const login = entry.username?.trim();
		if (!login) {
			continue;
		}

		const totalPrs = Math.max(0, entry.total_prs ?? 0);
		const firstSeenAt = unixSeconds(entry.first_pr);
		const lastSeenAt = unixSeconds(entry.last_pr);
		const githubUserId = `external:${login}`;
		const userId = createId();
		const profileId = createId();
		const { score, status } = riskForTotalPrs(totalPrs);
		const summary = `Imported from ${SOURCE_NAME}; observed ${totalPrs} PRs.`;

		statements.push(`
INSERT INTO GithubUser (
	id, githubUserId, login, avatarUrl, htmlUrl, accountType, isKnownGithubBot,
	firstSeenAt, lastSeenAt, createdAt, updatedAt
) VALUES (
	${sqlString(userId)},
	${sqlString(githubUserId)},
	${sqlString(login)},
	${sqlString(`https://github.com/${login}.png`)},
	${sqlString(`https://github.com/${login}`)},
	'User',
	false,
	${firstSeenAt},
	${lastSeenAt},
	${now},
	${now}
)
ON CONFLICT(githubUserId) DO UPDATE SET
	login = excluded.login,
	avatarUrl = excluded.avatarUrl,
	htmlUrl = excluded.htmlUrl,
	lastSeenAt = excluded.lastSeenAt,
	updatedAt = excluded.updatedAt;`);

		statements.push(`
INSERT INTO RiskProfile (
	id, targetUserId, status, confidence, score, reasonCodesJson, summary,
	importedSource, prCount, firstSeenAt, lastSeenAt, lastSignalAt, updatedAt
) VALUES (
	${sqlString(profileId)},
	(SELECT id FROM GithubUser WHERE githubUserId = ${sqlString(githubUserId)}),
	${sqlString(status)},
	${score},
	${score},
	${sqlString(JSON.stringify(["external_blocklist"]))},
	${sqlString(summary)},
	${sqlString(SOURCE_NAME)},
	${totalPrs},
	${firstSeenAt},
	${lastSeenAt},
	${lastSeenAt},
	${now}
)
ON CONFLICT(targetUserId) DO UPDATE SET
	status = excluded.status,
	confidence = excluded.confidence,
	score = excluded.score,
	reasonCodesJson = excluded.reasonCodesJson,
	summary = excluded.summary,
	importedSource = excluded.importedSource,
	prCount = excluded.prCount,
	firstSeenAt = excluded.firstSeenAt,
	lastSeenAt = excluded.lastSeenAt,
	lastSignalAt = excluded.lastSignalAt,
	updatedAt = excluded.updatedAt;`);
	}

	statements.push(`
INSERT INTO SourceImport (
	id, sourceName, sourceUrl, status, itemCount, importedAt
) VALUES (
	${sqlString(createId())},
	${sqlString(SOURCE_NAME)},
	${sqlString(CLANKERS_SOURCE_URL)},
	'completed',
	${entries.length},
	${now}
);`);

	return `${statements.join("\n")}\n`;
};

const runWrangler = async (sql: string) => {
	const filePath = join(tmpdir(), `clankers-seed-${Date.now()}.sql`);
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
			: spawn("wrangler", wranglerArgs, {
					stdio: "inherit",
				});

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

const windowsShellArg = (value: string) => {
	if (!WINDOWS_SHELL_SPECIAL_CHARACTERS.test(value)) {
		return value;
	}
	return `"${value.replaceAll('"', '\\"')}"`;
};

const main = async () => {
	const response = await fetch(CLANKERS_SOURCE_URL);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch ${CLANKERS_SOURCE_URL}: ${response.status}`
		);
	}

	const entries = (await response.json()) as ClankerEntry[];
	const sql = buildSeedSql(entries);
	if (printOnly) {
		console.log(sql);
		return;
	}

	await runWrangler(sql);
	console.log(
		`Seeded ${entries.length} imported clanker profiles into ${databaseName} (${remoteMode ? "remote" : "local"}).`
	);
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
