import { asc, eq } from "drizzle-orm";

import { database } from "@/db";
import {
	Installation,
	InstallationMaintainer,
	UserPreferences,
} from "@/db/schema";
import { parseJsonArray } from "@/lib/json";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";

export const NOTIFICATION_KINDS = [
	"report",
	"dispute",
	"flag",
	"correction",
	"ok",
	"info",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const DEFAULT_KINDS: NotificationKind[] = [...NOTIFICATION_KINDS];

const isNotificationKind = (value: string): value is NotificationKind =>
	(NOTIFICATION_KINDS as readonly string[]).includes(value);

const sanitizeKinds = (raw: unknown): NotificationKind[] => {
	if (!Array.isArray(raw)) {
		return DEFAULT_KINDS;
	}
	const filtered = raw.filter(
		(value): value is NotificationKind =>
			typeof value === "string" && isNotificationKind(value)
	);
	return [...new Set(filtered)];
};

export interface UserPreferencesView {
	hasOpenrouterKey: boolean;
	notificationKinds: NotificationKind[];
	openrouterKeyPreview: string | null;
	updatedAt: number | null;
}

const previewFromPlaintext = (plaintext: string): string => {
	const trimmed = plaintext.trim();
	if (trimmed.length <= 8) {
		return "•".repeat(Math.max(4, trimmed.length));
	}
	return `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}`;
};

export async function getUserPreferencesView(
	userId: string,
	masterSecret: string | undefined
): Promise<UserPreferencesView> {
	const [row] = await database
		.select()
		.from(UserPreferences)
		.where(eq(UserPreferences.userId, userId))
		.limit(1);
	if (!row) {
		return {
			hasOpenrouterKey: false,
			notificationKinds: DEFAULT_KINDS,
			openrouterKeyPreview: null,
			updatedAt: null,
		};
	}
	const notificationKinds = sanitizeKinds(
		parseJsonArray<unknown>(row.notificationKindsJson)
	);
	let preview: string | null = null;
	if (row.openrouterApiKeyEncrypted && masterSecret) {
		try {
			const plaintext = await decryptSecret(
				row.openrouterApiKeyEncrypted,
				masterSecret
			);
			preview = previewFromPlaintext(plaintext);
		} catch {
			preview = null;
		}
	}
	return {
		hasOpenrouterKey: !!row.openrouterApiKeyEncrypted,
		notificationKinds,
		openrouterKeyPreview: preview,
		updatedAt: row.updatedAt,
	};
}

// Returns the decrypted BYOK key for a specific user. Server-only — never
// expose decrypted keys to the client.
export async function getUserOpenrouterKey(
	userId: string,
	masterSecret: string
): Promise<string | null> {
	const [row] = await database
		.select({
			openrouterApiKeyEncrypted: UserPreferences.openrouterApiKeyEncrypted,
		})
		.from(UserPreferences)
		.where(eq(UserPreferences.userId, userId))
		.limit(1);
	if (!row?.openrouterApiKeyEncrypted) {
		return null;
	}
	try {
		return await decryptSecret(row.openrouterApiKeyEncrypted, masterSecret);
	} catch {
		return null;
	}
}

export interface UpdateUserPreferencesInput {
	masterSecret: string;
	notificationKinds?: NotificationKind[];
	// undefined → leave existing; null → clear; string → set to this value.
	openrouterApiKey?: string | null;
	userId: string;
}

export async function updateUserPreferences(
	input: UpdateUserPreferencesInput
): Promise<UserPreferencesView> {
	const [existing] = await database
		.select()
		.from(UserPreferences)
		.where(eq(UserPreferences.userId, input.userId))
		.limit(1);

	let nextKinds: NotificationKind[];
	if (input.notificationKinds !== undefined) {
		nextKinds = sanitizeKinds(input.notificationKinds);
	} else if (existing) {
		nextKinds = sanitizeKinds(
			parseJsonArray<unknown>(existing.notificationKindsJson)
		);
	} else {
		nextKinds = DEFAULT_KINDS;
	}

	let nextEncrypted: string | null;
	if (input.openrouterApiKey === undefined) {
		nextEncrypted = existing?.openrouterApiKeyEncrypted ?? null;
	} else if (input.openrouterApiKey === null) {
		nextEncrypted = null;
	} else {
		const trimmed = input.openrouterApiKey.trim();
		nextEncrypted = trimmed
			? await encryptSecret(trimmed, input.masterSecret)
			: null;
	}

	const now = Math.floor(Date.now() / 1000);
	const values = {
		notificationKindsJson: JSON.stringify(nextKinds),
		openrouterApiKeyEncrypted: nextEncrypted,
		updatedAt: now,
		userId: input.userId,
	};

	if (existing) {
		await database
			.update(UserPreferences)
			.set(values)
			.where(eq(UserPreferences.userId, input.userId));
	} else {
		await database.insert(UserPreferences).values(values);
	}

	return getUserPreferencesView(input.userId, input.masterSecret);
}

export async function userAllowsNotificationKind(
	userId: string,
	kind: string
): Promise<boolean> {
	const [row] = await database
		.select({ notificationKindsJson: UserPreferences.notificationKindsJson })
		.from(UserPreferences)
		.where(eq(UserPreferences.userId, userId))
		.limit(1);
	if (!row) {
		return true;
	}
	const allowed = sanitizeKinds(
		parseJsonArray<unknown>(row.notificationKindsJson)
	);
	return allowed.includes(kind as NotificationKind);
}

// Used by the OpenRouter resolver: get the decrypted BYOK key for the
// earliest-linked maintainer of a given GitHub installation. Returns null if
// no maintainer has stored a BYOK key (caller falls back to platform key).
export async function getInstallationOpenrouterKey({
	installationGithubId,
	masterSecret,
}: {
	installationGithubId: string;
	masterSecret: string;
}): Promise<string | null> {
	// Join through InstallationMaintainer at the outer level so we can ORDER BY
	// reliably. SQLite ignores ORDER BY inside an IN-subquery, which silently
	// breaks the "earliest-linked maintainer wins" contract: the loop below
	// would pick the first decryptable row in undefined order, so different
	// runs could bill different maintainers for the same installation.
	const rows = await database
		.select({
			createdAt: InstallationMaintainer.createdAt,
			openrouterApiKeyEncrypted: UserPreferences.openrouterApiKeyEncrypted,
		})
		.from(UserPreferences)
		.innerJoin(
			InstallationMaintainer,
			eq(InstallationMaintainer.userId, UserPreferences.userId)
		)
		.innerJoin(
			Installation,
			eq(Installation.id, InstallationMaintainer.installationId)
		)
		.where(eq(Installation.githubInstallationId, installationGithubId))
		.orderBy(asc(InstallationMaintainer.createdAt));
	for (const row of rows) {
		if (!row.openrouterApiKeyEncrypted) {
			continue;
		}
		try {
			return await decryptSecret(row.openrouterApiKeyEncrypted, masterSecret);
		} catch {
			// Try the next maintainer's key on decrypt failure (likely a stale row
			// encrypted with a rotated BETTER_AUTH_SECRET).
		}
	}
	return null;
}
