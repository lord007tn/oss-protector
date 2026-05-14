import handler from "@tanstack/react-start/server-entry";
import { handleGithubWebhook, verifyGithubSignature } from "./actions/github";
import {
	convertGithubManifestCode,
	githubAppManifest,
} from "./actions/github-manifest";
import { listPublicFeed } from "./data-access/guard";
import type { RuntimeBindings } from "./env";

type GlobalWithRuntime = typeof globalThis & {
	__env__?: RuntimeBindings;
};

type RequestWithWaitUntil = Request & {
	waitUntil?: (promise: Promise<unknown>) => void;
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
	async fetch(
		request: Request,
		env: RuntimeBindings,
		context?: ExecutionContext,
	) {
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
			const body = await request.text();
			const signature = request.headers.get("x-hub-signature-256");
			const verified = await verifyGithubSignature({ body, signature });
			if (!verified) {
				return withSecurityHeaders(
					new Response("Invalid GitHub webhook signature", { status: 401 }),
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
				Response.json({ ok: true, queued: true }, { status: 200 }),
			);
		}

		return withSecurityHeaders(handler.fetch(request));
	},
};
