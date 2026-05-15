import handler from "@tanstack/react-start/server-entry";
import {
	listClankersApi,
	listProtectorsApi,
	listPublicFeed,
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

const sitemap = () =>
	[
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/clankers</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/protectors</loc></url>",
		"  <url><loc>https://oss-protector.raedbahri90.workers.dev/api-docs</loc></url>",
		"</urlset>",
	].join("\n");

async function withSecurityHeaders(
	responseOrPromise: Promise<Response> | Response
) {
	const response = await responseOrPromise;
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(key, value);
	}
	return response;
}

const clientKey = (request: Request) =>
	request.headers.get("cf-connecting-ip") ??
	request.headers.get("x-forwarded-for") ??
	"anonymous";

const tooManyRequests = () =>
	withSecurityHeaders(
		Response.json(
			{ error: "Too many requests. Try again in a minute." },
			{ headers: { "Retry-After": "60" }, status: 429 }
		)
	);

async function enforcePublicRateLimit(
	request: Request,
	env: RuntimeBindings | undefined
) {
	const binding = env?.PUBLIC_RL;
	if (!binding) {
		return null;
	}
	try {
		const result = await binding.limit({ key: clientKey(request) });
		return result.success ? null : tooManyRequests();
	} catch (caught) {
		console.warn("Rate limit check failed; allowing request.", caught);
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

const publicFeedResponse = async (
	request: Request,
	env: RuntimeBindings | undefined
) => {
	const limited = await enforcePublicRateLimit(request, env);
	if (limited) {
		return limited;
	}
	return withSecurityHeaders(Response.json(await listPublicFeed()));
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
	if (path === "/api/feed.json" || path === "/api/risky-users.json") {
		return publicFeedResponse(request, env);
	}
	if (path === "/api/clankers") {
		return clankersResponse(request, env, url.searchParams);
	}
	if (path === "/api/protectors") {
		return protectorsResponse(request, env, url.searchParams);
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
	return withSecurityHeaders(handler.fetch(request));
};

export default {
	fetch(
		request: Request,
		env: RuntimeBindings | undefined,
		context?: ExecutionContext
	) {
		if (env) {
			(globalThis as GlobalWithRuntime).__env__ = env;
		}
		return routeFetch(request, env, context);
	},
};
