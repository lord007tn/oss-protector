// Sponsor tiers, highest commitment first. The array order is also the public
// display order on /sponsors and the ranking used to group sponsors.
export const SPONSOR_TIERS = [
	"platinum",
	"gold",
	"silver",
	"supporter",
] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];

// Only `active` sponsors are published. `inactive` keeps the record (e.g. a
// lapsed sponsor) without showing it and without deleting the row.
export const SPONSOR_STATUSES = ["active", "inactive"] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

export const SPONSOR_TIER_LABELS: Record<SponsorTier, string> = {
	gold: "Gold",
	platinum: "Platinum",
	silver: "Silver",
	supporter: "Supporter",
};

export const SPONSOR_STATUS_LABELS: Record<SponsorStatus, string> = {
	active: "Active",
	inactive: "Inactive",
};

const TIER_RANK = new Map<string, number>(
	SPONSOR_TIERS.map((tier, index) => [tier, index])
);

// Lower rank = higher tier. Unknown tiers sort last.
export function sponsorTierRank(tier: string): number {
	return TIER_RANK.get(tier) ?? SPONSOR_TIERS.length;
}

export function sponsorTierLabel(tier: string): string {
	return SPONSOR_TIER_LABELS[tier as SponsorTier] ?? tier;
}
