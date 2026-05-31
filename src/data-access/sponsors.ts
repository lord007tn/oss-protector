import { eq, sql } from "drizzle-orm";

import {
	type SponsorStatus,
	type SponsorTier,
	sponsorTierRank,
} from "@/constants/sponsor-tiers";
import { database } from "@/db";
import { Sponsor, type SponsorSelect } from "@/db/schema";

export type SponsorRecord = SponsorSelect;

// The writable shape of a sponsor — id and timestamps are managed by the DB.
export interface SponsorInput {
	description: null | string;
	logoUrl: null | string;
	name: string;
	sortOrder: number;
	status: SponsorStatus;
	tier: SponsorTier;
	url: string;
}

// Tier first, then the manual sort order, then name — a stable, predictable
// ordering shared by the public page and the admin console.
function byTierThenOrder(a: SponsorRecord, b: SponsorRecord): number {
	return (
		sponsorTierRank(a.tier) - sponsorTierRank(b.tier) ||
		a.sortOrder - b.sortOrder ||
		a.name.localeCompare(b.name)
	);
}

// Active sponsors for the public page.
export async function listActiveSponsors(): Promise<SponsorRecord[]> {
	const rows = await database
		.select()
		.from(Sponsor)
		.where(eq(Sponsor.status, "active"));
	return [...rows].sort(byTierThenOrder);
}

// Every sponsor (any status) for the admin console.
export async function listAllSponsors(): Promise<SponsorRecord[]> {
	const rows = await database.select().from(Sponsor);
	return [...rows].sort(byTierThenOrder);
}

export async function createSponsor(
	input: SponsorInput
): Promise<SponsorRecord> {
	const [created] = await database.insert(Sponsor).values(input).returning();
	if (!created) {
		throw new Error("Failed to create sponsor.");
	}
	return created;
}

export async function updateSponsor(
	id: string,
	input: SponsorInput
): Promise<SponsorRecord | null> {
	const [updated] = await database
		.update(Sponsor)
		.set({ ...input, updatedAt: sql`(unixepoch())` })
		.where(eq(Sponsor.id, id))
		.returning();
	return updated ?? null;
}

export async function deleteSponsor(id: string): Promise<void> {
	await database.delete(Sponsor).where(eq(Sponsor.id, id));
}
