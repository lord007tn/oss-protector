import "dotenv/config";
import { executeSql, resolveTarget } from "./d1";
import { guardRemote } from "./guard";
import {
	APP_TABLES_CHILD_TO_PARENT,
	AUTH_TABLES_CHILD_TO_PARENT,
} from "./tables";

// Wipes ALL row data while keeping the schema intact, so the app starts clean.
// Replaces the old scripts/reset-data.sql. Deletes in child → parent order to
// satisfy foreign keys; includes the Better Auth tables (after a reset the only
// admin is whoever signs in next with an ADMIN_EMAILS address). Keeps the
// schema_migrations tracking table so migration state is preserved.
//
//   pnpm db:reset              # wipe local rows
//   pnpm db:reset --remote --yes   # wipe the production D1 (explicit + confirmed)
//
// This is destructive and irreversible. Re-seed afterwards with `pnpm db:seed`.

const DELETE_ORDER = [
	...APP_TABLES_CHILD_TO_PARENT,
	...AUTH_TABLES_CHILD_TO_PARENT,
];

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const target = resolveTarget(argv);
	guardRemote(target, argv, "wipe all rows from");

	const sql = `PRAGMA foreign_keys = OFF;\n${DELETE_ORDER.map(
		(table) => `DELETE FROM ${table};`
	).join("\n")}\nPRAGMA foreign_keys = ON;\n`;

	await executeSql(sql, { target });
	process.stdout.write(
		`Reset complete: wiped ${DELETE_ORDER.length} tables (${target}).\n`
	);
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
	process.exitCode = 1;
});
