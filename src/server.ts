import handler from "@tanstack/react-start/server-entry";
import { handleGithubWebhook } from "./actions/github";
import {
	convertGithubManifestCode,
	githubAppManifest,
} from "./actions/github-manifest";
import { listPublicFeed } from "./data-access/guard";
import type { RuntimeBindings } from "./env";

type GlobalWithRuntime = typeof globalThis & {
	__env__?: RuntimeBindings;
};

const SECURITY_HEADERS = {
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
} as const;

async function withSecurityHeaders(
	responseOrPromise: Promise<Response> | Response,
) {
	const response = await responseOrPromise;
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(key, value);
	}
	return response;
}

export default {
	async fetch(request: Request, env: RuntimeBindings) {
		(globalThis as GlobalWithRuntime).__env__ = env;
		const url = new URL(request.url);

		if (url.pathname === "/api/feed.json") {
			return withSecurityHeaders(Response.json(await listPublicFeed()));
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
					Response.json({ error: "Missing manifest code." }, { status: 400 }),
				);
			}
			return withSecurityHeaders(
				Response.json(await convertGithubManifestCode(body.code)),
			);
		}

		if (url.pathname === "/api/github/webhook" && request.method === "POST") {
			return withSecurityHeaders(
				handleGithubWebhook({
					body: await request.text(),
					deliveryId: request.headers.get("x-github-delivery"),
					eventName: request.headers.get("x-github-event") ?? "unknown",
					signature: request.headers.get("x-hub-signature-256"),
				}),
			);
		}

		return withSecurityHeaders(handler.fetch(request));
	},
};
