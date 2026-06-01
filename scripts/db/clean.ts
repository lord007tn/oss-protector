import "dotenv/config";
import { executeSql, resolveTarget } from "./d1";
import { guardRemote } from "./guard";
import {
	APP_TABLES_CHILD_TO_PARENT,
	AUTH_TABLES_CHILD_TO_PARENT,
	MIGRATION_TRACKING_TABLES,
} from "./tables";

// Drops every table the app owns (app + Better Auth + the migration tracking
// table) so the schema can be rebuilt from scratch by the migrations. A heavier
// hammer than `db:reset`, which only clears rows. Cloudflare-internal tables
// (sqlite_*, _cf_*, d1_*) are left untouched — DROPping them errors with
// SQLITE_AUTH.
//
//   pnpm db:clean                  # drop local schema (then run db:migrate)
//   pnpm db:clean --remote --yes   # same against production (explicit + confirmed)
//
// After cleaning, run `pnpm db:migrate` to rebuild, then `pnpm db:seed` for data.

// Child → parent so each DROP runs before the table it references. wrangler runs
// a --file in a transaction where `PRAGMA foreign_keys = OFF` is a no-op, so the
// order is what actually keeps FK enforcement happy.
const DROP_ORDER = [
	...APP_TABLES_CHILD_TO_PARENT,
	...AUTH_TABLES_CHILD_TO_PARENT,
	...MIGRATION_TRACKING_TABLES,
];

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const target = resolveTarget(argv);
	guardRemote(target, argv, "drop all tables in");

	const sql = `${DROP_ORDER.map(
		(name) => `DROP TABLE IF EXISTS \`${name}\`;`
	).join("\n")}\n`;
	await executeSql(sql, { target });

	process.stdout.write(`Dropped ${DROP_ORDER.length} table(s) (${target}).\n`);
	process.stdout.write(
		`Schema dropped. Run \`pnpm db:migrate${
			target === "remote" ? " --remote" : ""
		}\` to rebuild, then \`pnpm db:seed\` to add data.\n`
	);
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
	process.exitCode = 1;
});
