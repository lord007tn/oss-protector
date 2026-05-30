import { authClient } from "@/lib/auth-client";

// Reflects the real better-auth session. Unauthenticated viewers see the
// public surfaces; maintainer pages (dashboard, settings) gate via SignInGate.
export function useSessionState() {
	const { data, isPending } = authClient.useSession();
	return {
		isPending,
		session: data,
		signedIn: Boolean(data?.user),
	};
}
