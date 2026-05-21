import { resolveSessionUserId } from "@/actions/session";
import {
	getMaintainerDashboard,
	type MaintainerDashboard,
} from "@/data-access/maintainer-dashboard";
import { backfillMaintainerLinks } from "@/data-access/maintainers";
import type { RuntimeBindings } from "@/env";

export type MaintainerDashboardResult =
	| { ok: false; status: number; error: string }
	| { ok: true; dashboard: MaintainerDashboard };

export async function getMaintainerDashboardForRequest({
	env,
	request,
}: {
	env?: RuntimeBindings;
	request: Request;
}): Promise<MaintainerDashboardResult> {
	const resolved = await resolveSessionUserId({ env, request });
	if (!resolved.ok) {
		return resolved;
	}
	// Link installations this user installed before signing in, so a brand-new
	// maintainer's first dashboard load reflects what they actually maintain.
	await backfillMaintainerLinks(resolved.userId);
	return { dashboard: await getMaintainerDashboard(resolved.userId), ok: true };
}
