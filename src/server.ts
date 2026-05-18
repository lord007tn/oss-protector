import handler from "@tanstack/react-start/server-entry";
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
		"default-src 'self'; base-uri 'self'; connect-src 'self' https://api.github.com https://openrouter.ai; form-action 'self' https://github.com; frame-ancestors 'none'; img-src 'self' https://github.com https://avatars.githubusercontent.com data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
} as const;

const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const isInvalidClankerProfilePath = (path: string) => {
	if (!path.startsWith("/clankers/")) {
		return false;
	}
	const login = path.slice("/clankers/".length);
	try {
		return !GITHUB_LOGIN_PATTERN.test(decodeURIComponent(login));
	} catch {
		return true;
	}
};

const sitemap = () =>
	[
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/clankers</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/protectors</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/api-docs</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/contest</loc></url>",
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
					error: "GitHub sign-in is not configured.",
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
	if (path === "/api/github/webhook" && method === "POST") {
		return webhookResponse(request, context);
	}
	if (isInvalidClankerProfilePath(path)) {
		return withSecurityHeaders(
			Response.redirect(new URL("/clankers", request.url))
		);
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
};
