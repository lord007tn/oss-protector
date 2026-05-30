import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const wranglerConfigPath = resolve("wrangler.json");
const d1BindingName = "accounts_db";
const defaultDatabaseId = "bbf2be1c-7746-4b46-be6a-4363ea5f4a71";
const zeroPlaceholderDatabaseId = "00000000-0000-0000-0000-000000000000";
const legacyPlaceholderDatabaseId = "REPLACE_WITH_YOUR_D1_DATABASE_ID";
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface D1DatabaseBinding {
	binding?: unknown;
	database_id?: unknown;
}

interface WranglerConfig {
	d1_databases?: unknown;
}

const args = new Set(process.argv.slice(2));
const requireDatabaseId = args.has("--required");
const restorePlaceholder = args.has("--restore-placeholder");
const isHostedDeploy = process.env.OSS_PROTECTOR_DEPLOY_TARGET === "hosted";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isD1DatabaseBinding = (value: unknown): value is D1DatabaseBinding =>
	isRecord(value) && value.binding === d1BindingName;

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readWranglerConfig = (): { config: WranglerConfig; source: string } => {
	const source = readFileSync(wranglerConfigPath, "utf8");
	const parsedConfig: unknown = JSON.parse(source);

	if (!isRecord(parsedConfig)) {
		throw new Error("wrangler.json must contain a JSON object.");
	}

	return { config: parsedConfig, source };
};

const getD1Binding = (config: WranglerConfig): D1DatabaseBinding => {
	if (!Array.isArray(config.d1_databases)) {
		throw new Error("wrangler.json must define a d1_databases array.");
	}

	const d1Binding = config.d1_databases.find(isD1DatabaseBinding);

	if (!d1Binding) {
		throw new Error(
			`wrangler.json must define a D1 binding named ${d1BindingName}.`
		);
	}

	return d1Binding;
};

const writeDatabaseId = (
	source: string,
	currentDatabaseId: string,
	targetDatabaseId: string
): void => {
	const databaseIdPattern = new RegExp(
		`("database_id"\\s*:\\s*)"${escapeRegExp(currentDatabaseId)}"`
	);
	const updatedSource = source.replace(
		databaseIdPattern,
		`$1"${targetDatabaseId}"`
	);

	if (updatedSource === source) {
		throw new Error("Could not update database_id in wrangler.json.");
	}

	writeFileSync(wranglerConfigPath, updatedSource);
};

const isPlaceholderDatabaseId = (databaseId: string): boolean =>
	databaseId === legacyPlaceholderDatabaseId ||
	databaseId === zeroPlaceholderDatabaseId;

const getTargetDatabaseId = (currentDatabaseId: string): string => {
	if (restorePlaceholder) {
		return defaultDatabaseId;
	}

	const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();

	if (!databaseId) {
		if (requireDatabaseId && !isHostedDeploy) {
			throw new Error(
				"CLOUDFLARE_D1_DATABASE_ID must be set to the Cloudflare D1 database UUID before self-hosted production builds or deploys."
			);
		}

		if (
			uuidPattern.test(currentDatabaseId) &&
			!isPlaceholderDatabaseId(currentDatabaseId)
		) {
			return currentDatabaseId;
		}

		if (isPlaceholderDatabaseId(currentDatabaseId)) {
			return defaultDatabaseId;
		}

		return defaultDatabaseId;
	}

	if (!uuidPattern.test(databaseId)) {
		throw new Error("CLOUDFLARE_D1_DATABASE_ID must be a UUID.");
	}

	return databaseId;
};

const { config, source } = readWranglerConfig();
const d1Binding = getD1Binding(config);

if (typeof d1Binding.database_id !== "string") {
	throw new Error("wrangler.json D1 database_id must be a string.");
}

const currentDatabaseId = d1Binding.database_id;
const targetDatabaseId = getTargetDatabaseId(currentDatabaseId);

if (
	currentDatabaseId !== targetDatabaseId ||
	isPlaceholderDatabaseId(currentDatabaseId)
) {
	writeDatabaseId(source, currentDatabaseId, targetDatabaseId);
}
