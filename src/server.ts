import handler from "@tanstack/react-start/server-entry";

import { handleGithubWebhook, verifyGithubSignature } from "./actions/github";
import {
	convertGithubManifestCode,
	githubAppManifest,
} from "./actions/github-manifest";
import { createAuth, getAuthConfigStatus } from "./auth";
import {
	listClankersApi,
	listProtectorsApi,
	listPublicFeed,
} from "./data-access/directory";
import {
	parseClankerFilters,
	parseProtectorFilters,
} from "./data-access/directory-filters";
import type { RuntimeBindings } from "./env";

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

export default {
	async fetch(
		request: Request,
		env: RuntimeBindings | undefined,
		context?: ExecutionContext
	) {
		if (env) {
			(globalThis as GlobalWithRuntime).__env__ = env;
		}
		const url = new URL(request.url);

		if (url.pathname === "/sitemap.xml") {
			return withSecurityHeaders(
				new Response(sitemap(), {
					headers: {
						"Content-Type": "application/xml; charset=utf-8",
					},
				})
			);
		}

		if (url.pathname.startsWith("/api/auth")) {
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
		}

		if (
			url.pathname === "/api/feed.json" ||
			url.pathname === "/api/risky-users.json"
		) {
			return withSecurityHeaders(Response.json(await listPublicFeed()));
		}

		if (url.pathname === "/api/clankers") {
			return withSecurityHeaders(
				Response.json(
					await listClankersApi(parseClankerFilters(url.searchParams))
				)
			);
		}

		if (url.pathname === "/api/protectors") {
			return withSecurityHeaders(
				Response.json(
					await listProtectorsApi(parseProtectorFilters(url.searchParams))
				)
			);
		}

		if (url.pathname === "/api/github/manifest") {
			return withSecurityHeaders(Response.json(githubAppManifest()));
		}

		if (
			url.pathname === "/api/github/manifest/convert" &&
			request.method === "POST"
		) {
			const body = (await request.json()) as { code?: string };
			if (!body.code) {
				return withSecurityHeaders(
					Response.json({ error: "Missing manifest code." }, { status: 400 })
				);
			}
			return withSecurityHeaders(
				Response.json(await convertGithubManifestCode(body.code))
			);
		}

		if (url.pathname === "/api/github/webhook" && request.method === "POST") {
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
		}

		return withSecurityHeaders(handler.fetch(request));
	},
};
