export const parseJsonArray = <T>(value: string | null | undefined): T[] => {
	if (!value) {
		return [];
	}
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
};

export const parseJsonObject = <T extends Record<string, unknown>>(
	value: string | null | undefined,
): Partial<T> => {
	if (!value) {
		return {};
	}
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Partial<T>)
			: {};
	} catch {
		return {};
	}
};
