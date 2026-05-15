import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export interface RateLimitBinding {
	limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface RuntimeBindings {
	ALLOW_UNSIGNED_GITHUB_WEBHOOKS?: string;
	APP_NAME?: string;
	BETTER_AUTH_SECRET?: string;
	CLOUDFLARE_D1_DATABASE_NAME?: string;
	clankers_db?: D1Database;
	GITHUB_APP_CREATE_OWNER?: string;
	GITHUB_APP_ID?: string;
	GITHUB_APP_PRIVATE_KEY?: string;
	GITHUB_APP_SLUG?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	GITHUB_MANIFEST_TOKEN?: string;
	GITHUB_WEBHOOK_SECRET?: string;
	OPENROUTER_API_KEY?: string;
	PUBLIC_RL?: RateLimitBinding;
	VITE_APP_URL?: string;
}

type GlobalWithRuntime = typeof globalThis & {
	__devVars?: RuntimeBindings;
	__env__?: RuntimeBindings;
};

export const runtimeBindings = () => {
	const globals = globalThis as GlobalWithRuntime;
	return {
		...(typeof process === "undefined" ? {} : process.env),
		...globals.__devVars,
		...globals.__env__,
	};
};

export const runtimeEnv = () => {
	const { clankers_db: _db, PUBLIC_RL: _rl, ...envVars } = runtimeBindings();
	return envVars;
};

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_APP_URL: z.string().url().default("http://localhost:3000"),
		VITE_ENABLE_GITHUB_AUTH: z.string().optional(),
	},
	runtimeEnv: runtimeEnv(),
	server: {
		APP_NAME: z.string().default("OSS Protector"),
		ALLOW_UNSIGNED_GITHUB_WEBHOOKS: z.string().optional(),
		BETTER_AUTH_SECRET: z.string().optional(),
		CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
		CLOUDFLARE_D1_DATABASE_ID: z.string().optional(),
		CLOUDFLARE_D1_DATABASE_NAME: z.string().default("clankers-list-db"),
		CLOUDFLARE_D1_TOKEN: z.string().optional(),
		GITHUB_APP_CREATE_OWNER: z.string().optional(),
		GITHUB_APP_ID: z.string().optional(),
		GITHUB_APP_PRIVATE_KEY: z.string().optional(),
		GITHUB_APP_SLUG: z.string().default("oss-protector"),
		GITHUB_CLIENT_ID: z.string().optional(),
		GITHUB_CLIENT_SECRET: z.string().optional(),
		GITHUB_MANIFEST_TOKEN: z.string().optional(),
		GITHUB_WEBHOOK_SECRET: z.string().optional(),
		OPENROUTER_API_KEY: z.string().optional(),
	},
});

export const getAppUrl = () => runtimeEnv().VITE_APP_URL ?? env.VITE_APP_URL;
