// Shared presentation helpers for OSS Protector domain UI.

export type ConfidenceTier = "high" | "medium" | "low";

export function confidenceTier(value: number): ConfidenceTier {
	if (value >= 0.85) {
		return "high";
	}
	if (value >= 0.6) {
		return "medium";
	}
	return "low";
}

export interface ConfidenceTone {
	fill: string;
	label: string;
	soft: string;
	text: string;
}

export function confidenceTone(value: number): ConfidenceTone {
	const tier = confidenceTier(value);
	if (tier === "high") {
		return {
			text: "text-destructive",
			fill: "bg-destructive",
			soft: "bg-destructive/10",
			label: "high",
		};
	}
	if (tier === "medium") {
		return {
			text: "text-warning",
			fill: "bg-warning",
			soft: "bg-warning/10",
			label: "med",
		};
	}
	return {
		text: "text-success",
		fill: "bg-success",
		soft: "bg-success/10",
		label: "low",
	};
}

// Avatar palette mirrors the prototype's deterministic av-1..6 colors,
// expressed with our semantic tokens (no raw Tailwind palette).
const AVATAR_PALETTE = [
	"bg-primary/15 text-primary",
	"bg-info/15 text-info",
	"bg-success/15 text-success",
	"bg-warning/15 text-warning",
	"bg-chart-5/15 text-chart-5",
	"bg-destructive/15 text-destructive",
] as const;

export function avatarColorClass(color: number): string {
	const index =
		(((color - 1) % AVATAR_PALETTE.length) + AVATAR_PALETTE.length) %
		AVATAR_PALETTE.length;
	return AVATAR_PALETTE[index];
}

// Color for a single signal bar: stronger signals read as more alarming.
export function signalFillClass(value: number): string {
	if (value >= 0.85) {
		return "bg-destructive";
	}
	if (value >= 0.6) {
		return "bg-warning";
	}
	return "bg-success";
}

export function repoShortName(fullName: string): string {
	const parts = fullName.split("/");
	return parts.at(-1) ?? fullName;
}

export function initialsFromHandle(handle: string): string {
	const cleaned = handle.replace(/[^a-zA-Z0-9]/g, "");
	return (cleaned.slice(0, 2) || "??").toUpperCase();
}
