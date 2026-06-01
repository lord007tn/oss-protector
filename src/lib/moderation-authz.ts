import type { RuntimeBindings } from "@/env";
import { runtimeBindings } from "@/env";

// The configured admin allowlist (ADMIN_EMAILS, comma-separated, lowercased).
// This is the *bootstrap* list: a user whose email is here is granted the
// better-auth `admin` role when their account is first created (see the
// databaseHooks in `createAuth`). Thereafter the `role` column is authoritative.
export const getAdminEmails = (env?: RuntimeBindings): string[] => {
	const configured = { ...runtimeBindings(), ...env }.ADMIN_EMAILS;
	if (!configured) {
		return [];
	}
	return configured.split(",").flatMap((entry) => {
		const email = entry.trim().toLowerCase();
		return email ? [email] : [];
	});
};

// Platform admins bypass the per-repo moderation scope. Primary signal is the
// better-auth `admin` role; the email allowlist is kept as a fallback so a
// configured admin still resolves even if their `role` column predates the
// admin plugin (e.g. an account created before the columns existed).
export const isPlatformAdmin = (
	env: RuntimeBindings | undefined,
	user: { email?: null | string; role?: null | string } | null | undefined
): boolean => {
	if (user?.role === "admin") {
		return true;
	}
	const email = user?.email?.trim().toLowerCase();
	if (!email) {
		return false;
	}
	return getAdminEmails(env).includes(email);
};
