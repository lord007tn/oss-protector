import type { D1Target } from "./d1";

// Destructive scripts (reset, clean) default to local. Running them against the
// production database requires BOTH --remote and an explicit --yes so it can
// never happen by accident or from a stray flag.
export function guardRemote(
	target: D1Target,
	argv: string[],
	action: string
): void {
	if (target !== "remote") {
		return;
	}
	if (!argv.includes("--yes")) {
		throw new Error(
			`Refusing to ${action} the REMOTE production database without confirmation. Re-run with --remote --yes if you are certain.`
		);
	}
}
