import type { IncomingRequestCfProperties } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";
import { getAppUrl, type RuntimeBindings, runtimeBindings } from "@/env";

type CloudflareRequest = Request & {
	cf?: IncomingRequestCfProperties;
};

const configuredGithubProvider = (env: RuntimeBindings) => {
	if (!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)) {
		return;
	}
	return {
		github: {
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
		},
	};
};

export const createAuth = ({
	env,
	request,
}: {
	env?: RuntimeBindings;
	request: Request;
}) => {
	const bindings = { ...runtimeBindings(), ...env };
	const appUrl = bindings.VITE_APP_URL ?? getAppUrl();
	const cfRequest = request as CloudflareRequest;

	return betterAuth({
		...withCloudflare(
			{
				autoDetectIpAddress: true,
				cf: cfRequest.cf ?? null,
				d1Native: bindings.clankers_db,
				geolocationTracking: false,
			},
			{
				secret: bindings.BETTER_AUTH_SECRET,
				socialProviders: configuredGithubProvider(bindings),
				trustedOrigins: [appUrl],
			}
		),
		baseURL: appUrl,
	});
};

export const getAuthConfigStatus = (env?: RuntimeBindings) => {
	const bindings = { ...runtimeBindings(), ...env };
	const missing = [
		["BETTER_AUTH_SECRET", bindings.BETTER_AUTH_SECRET],
		["clankers_db", bindings.clankers_db],
		["GITHUB_CLIENT_ID", bindings.GITHUB_CLIENT_ID],
		["GITHUB_CLIENT_SECRET", bindings.GITHUB_CLIENT_SECRET],
	]
		.filter(([, value]) => !value)
		.map(([key]) => key);

	return {
		isConfigured: missing.length === 0,
		missing,
	};
};
