export const isMissingBindingError = (caught: unknown) =>
	caught instanceof Error &&
	(caught.message.includes("Missing Cloudflare D1 binding") ||
		caught.message.includes("no such table"));
