import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export interface RuntimeBindings {
	APP_NAME?: string;
	ALLOW_UNSIGNED_GITHUB_WEBHOOKS?: string;
	CLOUDFLARE_D1_DATABASE_NAME?: string;
	GITHUB_APP_CREATE_OWNER?: string;
	GITHUB_APP_ID?: string;
	GITHUB_APP_PRIVATE_KEY?: string;
	GITHUB_APP_SLUG?: string;
	GITHUB_MANIFEST_TOKEN?: string;
	GITHUB_WEBHOOK_SECRET?: string;
	OPENROUTER_API_KEY?: string;
	OPENROUTER_FALLBACK_MODELS?: string;
	OPENROUTER_MODEL?: string;
	VITE_APP_URL?: string;
	clankers_db?: D1Database;
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
	const { clankers_db: _binding, ...envVars } = runtimeBindings();
	return envVars;
};

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_APP_URL: z.string().url().default("http://localhost:3000"),
	},
	runtimeEnv: runtimeEnv(),
	server: {
		APP_NAME: z.string().default("Clankers List"),
		ALLOW_UNSIGNED_GITHUB_WEBHOOKS: z.string().optional(),
		CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
		CLOUDFLARE_D1_DATABASE_ID: z.string().optional(),
		CLOUDFLARE_D1_DATABASE_NAME: z.string().default("clankers-list-db"),
		CLOUDFLARE_D1_TOKEN: z.string().optional(),
		GITHUB_APP_CREATE_OWNER: z.string().optional(),
		GITHUB_APP_ID: z.string().optional(),
		GITHUB_APP_PRIVATE_KEY: z.string().optional(),
		GITHUB_APP_SLUG: z.string().default("clankers-list"),
		GITHUB_MANIFEST_TOKEN: z.string().optional(),
		GITHUB_WEBHOOK_SECRET: z.string().optional(),
		OPENROUTER_API_KEY: z.string().optional(),
		OPENROUTER_FALLBACK_MODELS: z.string().optional(),
		OPENROUTER_MODEL: z
			.string()
			.default("qwen/qwen3-next-80b-a3b-instruct:free"),
	},
});

export const getAppUrl = () => runtimeEnv().VITE_APP_URL ?? env.VITE_APP_URL;
