export const APPEAL_RESOLUTIONS = ["uphold", "reject"] as const;
export type AppealResolution = (typeof APPEAL_RESOLUTIONS)[number];

export const isAppealResolution = (value: unknown): value is AppealResolution =>
	APPEAL_RESOLUTIONS.includes(value as AppealResolution);

export interface AppealOutcome {
	// Whether resolving this way should clear the flag by allowlisting the
	// account (only when there's a tracked account behind the handle).
	allowlist: boolean;
	status: "rejected" | "upheld";
}

// Upholding an appeal means the account was wrongly flagged, so it allowlists
// the account (the same correction the review queue applies). Rejecting leaves
// the flag in place. Centralised so the action and its tests can't drift apart.
export function appealOutcome(resolution: AppealResolution): AppealOutcome {
	if (resolution === "uphold") {
		return { allowlist: true, status: "upheld" };
	}
	return { allowlist: false, status: "rejected" };
}
