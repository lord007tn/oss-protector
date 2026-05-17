const TRAILING_ZERO = /\.0$/;

export function formatStarCount(value: number): string {
	if (value < 1000) {
		return value.toLocaleString();
	}
	if (value < 10_000) {
		return `${(value / 1000).toFixed(1).replace(TRAILING_ZERO, "")}k`;
	}
	if (value < 1_000_000) {
		return `${Math.round(value / 1000)}k`;
	}
	return `${(value / 1_000_000).toFixed(1).replace(TRAILING_ZERO, "")}M`;
}
