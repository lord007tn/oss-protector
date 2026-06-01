import "dotenv/config";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { executeFile, queryRows } from "./d1";

// Applies Drizzle-generated migrations to the LOCAL D1 (the .wrangler SQLite
// file). `drizzle-kit migrate` uses the d1-http driver, which only targets the
// remote database, so local dev needs this companion. It tracks applied
// migrations in __drizzle_migrations_local by folder name so each runs once.
//
//   pnpm db:migrate:local
//
// Remote migrations are applied by `pnpm db:migrate` (drizzle-kit migrate).

const MIGRATIONS_DIR = resolve("drizzle");
const TRACKING_TABLE = "__drizzle_migrations_local";

async function main(): Promise<void> {
	await executeFileSql(
		`CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (name TEXT PRIMARY KEY NOT NULL, appliedAt INTEGER DEFAULT (unixepoch()) NOT NULL);`
	);

	const applied = new Set(
		(
			await queryRows<{ name: string }>(
				`SELECT name FROM ${TRACKING_TABLE};`,
				"local"
			)
		).map((row) => row.name)
	);

	const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
	const folders = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();

	const pending = folders.filter((name) => !applied.has(name));
	if (pending.length === 0) {
		process.stdout.write("No pending migrations (local).\n");
		return;
	}

	process.stdout.write(`Applying ${pending.length} migration(s) locally…\n`);
	for (const folder of pending) {
		process.stdout.write(`  → ${folder}\n`);
		await executeFile(resolve(MIGRATIONS_DIR, folder, "migration.sql"), {
			target: "local",
		});
		await executeFileSql(
			`INSERT OR IGNORE INTO ${TRACKING_TABLE} (name) VALUES ('${folder.replaceAll("'", "''")}');`
		);
	}
	process.stdout.write(`Done. Applied ${pending.length} migration(s).\n`);
}

// Small inline helper so we don't write a temp file twice for one statement.
async function executeFileSql(sql: string): Promise<void> {
	const { executeSql } = await import("./d1");
	await executeSql(sql, { target: "local" });
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
	process.exitCode = 1;
});
