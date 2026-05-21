/**
 * Pure, deterministic per-PR signals for the scoring engine. These run on the
 * already-fetched PR files and commit messages so the math is unit-testable and
 * reproducible (no LLM, no I/O). They feed the deterministic core that the LLM
 * verdict then sits on top of.
 */

export interface PrFileShape {
	additions: number;
	deletions: number;
	filename: string;
	patch?: string;
}

const TINY_CHANGE_THRESHOLD = 2;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

// Diff signature: how "templated / scattershot" the patch shape looks. Many
// files each barely touched, or near-identical change sizes across files, are
// tells of mechanical/generated PRs. Returns 0..1.
export const diffSignatureScore = (files: PrFileShape[]): number => {
	if (files.length === 0) {
		return 0;
	}
	const sizes = files.map((file) => file.additions + file.deletions);
	const total = sizes.reduce((sum, size) => sum + size, 0);
	const average = total / files.length;
	const tinyRatio =
		sizes.filter((size) => size <= TINY_CHANGE_THRESHOLD).length / files.length;
	let score = 0;
	if (files.length >= 5 && tinyRatio >= 0.8) {
		score += 0.5;
	} else if (files.length >= 3 && tinyRatio >= 0.6) {
		score += 0.3;
	}
	if (files.length >= 4) {
		const variance =
			sizes.reduce((sum, size) => sum + (size - average) ** 2, 0) /
			files.length;
		if (variance < 1) {
			score += 0.3;
		}
	}
	return clamp01(score);
};

// Commit-message voice: vacuous, generic, or duplicated commit messages read as
// machine output ("update", "fix", identical lines). Returns 0..1.
const GENERIC_FULL_MESSAGE =
	/^(?:update|fix|changes|improvements?|cleanup|misc|wip|stuff)\.?$/i;
const VACUOUS_PREFIX =
	/^(?:update|fix|fixes|change|changes|improve|cleanup|chore|misc|wip|edit|tweak|minor|patch)\b/i;
const MIN_MEANINGFUL_MESSAGE_LENGTH = 12;
const SHORT_VACUOUS_MESSAGE_LENGTH = 30;

const isVacuousMessage = (message: string): boolean =>
	message.length <= MIN_MEANINGFUL_MESSAGE_LENGTH ||
	GENERIC_FULL_MESSAGE.test(message) ||
	(VACUOUS_PREFIX.test(message) &&
		message.length < SHORT_VACUOUS_MESSAGE_LENGTH);

export const commitVoiceScore = (messages: string[]): number => {
	if (messages.length === 0) {
		return 0;
	}
	const firstLines = messages.map((message) => message.split("\n")[0].trim());
	const vacuous = firstLines.filter(isVacuousMessage).length;
	const uniqueCount = new Set(firstLines.map((line) => line.toLowerCase()))
		.size;
	const identicalRatio = (firstLines.length - uniqueCount) / firstLines.length;
	const vacuousRatio = vacuous / firstLines.length;
	return clamp01(vacuousRatio * 0.6 + identicalRatio * 0.4);
};

// Bounded weight contributed to the risk score by the deterministic PR
// heuristics. Sits alongside (not instead of) the LLM's ai_pr_review weight.
export const PR_HEURISTIC_WEIGHT_STRONG = 25;
export const PR_HEURISTIC_WEIGHT_MEDIUM = 18;
export const PR_HEURISTIC_WEIGHT_WEAK = 10;

export const prHeuristicSignalWeight = (
	diffSignature: number,
	commitVoice: number
): number => {
	const combined = Math.max(diffSignature, commitVoice);
	if (combined >= 0.8) {
		return PR_HEURISTIC_WEIGHT_STRONG;
	}
	if (combined >= 0.6) {
		return PR_HEURISTIC_WEIGHT_MEDIUM;
	}
	if (combined >= 0.4) {
		return PR_HEURISTIC_WEIGHT_WEAK;
	}
	return 0;
};
