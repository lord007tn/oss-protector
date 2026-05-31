import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { getSessionUser } from "@/actions/session";
import { SPONSOR_STATUSES, SPONSOR_TIERS } from "@/constants/sponsor-tiers";
import {
	createSponsor,
	deleteSponsor,
	listActiveSponsors,
	listAllSponsors,
	type SponsorRecord,
	updateSponsor,
} from "@/data-access/sponsors";
import { hasDatabaseBinding } from "@/db";

// Throws if the request isn't from a signed-in platform admin. The server
// function layer turns the throw into a 401/403 for the client. Mirrors the
// guard in @/functions/admin so sponsor writes are admin-only.
async function requireAdmin(request: Request): Promise<void> {
	const session = await getSessionUser({ request });
	if (!session?.isAdmin) {
		throw new Error("Admin access required.");
	}
}

function isValidHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

const sponsorFields = z.object({
	description: z.string().trim().max(500).default(""),
	logoUrl: z
		.string()
		.trim()
		.max(2048)
		.refine(
			(value) => value === "" || isValidHttpUrl(value),
			"Enter a valid URL"
		)
		.default(""),
	name: z.string().trim().min(1, "Name is required").max(120),
	sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
	status: z.enum(SPONSOR_STATUSES).default("active"),
	tier: z.enum(SPONSOR_TIERS).default("supporter"),
	url: z
		.string()
		.trim()
		.min(1, "URL is required")
		.max(2048)
		.refine(isValidHttpUrl, "Enter a valid URL"),
});

const sponsorUpdateFields = sponsorFields.extend({ id: z.string().min(1) });

type SponsorFields = z.infer<typeof sponsorFields>;

// Empty optional strings become null in the database.
function toInput(data: SponsorFields) {
	return {
		description: data.description ? data.description : null,
		logoUrl: data.logoUrl ? data.logoUrl : null,
		name: data.name,
		sortOrder: data.sortOrder,
		status: data.status,
		tier: data.tier,
		url: data.url,
	};
}

// Public: active sponsors for the /sponsors page. Returns [] when the database
// isn't configured (or the table isn't migrated yet) so the page still renders
// its honest empty state instead of failing.
export const listSponsorsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<SponsorRecord[]> => {
		if (!hasDatabaseBinding) {
			return [];
		}
		try {
			return await listActiveSponsors();
		} catch {
			return [];
		}
	}
);

export const adminListSponsorsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<SponsorRecord[]> => {
		await requireAdmin(getRequest());
		if (!hasDatabaseBinding) {
			return [];
		}
		return await listAllSponsors();
	}
);

export const adminCreateSponsorFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => sponsorFields.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin(getRequest());
		return await createSponsor(toInput(data));
	});

export const adminUpdateSponsorFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => sponsorUpdateFields.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin(getRequest());
		const { id, ...rest } = data;
		return await updateSponsor(id, toInput(rest));
	});

export const adminDeleteSponsorFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) =>
		z.object({ id: z.string().min(1) }).parse(data)
	)
	.handler(async ({ data }) => {
		await requireAdmin(getRequest());
		await deleteSponsor(data.id);
		return { ok: true };
	});
