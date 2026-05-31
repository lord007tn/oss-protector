const BINDING_ERROR_NEEDLES = [
	"Missing Cloudflare D1 binding",
	"no such table",
	"no such column",
];

// Drizzle wraps every failed query in a DrizzleQueryError whose `message` is
// just "Failed query: …" — the real SQLite text ("no such table/column") lives
// on `.cause`. Walk the cause chain (bounded) so the guard actually fires for
// wrapped query failures, not only top-level binding errors.
export const isMissingBindingError = (caught: unknown): boolean => {
	let current: unknown = caught;
	for (let depth = 0; current instanceof Error && depth < 5; depth++) {
		const { message } = current;
		if (BINDING_ERROR_NEEDLES.some((needle) => message.includes(needle))) {
			return true;
		}
		current = (current as { cause?: unknown }).cause;
	}
	return false;
};

// Any failed database read: a missing binding, a missing table/column, or any
// other Drizzle-wrapped query failure (its message starts with "Failed query:").
// Public read-only views degrade to an empty result on these instead of 500-ing,
// while genuine non-DB programmer errors still surface for observability.
export const isDatabaseReadError = (caught: unknown): boolean =>
	isMissingBindingError(caught) ||
	(caught instanceof Error && caught.message.startsWith("Failed query:"));
