/**
 * Pure scoring functions used by recalculateRiskProfile. Kept free of any
 * database imports so the scoring math can be unit-tested directly and so
 * a regression test can catch drift without spinning up D1.
 *
 * IMPORTANT: when you change the constants here, also re-run
 * `pnpm test scoring` to confirm the regression suite still represents
 * production behavior.
 */
import type { RiskStatus } from "@/constants/risk-statuses";
import { riskStatusForScore } from "@/constants/risk-statuses";

// --- Time-decay ---------------------------------------------------------
// Reports and signals lose weight as they age. Full strength for the first
// 30 days, then linear decay down to a floor of 0.2 by the one-year mark.
// Anything older than a year stays at the floor — old context still
// counts, just not as much as fresh evidence.
const DECAY_FULL_WEIGHT_SECONDS = 30 * 86_400;
const DECAY_FLOOR_SECONDS = 365 * 86_400;
export const DECAY_FLOOR = 0.2;

export const ageDecay = (createdAt: number, nowSeconds: number): number => {
	const age = Math.max(0, nowSeconds - createdAt);
	if (age <= DECAY_FULL_WEIGHT_SECONDS) {
		return 1;
	}
	if (age >= DECAY_FLOOR_SECONDS) {
		return DECAY_FLOOR;
	}
	const range = DECAY_FLOOR_SECONDS - DECAY_FULL_WEIGHT_SECONDS;
	const past = age - DECAY_FULL_WEIGHT_SECONDS;
	const decay = 1 - (past / range) * (1 - DECAY_FLOOR);
	return decay;
};

// --- Reporter trust -----------------------------------------------------
// validated / max(total, 3) with a 0.2 floor. The prior of 3 stops new
// reporters being scored unfairly low; the floor stops bad-faith reporters
// being zeroed out entirely (some signal even from a noisy reporter).
const TRUST_PRIOR = 3;
const TRUST_NEUTRAL = 0.5;
const TRUST_FLOOR = 0.2;

export const reporterTrust = (validated: number, total: number): number => {
	if (total <= 0) {
		return TRUST_NEUTRAL;
	}
	const raw = validated / Math.max(total, TRUST_PRIOR);
	return Math.max(TRUST_FLOOR, Math.min(1, raw));
};

// --- AI PR-analysis signal weight ----------------------------------------
// A single malicious PR should land the author in at least the "review"
// band (>= 55). Was 12/22; bumped so first-PR malicious is visible without
// requiring multiple reports to corroborate.
//   confidence >= 90: 65  (high_risk band base)
//   confidence >= 80: 50  (review band)
//   confidence >= 65: 30  (watch upper, near review)
//   otherwise: 0 (signal not recorded)
export const aiPrSignalWeight = (confidence: number): number => {
	if (confidence >= 90) {
		return 65;
	}
	if (confidence >= 80) {
		return 50;
	}
	if (confidence >= 65) {
		return 30;
	}
	return 0;
};

// --- Composite score ----------------------------------------------------
export interface ScoreInputs {
	importedSource: null | string;
	isAllowedSticky: boolean;
	isKnownGithubBot: boolean;
	prCount: number;
	reportScore: number;
	signalScore: number;
}

const boundedConfidence = (value: number): number =>
	Math.max(0, Math.min(100, Math.round(value)));

export const composeProfileScore = ({
	importedSource,
	isAllowedSticky,
	isKnownGithubBot,
	prCount,
	reportScore,
	signalScore,
}: ScoreInputs): { score: number; status: RiskStatus } => {
	const activityScore = Math.min(20, prCount * 2);
	const importedScore = importedSource ? 48 : 0;
	const computedScore = boundedConfidence(
		reportScore + signalScore + activityScore + importedScore
	);
	const isAllowed = isKnownGithubBot || isAllowedSticky;
	const score = isAllowed ? 0 : computedScore;
	return {
		score,
		status: riskStatusForScore({ isAllowed, score }),
	};
};
