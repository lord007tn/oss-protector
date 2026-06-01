import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { executeSql, queryRows, resolveTarget } from "./d1";
import { guardRemote } from "./guard";

// One-time bootstrap for a database whose schema ALREADY exists (e.g. the
// hand-migrated production D1). Records every current Drizzle migration in
// `__drizzle_migrations` as if it had been applied — WITHOUT running any SQL —
// so the next `pnpm db:migrate` only executes genuinely new migrations instead
// of trying to re-CREATE tables that are already there.
//
//   pnpm db:baseline --remote --yes   # mark prod migrations as applied
//   pnpm db:baseline                  # same for a local DB that predates drizzle tracking
//
// Drizzle's migrate command tracks applied migrations by the SHA-256 of each
// migration.sql in a table shaped (id INTEGER PK, hash TEXT, created_at NUMERIC).
// We reproduce exactly that so drizzle-kit treats them as done.

const MIGRATIONS_DIR = resolve("drizzle");
const TRACKING_TABLE = "__drizzle_migrations";

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const target = resolveTarget(argv);
	guardRemote(target, argv, "baseline migration state in");

	const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
	const folders = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();

	if (folders.length === 0) {
		process.stdout.write("No migrations to baseline.\n");
		return;
	}

	// SQLite doesn't support SERIAL; create the table in the shape drizzle reads.
	await executeSql(
		`CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric);`,
		{ target }
	);

	const existing = new Set(
		(
			await queryRows<{ hash: string }>(
				`SELECT hash FROM ${TRACKING_TABLE};`,
				target
			)
		).map((row) => row.hash)
	);

	const values: string[] = [];
	let createdAt = Date.now();
	for (const folder of folders) {
		const sql = await readFile(
			resolve(MIGRATIONS_DIR, folder, "migration.sql"),
			"utf8"
		);
		const hash = createHash("sha256").update(sql).digest("hex");
		if (existing.has(hash)) {
			continue;
		}
		values.push(`('${hash}', ${createdAt})`);
		// Keep created_at strictly increasing so order is preserved.
		createdAt += 1;
	}

	if (values.length === 0) {
		process.stdout.write(
			`Baseline: all ${folders.length} migration(s) already recorded (${target}).\n`
		);
		return;
	}

	await executeSql(
		`INSERT INTO ${TRACKING_TABLE} (hash, created_at) VALUES ${values.join(", ")};`,
		{ target }
	);
	process.stdout.write(
		`Baseline: recorded ${values.length} migration(s) as applied without running them (${target}).\n`
	);
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
	process.exitCode = 1;
});
