import handler from "@tanstack/react-start/server-entry";
import { resolveAppeal, submitAppeal } from "./actions/appeal";
import { drainBackfillJobs } from "./actions/backfill";
import {
	listAccountsApi,
	listProtectorsApi,
	recentWebhookEvents,
} from "./actions/directory";
import { handleGithubWebhook } from "./actions/github";
import {
	convertGithubManifestCode,
	githubAppManifest,
} from "./actions/github-manifest";
import { applyMaintainerDecision } from "./actions/maintainer";
import { getMaintainerDashboardForRequest } from "./actions/maintainer-dashboard";
import {
	listNotificationsForRequest,
	markAllNotificationsReadForRequest,
	markNotificationReadForRequest,
} from "./actions/notifications";
import {
	applyRepoDecision,
	clearRepoDecision,
	listMyRepoDecisions,
} from "./actions/repo-decisions";
import {
	applyRepoPolicy,
	clearRepoPolicyForMaintainer,
	getRepoPolicyForMaintainer,
} from "./actions/repo-policy";
import {
	applyUserPreferencesUpdate,
	getCurrentUserPreferences,
	testOpenRouterKey,
} from "./actions/user-preferences";
import { createAuth, getAuthConfigStatus } from "./auth";
import type { RuntimeBindings } from "./env";
import {
	FilterValidationError,
	parseAccountFilters,
	parseProtectorFilters,
} from "./helpers/directory-filters";
import { verifyGithubSignature } from "./helpers/github-webhook";
import { PLATFORM_FREE_MODEL_CHAIN } from "./integrations/openrouter/validation";

type GlobalWithRuntime = typeof globalThis & {
	__env__?: RuntimeBindings;
};

type RequestWithWaitUntil = Request & {
	waitUntil?: (promise: Promise<unknown>) => void;
};

// `'unsafe-inline'` is intentionally kept on script-src and style-src because
// TanStack Start emits an inline hydration bootstrap and Tailwind injects a
// few runtime style nodes — both fail under strict CSP. We mitigate by
// keeping every other directive tight: explicit object-src/frame-src none,
// data: dropped from img-src (no inlined data URIs in this codebase), and
// SVGs served from /assets via 'self'.
const CSP_DIRECTIVES = [
	"default-src 'self'",
	"base-uri 'self'",
	"object-src 'none'",
	"frame-src 'none'",
	"frame-ancestors 'none'",
	"form-action 'self' https://github.com",
	"connect-src 'self' https://api.github.com https://openrouter.ai",
	"img-src 'self' https://github.com https://avatars.githubusercontent.com https://startupfa.me https://launchigniter.com https://api.producthunt.com",
	"script-src 'self' 'unsafe-inline'",
	"style-src 'self' 'unsafe-inline'",
	// Geist is self-hosted (see styles.css / @fontsource-variable); woff2 ships
	// from /assets on our own origin, so no external font host is needed.
	"font-src 'self'",
].join("; ");

// Deny-by-default Permissions-Policy. Every powerful capability we don't use
// is named explicitly so a future framework or library that requests one
// gets a deterministic deny, not the user-agent default.
const PERMISSIONS_POLICY = [
	"accelerometer=()",
	"autoplay=()",
	"bluetooth=()",
	"camera=()",
	"display-capture=()",
	"encrypted-media=()",
	"fullscreen=(self)",
	"geolocation=()",
	"gyroscope=()",
	"hid=()",
	"identity-credentials-get=()",
	"idle-detection=()",
	"keyboard-map=()",
	"local-fonts=()",
	"magnetometer=()",
	"microphone=()",
	"midi=()",
	"payment=()",
	"picture-in-picture=()",
	"publickey-credentials-get=()",
	"screen-wake-lock=()",
	"serial=()",
	"sync-xhr=()",
	"usb=()",
	"web-share=()",
	"xr-spatial-tracking=()",
].join(", ");

const SECURITY_HEADERS = {
	"Content-Security-Policy": CSP_DIRECTIVES,
	"Permissions-Policy": PERMISSIONS_POLICY,
	// Origin-only (no path or query) on cross-origin; no referrer at all
	// downgrading HTTPS → HTTP. Tighter than the default
	// `strict-origin-when-cross-origin` which leaks the full same-origin URL.
	"Referrer-Policy": "strict-origin",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
} as const;

const sitemap = () =>
	[
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/accounts</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/feed</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/protectors</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/docs</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/appeal</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/methodology</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/privacy</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/terms</loc></url>",
		"</urlset>",
	].join("\n");

async function withSecurityHeaders(
	responseOrPromise: Promise<Response> | Response
) {
	const original = await responseOrPromise;
	const response = new Response(original.body, original);
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(key, value);
	}
	return response;
}

// Collapse an IPv6 address to its /64 subnet (first four hextets). Dual-stack
// clients commonly egress from a /64 pool, so per-/128 buckets are trivially
// bypassed. IPv4 addresses pass through unchanged. Unknown clients share a
// single "anonymous" bucket.
const bucketIp = (ip: string) => {
	if (!ip.includes(":")) {
		return ip;
	}
	const expanded = ip.split("%")[0].toLowerCase();
	// Expand the `::` compression so positional information is preserved before
	// we take the /64 prefix. Filtering empty hextets without expanding would
	// collapse different /64s into the same bucket (e.g. 2001:db8::1 and
	// 2001:db8:0:0:1:2:3:4 both producing `2001:db8:1::/64`).
	const [head, tail] = expanded.includes("::")
		? expanded.split("::", 2)
		: [expanded, ""];
	const headHextets = head ? head.split(":") : [];
	const tailHextets = tail ? tail.split(":") : [];
	const zerosNeeded = Math.max(0, 8 - headHextets.length - tailHextets.length);
	const zeros = new Array(zerosNeeded).fill("0");
	const fullHextets = [...headHextets, ...zeros, ...tailHextets];
	const prefix = fullHextets.slice(0, 4).join(":");
	return `${prefix}::/64`;
};

const clientKey = (request: Request) => {
	const ip =
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
		"";
	return ip ? bucketIp(ip) : "anonymous";
};

const tooManyRequests = () =>
	withSecurityHeaders(
		Response.json(
			{ error: "Too many requests. Try again in a minute." },
			{
				headers: {
					"Retry-After": "60",
					"X-RateLimit-Hit": "1",
				},
				status: 429,
			}
		)
	);

async function enforcePublicRateLimit(
	request: Request,
	env: RuntimeBindings | undefined
) {
	const binding = env?.PUBLIC_RL;
	if (!binding) {
		console.log(
			"rate-limit: PUBLIC_RL binding missing; env keys =",
			env ? Object.keys(env).join(",") : "env undefined"
		);
		return null;
	}
	const key = clientKey(request);
	try {
		const result = await binding.limit({ key });
		if (!result.success) {
			return tooManyRequests();
		}
		return null;
	} catch (caught) {
		console.warn("rate-limit: check failed; allowing request", caught);
		return null;
	}
}

const sitemapResponse = () =>
	withSecurityHeaders(
		new Response(sitemap(), {
			headers: { "Content-Type": "application/xml; charset=utf-8" },
		})
	);

const authResponse = (request: Request, env: RuntimeBindings | undefined) => {
	const authConfig = getAuthConfigStatus(env);
	if (!authConfig.isConfigured) {
		return withSecurityHeaders(
			Response.json(
				{
					error: "Sign-in is not configured on this deployment.",
					missing: authConfig.missing,
				},
				{ status: 503 }
			)
		);
	}
	return withSecurityHeaders(createAuth({ env, request }).handler(request));
};

const accountsResponse = async (
	request: Request,
	env: RuntimeBindings | undefined,
	searchParams: URLSearchParams
) => {
	const limited = await enforcePublicRateLimit(request, env);
	if (limited) {
		return limited;
	}
	try {
		const filters = parseAccountFilters(searchParams);
		return withSecurityHeaders(Response.json(await listAccountsApi(filters)));
	} catch (caught) {
		if (caught instanceof FilterValidationError) {
			return withSecurityHeaders(
				Response.json(
					{
						allowed: caught.allowed,
						error: caught.message,
						field: caught.field,
						value: caught.value,
					},
					{ status: 400 }
				)
			);
		}
		throw caught;
	}
};

const protectorsResponse = async (
	request: Request,
	env: RuntimeBindings | undefined,
	searchParams: URLSearchParams
) => {
	const limited = await enforcePublicRateLimit(request, env);
	if (limited) {
		return limited;
	}
	try {
		const filters = parseProtectorFilters(searchParams);
		return withSecurityHeaders(Response.json(await listProtectorsApi(filters)));
	} catch (caught) {
		if (caught instanceof FilterValidationError) {
			return withSecurityHeaders(
				Response.json(
					{
						allowed: caught.allowed,
						error: caught.message,
						field: caught.field,
						value: caught.value,
					},
					{ status: 400 }
				)
			);
		}
		throw caught;
	}
};

const recentWebhookResponse = async (
	request: Request,
	env: RuntimeBindings | undefined,
	params: URLSearchParams
) => {
	const configuredToken = env?.SMOKE_HEALTH_TOKEN?.trim();
	const authorization = request.headers.get("authorization") ?? "";
	const suppliedToken = authorization.startsWith("Bearer ")
		? authorization.slice("Bearer ".length).trim()
		: "";
	if (!configuredToken || suppliedToken !== configuredToken) {
		return withSecurityHeaders(
			Response.json({ error: "Not found" }, { status: 404 })
		);
	}
	const repo = params.get("repo") ?? "";
	const since = Number(params.get("since") ?? "0");
	if (!repo) {
		return withSecurityHeaders(
			Response.json({ error: "Missing repo" }, { status: 400 })
		);
	}
	return withSecurityHeaders(
		Response.json(
			await recentWebhookEvents({
				repositoryFullName: repo,
				sinceSeconds: Number.isFinite(since) ? since : 0,
			})
		)
	);
};

const maintainerDecisionResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const body = (await request.json()) as {
		decision?: string;
		login?: string;
	};
	if (!(body.login && body.decision)) {
		return withSecurityHeaders(
			Response.json({ error: "Missing login or decision." }, { status: 400 })
		);
	}
	const result = await applyMaintainerDecision({
		decision: body.decision,
		env,
		login: body.login,
		request,
	});
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(Response.json(result));
};

const maintainerDashboardResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const result = await getMaintainerDashboardForRequest({ env, request });
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(Response.json(result));
};

const notificationsListResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const result = await listNotificationsForRequest({ env, request });
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(Response.json(result));
};

const notificationReadResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const body = (await request.json()) as { id?: string };
	if (!body.id) {
		return withSecurityHeaders(
			Response.json({ error: "Missing notification id." }, { status: 400 })
		);
	}
	const result = await markNotificationReadForRequest({
		env,
		id: body.id,
		request,
	});
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(Response.json(result));
};

const notificationReadAllResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const result = await markAllNotificationsReadForRequest({ env, request });
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(Response.json(result));
};

const appealResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const body = (await request.json()) as {
		email?: string;
		evidence?: string[];
		login?: string;
		relationship?: string;
		story?: string;
	};
	const result = await submitAppeal({
		env,
		input: {
			email: body.email,
			evidence: body.evidence,
			login: body.login ?? "",
			relationship: body.relationship,
			story: body.story ?? "",
		},
		request,
	});
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(Response.json(result));
};

const appealResolveResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const body = (await request.json()) as {
		id?: string;
		resolution?: string;
	};
	if (!(body.id && body.resolution)) {
		return withSecurityHeaders(
			Response.json({ error: "Missing id or resolution." }, { status: 400 })
		);
	}
	const result = await resolveAppeal({
		env,
		id: body.id,
		request,
		resolution: body.resolution,
	});
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(Response.json(result));
};

const manifestConvertResponse = async (request: Request) => {
	const body = (await request.json()) as { code?: string };
	if (!body.code) {
		return withSecurityHeaders(
			Response.json({ error: "Missing manifest code." }, { status: 400 })
		);
	}
	return withSecurityHeaders(
		Response.json(await convertGithubManifestCode(body.code))
	);
};

const webhookResponse = async (
	request: Request,
	context: ExecutionContext | undefined
) => {
	const body = await request.text();
	const signature = request.headers.get("x-hub-signature-256");
	const verified = await verifyGithubSignature({ body, signature });
	if (!verified) {
		return withSecurityHeaders(
			new Response("Invalid GitHub webhook signature", { status: 401 })
		);
	}

	const queuedProcessing = handleGithubWebhook({
		body,
		deliveryId: request.headers.get("x-github-delivery"),
		eventName: request.headers.get("x-github-event") ?? "unknown",
		signature,
		skipSignatureVerification: true,
	})
		.then(() => undefined)
		.catch((caught) => {
			console.error("Queued GitHub webhook processing failed", caught);
		});
	const waitUntil =
		context?.waitUntil?.bind(context) ??
		(request as RequestWithWaitUntil).waitUntil;
	waitUntil?.(queuedProcessing);
	return withSecurityHeaders(
		Response.json({ ok: true, queued: true }, { status: 200 })
	);
};

// Grouped so routeFetch stays under the cognitive-complexity budget. Returns
// null when the path/method pair isn't one of these session-guarded routes.
const sessionApiRoute = (
	request: Request,
	env: RuntimeBindings | undefined,
	path: string,
	method: string
): Promise<Response> | null => {
	if (path === "/api/dashboard" && method === "GET") {
		return maintainerDashboardResponse(request, env);
	}
	if (path === "/api/notifications" && method === "GET") {
		return notificationsListResponse(request, env);
	}
	if (path === "/api/notifications/read" && method === "POST") {
		return notificationReadResponse(request, env);
	}
	if (path === "/api/notifications/read-all" && method === "POST") {
		return notificationReadAllResponse(request, env);
	}
	if (path === "/api/appeals/resolve" && method === "POST") {
		return appealResolveResponse(request, env);
	}
	return null;
};

const userPreferencesGetResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const result = await getCurrentUserPreferences({ env, request });
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(
		Response.json({ ok: true, preferences: result.preferences })
	);
};

const userPreferencesPostResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return withSecurityHeaders(
			Response.json({ error: "Invalid JSON body." }, { status: 400 })
		);
	}
	if (!payload || typeof payload !== "object") {
		return withSecurityHeaders(
			Response.json({ error: "Invalid payload." }, { status: 400 })
		);
	}
	const result = await applyUserPreferencesUpdate({
		env,
		payload: payload as Record<string, unknown>,
		request,
	});
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(
		Response.json({ ok: true, preferences: result.preferences })
	);
};

const openRouterTestResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const session = await createAuth({ env, request }).api.getSession({
		headers: request.headers,
	});
	if (!session?.user) {
		return withSecurityHeaders(
			Response.json({ error: "Sign in required." }, { status: 401 })
		);
	}
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return withSecurityHeaders(
			Response.json({ error: "Invalid JSON body." }, { status: 400 })
		);
	}
	const apiKey =
		typeof (payload as Record<string, unknown> | null)?.apiKey === "string"
			? ((payload as Record<string, unknown>).apiKey as string)
			: "";
	const result = await testOpenRouterKey({ apiKey });
	return withSecurityHeaders(
		Response.json(result, { status: result.ok ? 200 : result.status })
	);
};

const repoDecisionPostResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return withSecurityHeaders(
			Response.json({ error: "Invalid JSON body." }, { status: 400 })
		);
	}
	if (!payload || typeof payload !== "object") {
		return withSecurityHeaders(
			Response.json({ error: "Invalid payload." }, { status: 400 })
		);
	}
	const result = await applyRepoDecision({
		env,
		payload: payload as Record<string, unknown>,
		request,
	});
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(
		Response.json({ decision: result.decision, ok: true })
	);
};

const repoDecisionDeleteResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return withSecurityHeaders(
			Response.json({ error: "Invalid JSON body." }, { status: 400 })
		);
	}
	if (!payload || typeof payload !== "object") {
		return withSecurityHeaders(
			Response.json({ error: "Invalid payload." }, { status: 400 })
		);
	}
	const result = await clearRepoDecision({
		env,
		payload: payload as Record<string, unknown>,
		request,
	});
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(
		Response.json({ cleared: result.cleared, ok: true })
	);
};

const repoDecisionListResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const result = await listMyRepoDecisions({ env, request });
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(
		Response.json({ decisions: result.decisions, ok: true })
	);
};

const repoPolicyGetResponse = async (
	request: Request,
	env: RuntimeBindings | undefined,
	searchParams: URLSearchParams
) => {
	const repositoryId = searchParams.get("repositoryId") ?? "";
	if (!repositoryId) {
		return withSecurityHeaders(
			Response.json(
				{ error: "Missing repositoryId query param." },
				{ status: 400 }
			)
		);
	}
	const result = await getRepoPolicyForMaintainer({
		env,
		repositoryId,
		request,
	});
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(
		Response.json({ ok: true, policy: result.policy })
	);
};

const repoPolicyPostResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return withSecurityHeaders(
			Response.json({ error: "Invalid JSON body." }, { status: 400 })
		);
	}
	if (!payload || typeof payload !== "object") {
		return withSecurityHeaders(
			Response.json({ error: "Invalid payload." }, { status: 400 })
		);
	}
	const result = await applyRepoPolicy({
		env,
		payload: payload as Record<string, unknown>,
		request,
	});
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(
		Response.json({ ok: true, policy: result.policy })
	);
};

const repoPolicyDeleteResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	let payload: unknown;
	try {
		payload = await request.json();
	} catch {
		return withSecurityHeaders(
			Response.json({ error: "Invalid JSON body." }, { status: 400 })
		);
	}
	if (!payload || typeof payload !== "object") {
		return withSecurityHeaders(
			Response.json({ error: "Invalid payload." }, { status: 400 })
		);
	}
	const result = await clearRepoPolicyForMaintainer({
		env,
		payload: payload as Record<string, unknown>,
		request,
	});
	if (!result.ok) {
		return withSecurityHeaders(
			Response.json({ error: result.error }, { status: result.status })
		);
	}
	return withSecurityHeaders(
		Response.json({ ok: true, policy: result.policy })
	);
};

const FREE_MODEL_SUFFIX = /:free$/;

const openRouterFreeModelsResponse = () =>
	withSecurityHeaders(
		Response.json({
			generated_at: new Date().toISOString(),
			models: PLATFORM_FREE_MODEL_CHAIN.map((model) => ({
				id: model,
				tier: "free",
				url: `https://openrouter.ai/${model.replace(FREE_MODEL_SUFFIX, "")}`,
			})),
			note: "Model IDs ending in :free are no-cost via OpenRouter's free tier. Maintainers who bring their own OpenRouter key get the full catalog including paid fallback.",
		})
	);

type RouteHandler = (input: {
	context: ExecutionContext | undefined;
	env: RuntimeBindings | undefined;
	request: Request;
	url: URL;
}) => Promise<Response>;

interface RouteEntry {
	handler: RouteHandler;
	method?: string;
	path: string | ((path: string) => boolean);
}

const ROUTES: RouteEntry[] = [
	{ path: "/sitemap.xml", handler: () => sitemapResponse() },
	// /api-docs was renamed to /docs in v1.1. 301 keeps old external links and
	// social-card scrapers working.
	{
		path: "/api-docs",
		handler: () =>
			Promise.resolve(
				new Response(null, {
					headers: { Location: "/docs" },
					status: 301,
				})
			),
	},
	{
		path: (path) => path.startsWith("/api/auth"),
		handler: ({ env, request }) => authResponse(request, env),
	},
	{
		path: "/api/accounts",
		handler: ({ env, request, url }) =>
			accountsResponse(request, env, url.searchParams),
	},
	{
		path: "/api/protectors",
		handler: ({ env, request, url }) =>
			protectorsResponse(request, env, url.searchParams),
	},
	{
		path: "/api/health/recent-webhook",
		handler: ({ env, request, url }) =>
			recentWebhookResponse(request, env, url.searchParams),
	},
	{
		path: "/api/github/manifest",
		handler: () =>
			Promise.resolve(withSecurityHeaders(Response.json(githubAppManifest()))),
	},
	{
		path: "/api/github/manifest/convert",
		method: "POST",
		handler: ({ request }) => manifestConvertResponse(request),
	},
	{
		path: "/api/maintainer/decision",
		method: "POST",
		handler: ({ env, request }) => maintainerDecisionResponse(request, env),
	},
	{
		path: "/api/maintainer/repo-decision",
		method: "POST",
		handler: ({ env, request }) => repoDecisionPostResponse(request, env),
	},
	{
		path: "/api/maintainer/repo-decision",
		method: "DELETE",
		handler: ({ env, request }) => repoDecisionDeleteResponse(request, env),
	},
	{
		path: "/api/maintainer/repo-decisions",
		method: "GET",
		handler: ({ env, request }) => repoDecisionListResponse(request, env),
	},
	{
		path: "/api/maintainer/repo-policy",
		method: "GET",
		handler: ({ env, request, url }) =>
			repoPolicyGetResponse(request, env, url.searchParams),
	},
	{
		path: "/api/maintainer/repo-policy",
		method: "POST",
		handler: ({ env, request }) => repoPolicyPostResponse(request, env),
	},
	{
		path: "/api/maintainer/repo-policy",
		method: "DELETE",
		handler: ({ env, request }) => repoPolicyDeleteResponse(request, env),
	},
	{
		path: "/api/user/preferences",
		method: "GET",
		handler: ({ env, request }) => userPreferencesGetResponse(request, env),
	},
	{
		path: "/api/user/preferences",
		method: "POST",
		handler: ({ env, request }) => userPreferencesPostResponse(request, env),
	},
	{
		path: "/api/openrouter/test",
		method: "POST",
		handler: ({ env, request }) => openRouterTestResponse(request, env),
	},
	{
		path: "/api/openrouter/free-models",
		method: "GET",
		handler: () => Promise.resolve(openRouterFreeModelsResponse()),
	},
	{
		path: "/api/appeal",
		method: "POST",
		handler: ({ env, request }) => appealResponse(request, env),
	},
	{
		path: "/api/github/webhook",
		method: "POST",
		handler: ({ context, request }) => webhookResponse(request, context),
	},
];

const matchesRoute = (entry: RouteEntry, path: string, method: string) => {
	const pathMatches =
		typeof entry.path === "string" ? entry.path === path : entry.path(path);
	if (!pathMatches) {
		return false;
	}
	if (entry.method && entry.method !== method) {
		return false;
	}
	return true;
};

const routeFetch = (
	request: Request,
	env: RuntimeBindings | undefined,
	context: ExecutionContext | undefined
): Promise<Response> => {
	const url = new URL(request.url);
	const path = url.pathname;
	const method = request.method;

	for (const entry of ROUTES) {
		if (matchesRoute(entry, path, method)) {
			return entry.handler({ context, env, request, url });
		}
	}
	const sessionRoute = sessionApiRoute(request, env, path, method);
	if (sessionRoute) {
		return sessionRoute;
	}
	return Promise.resolve(withSecurityHeaders(handler.fetch(request)));
};

export default {
	fetch(
		request: Request,
		envArg: RuntimeBindings | undefined,
		context?: ExecutionContext
	) {
		// Nitro's cloudflare_module wrapper invokes our handler through
		// `nitroApp.fetch(request)`, which drops the env/context args. Nitro
		// stashes env on globalThis.__env__ before that — so fall back to it.
		const env =
			envArg ?? (globalThis as GlobalWithRuntime).__env__ ?? undefined;
		if (env) {
			(globalThis as GlobalWithRuntime).__env__ = env;
		}
		return routeFetch(request, env, context);
	},
	// Cron-triggered drain of the D1-backed backfill queue (replaces Cloudflare
	// Queues so backfill runs on the free Workers tier). Schedule is declared in
	// wrangler.json under triggers.crons.
	async scheduled(
		_controller: ScheduledController,
		envArg: RuntimeBindings | undefined
	) {
		const env =
			envArg ?? (globalThis as GlobalWithRuntime).__env__ ?? undefined;
		if (env) {
			(globalThis as GlobalWithRuntime).__env__ = env;
		}
		await drainBackfillJobs();
	},
};
