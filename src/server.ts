import handler from "@tanstack/react-start/server-entry";
import { resolveAppeal, submitAppeal } from "./actions/appeal";
import { drainBackfillJobs } from "./actions/backfill";
import {
	listClankersApi,
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
import { createAuth, getAuthConfigStatus } from "./auth";
import type { RuntimeBindings } from "./env";
import {
	parseClankerFilters,
	parseProtectorFilters,
} from "./helpers/directory-filters";
import { verifyGithubSignature } from "./helpers/github-webhook";

type GlobalWithRuntime = typeof globalThis & {
	__env__?: RuntimeBindings;
};

type RequestWithWaitUntil = Request & {
	waitUntil?: (promise: Promise<unknown>) => void;
};

const SECURITY_HEADERS = {
	"Content-Security-Policy":
		"default-src 'self'; base-uri 'self'; connect-src 'self' https://api.github.com https://openrouter.ai; form-action 'self' https://github.com; frame-ancestors 'none'; img-src 'self' https://github.com https://avatars.githubusercontent.com https://startupfa.me https://launchigniter.com https://api.producthunt.com data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
	"Referrer-Policy": "strict-origin-when-cross-origin",
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
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/api-docs</loc></url>",
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
	const hextets = expanded.split(":");
	const known = hextets.filter((h) => h !== "").slice(0, 4);
	return `${known.join(":")}::/64`;
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

const clankersResponse = async (
	request: Request,
	env: RuntimeBindings | undefined,
	searchParams: URLSearchParams
) => {
	const limited = await enforcePublicRateLimit(request, env);
	if (limited) {
		return limited;
	}
	return withSecurityHeaders(
		Response.json(await listClankersApi(parseClankerFilters(searchParams)))
	);
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
	return withSecurityHeaders(
		Response.json(await listProtectorsApi(parseProtectorFilters(searchParams)))
	);
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

const routeFetch = (
	request: Request,
	env: RuntimeBindings | undefined,
	context: ExecutionContext | undefined
): Promise<Response> => {
	const url = new URL(request.url);
	const path = url.pathname;
	const method = request.method;

	if (path === "/sitemap.xml") {
		return sitemapResponse();
	}
	if (path.startsWith("/api/auth")) {
		return authResponse(request, env);
	}
	if (path === "/api/clankers") {
		return clankersResponse(request, env, url.searchParams);
	}
	if (path === "/api/protectors") {
		return protectorsResponse(request, env, url.searchParams);
	}
	if (path === "/api/health/recent-webhook") {
		return recentWebhookResponse(request, env, url.searchParams);
	}
	if (path === "/api/github/manifest") {
		return withSecurityHeaders(Response.json(githubAppManifest()));
	}
	if (path === "/api/github/manifest/convert" && method === "POST") {
		return manifestConvertResponse(request);
	}
	if (path === "/api/maintainer/decision" && method === "POST") {
		return maintainerDecisionResponse(request, env);
	}
	const sessionRoute = sessionApiRoute(request, env, path, method);
	if (sessionRoute) {
		return sessionRoute;
	}
	if (path === "/api/appeal" && method === "POST") {
		return appealResponse(request, env);
	}
	if (path === "/api/github/webhook" && method === "POST") {
		return webhookResponse(request, context);
	}
	return withSecurityHeaders(handler.fetch(request));
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
