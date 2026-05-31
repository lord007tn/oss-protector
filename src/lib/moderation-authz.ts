import type { RuntimeBindings } from "@/env";
import { runtimeBindings } from "@/env";

// Platform admins (configured via the ADMIN_EMAILS env var, comma-separated)
// bypass the per-repo moderation scope. Keyed on the session email, the one
// identifier better-auth reliably populates for both GitHub and OTP sign-ins.
// Empty/unset → no admins, so moderation stays strictly repo-scoped.
export const isPlatformAdmin = (
	env: RuntimeBindings | undefined,
	user: { email?: null | string } | null | undefined
): boolean => {
	const email = user?.email?.trim().toLowerCase();
	if (!email) {
		return false;
	}
	const configured = { ...runtimeBindings(), ...env }.ADMIN_EMAILS;
	if (!configured) {
		return false;
	}
	return configured
		.split(",")
		.map((entry) => entry.trim().toLowerCase())
		.includes(email);
};
