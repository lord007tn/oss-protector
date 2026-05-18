import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HOSTED_APP_URL = "https://oss-protector.raedbahri90.workers.dev";
const HOSTED_WORKER_NAME = "oss-protector";

interface WranglerConfig {
	name?: unknown;
	vars?: {
		VITE_APP_URL?: unknown;
	};
}

const config = JSON.parse(
	readFileSync(resolve("wrangler.json"), "utf8")
) as WranglerConfig;

const deployTarget = process.env.OSS_PROTECTOR_DEPLOY_TARGET;
const appUrl =
	process.env.VITE_APP_URL ??
	config.vars?.VITE_APP_URL ??
	"http://localhost:3000";
const workerName = config.name;
const looksHosted =
	appUrl === HOSTED_APP_URL || workerName === HOSTED_WORKER_NAME;

if (looksHosted && deployTarget !== "hosted") {
	throw new Error(
		"Refusing to deploy the hosted OSS Protector configuration. Set OSS_PROTECTOR_DEPLOY_TARGET=hosted for the official deployment, or update wrangler.json/VITE_APP_URL for a self-hosted instance."
	);
}
