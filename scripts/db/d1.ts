import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Shared Cloudflare D1 helpers for the db scripts (migrate / reset / clean).
// Wraps `wrangler d1 execute` with the same cross-platform spawn handling the
// seed script uses, plus a JSON-returning variant so callers can read query
// results (e.g. the migration tracking table).

export type D1Target = "local" | "remote";

const WINDOWS_SHELL_SPECIAL_CHARACTERS = /[\s&()^[\]{}=;!'+,`~|<>"]/;

export const databaseName =
	process.env.CLOUDFLARE_D1_DATABASE_NAME ?? "oss-protector";

// Resolve the target from CLI flags. Defaults to local — remote must be opt-in
// so a stray invocation can never touch production.
export function resolveTarget(argv: string[]): D1Target {
	return argv.includes("--remote") ? "remote" : "local";
}

const windowsShellArg = (value: string): string => {
	if (!WINDOWS_SHELL_SPECIAL_CHARACTERS.test(value)) {
		return value;
	}
	return `"${value.replaceAll('"', '\\"')}"`;
};

interface WranglerOptions {
	capture?: boolean;
	target: D1Target;
}

const spawnWrangler = (
	wranglerArgs: string[],
	capture: boolean
): Promise<string> => {
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
					{ stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" }
				)
			: spawn("wrangler", wranglerArgs, {
					stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
				});

	let stdout = "";
	if (capture && child.stdout) {
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
	}

	return new Promise<string>((resolve, reject) => {
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve(stdout);
				return;
			}
			reject(new Error(`wrangler exited with code ${code}`));
		});
	});
};

// Execute a literal SQL string. Returns wrangler's stdout when capture is set.
export async function executeSql(
	sql: string,
	{ target, capture = false }: WranglerOptions
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "d1-exec-"));
	const filePath = join(dir, "statement.sql");
	try {
		await writeFile(filePath, sql, "utf8");
		return await executeFile(filePath, { capture, target });
	} finally {
		await rm(dir, { force: true, recursive: true });
	}
}

// Execute a SQL file by path.
export function executeFile(
	filePath: string,
	{ target, capture = false }: WranglerOptions
): Promise<string> {
	const wranglerArgs = [
		"d1",
		"execute",
		databaseName,
		target === "remote" ? "--remote" : "--local",
		"--file",
		filePath,
	];
	if (capture) {
		wranglerArgs.push("--json");
	}
	return spawnWrangler(wranglerArgs, capture);
}

interface D1JsonResult {
	results: Record<string, unknown>[];
}

// Run a query and parse wrangler's `--json` output into rows. Returns [] when
// the output can't be parsed (e.g. nothing selected).
export async function queryRows<T = Record<string, unknown>>(
	sql: string,
	target: D1Target
): Promise<T[]> {
	const raw = await executeSql(sql, { capture: true, target });
	const start = raw.indexOf("[");
	if (start === -1) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw.slice(start)) as D1JsonResult[];
		return (parsed[0]?.results ?? []) as T[];
	} catch {
		return [];
	}
}
