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

// --- Young-account corroboration ----------------------------------------
// A fresh, low-history account is a classic throwaway-bot tell — but on its
// own it's also just a new contributor opening a normal PR. So this only
// *boosts* a score that already carries report or signal evidence; it never
// accuses on its own. That gate (evidenceScore > 0) is what keeps new
// legitimate contributors out of the flagged pile.
const DAY_SECONDS = 86_400;
const YOUNG_ACCOUNT_BOOST_VERY_NEW = 12; // younger than 14 days
const YOUNG_ACCOUNT_BOOST_NEW = 8; // younger than 30 days
const YOUNG_ACCOUNT_BOOST_RECENT = 4; // younger than 90 days

export const accountAgeBoost = ({
	accountCreatedAt,
	evidenceScore,
	nowSeconds,
}: {
	accountCreatedAt: null | number | undefined;
	evidenceScore: number;
	nowSeconds: number;
}): number => {
	if (!accountCreatedAt || evidenceScore <= 0) {
		return 0;
	}
	const ageDays = Math.max(0, (nowSeconds - accountCreatedAt) / DAY_SECONDS);
	if (ageDays < 14) {
		return YOUNG_ACCOUNT_BOOST_VERY_NEW;
	}
	if (ageDays < 30) {
		return YOUNG_ACCOUNT_BOOST_NEW;
	}
	if (ageDays < 90) {
		return YOUNG_ACCOUNT_BOOST_RECENT;
	}
	return 0;
};

// --- Account-level corroborators ----------------------------------------
// A bot-pattern handle/bio, a machine-looking high-entropy handle, and a
// bot-like follow graph (follows many, followed by few) are each weak tells.
// They're summed and capped, and gated on existing evidence so they never
// accuse a clean account on their own. (The established-vs-thin axis is handled
// separately by the reputation dampener, so it isn't double-counted here.)
const ACCOUNT_SUSPICION_CAP = 16;
const SUSPICION_BOT_PATTERN = 8;
const SUSPICION_HANDLE_ENTROPY = 4;
const SUSPICION_FOLLOW_GRAPH = 4;
const BOT_FOLLOW_MIN_FOLLOWING = 30;
const BOT_FOLLOW_RATIO = 10;

export const accountSuspicionBoost = ({
	botPatternMatch,
	evidenceScore,
	followers,
	following,
	suspiciousHandleEntropy,
}: {
	botPatternMatch?: boolean;
	evidenceScore: number;
	followers?: number;
	following?: number;
	suspiciousHandleEntropy?: boolean;
}): number => {
	if (evidenceScore <= 0) {
		return 0;
	}
	let boost = 0;
	if (botPatternMatch) {
		boost += SUSPICION_BOT_PATTERN;
	}
	if (suspiciousHandleEntropy) {
		boost += SUSPICION_HANDLE_ENTROPY;
	}
	const followingCount = following ?? 0;
	if (
		followingCount >= BOT_FOLLOW_MIN_FOLLOWING &&
		(followers ?? 0) <= followingCount / BOT_FOLLOW_RATIO
	) {
		boost += SUSPICION_FOLLOW_GRAPH;
	}
	return Math.min(ACCOUNT_SUSPICION_CAP, boost);
};

// --- PR velocity × org-diversity ----------------------------------------
// A burst of PRs across many *unrelated* orgs in a short window is the classic
// scattershot-bot pattern, and distinct from a duplicate-title campaign.
// Diversity (distinct owners) is what separates a bot from a prolific
// maintainer working inside their own org. Standalone (not gated), but capped
// so it can't, on its own, push past the watch band.
const PR_VELOCITY_CAP = 25;
const VELOCITY_MIN_PRS = 5;
const VELOCITY_DIVERSITY_FLOOR = 0.6;

export const prVelocityBoost = ({
	distinctOwners,
	recentPrCount,
}: {
	distinctOwners: number;
	recentPrCount: number;
}): number => {
	if (recentPrCount < VELOCITY_MIN_PRS) {
		return 0;
	}
	const diversity = distinctOwners / recentPrCount;
	if (recentPrCount >= 15 && distinctOwners >= 8) {
		return PR_VELOCITY_CAP;
	}
	if (recentPrCount >= 8 && distinctOwners >= 4) {
		return 15;
	}
	if (distinctOwners >= 3 && diversity >= VELOCITY_DIVERSITY_FLOOR) {
		return 8;
	}
	return 0;
};

// --- Reputation dampener ------------------------------------------------
// Established accounts (old, starred, prolific, followed) are far less likely
// to be throwaway abuse, so a bounded penalty is subtracted from the automated
// suspicion score. It is skipped entirely once a maintainer has validated a
// report — human judgment overrides reputation — and is capped so it can never
// turn a strong, confirmed case green on its own.
const REPUTATION_PENALTY_CAP = 28;
const TWO_YEARS_DAYS = 730;
const ONE_YEAR_DAYS = 365;
const DAY_IN_SECONDS = 86_400;

export const accountReputationPenalty = ({
	accountCreatedAt,
	followers,
	nowSeconds,
	totalContributions,
	totalStars,
}: {
	accountCreatedAt?: null | number;
	followers?: number;
	nowSeconds: number;
	totalContributions?: number;
	totalStars?: number;
}): number => {
	let penalty = 0;
	if (accountCreatedAt) {
		const ageDays = Math.max(
			0,
			(nowSeconds - accountCreatedAt) / DAY_IN_SECONDS
		);
		if (ageDays >= TWO_YEARS_DAYS) {
			penalty += 8;
		} else if (ageDays >= ONE_YEAR_DAYS) {
			penalty += 4;
		}
	}
	const stars = totalStars ?? 0;
	if (stars >= 1000) {
		penalty += 10;
	} else if (stars >= 100) {
		penalty += 5;
	}
	const contributions = totalContributions ?? 0;
	if (contributions >= 500) {
		penalty += 7;
	} else if (contributions >= 50) {
		penalty += 3;
	}
	if ((followers ?? 0) >= 500) {
		penalty += 3;
	}
	return Math.min(REPUTATION_PENALTY_CAP, penalty);
};

// --- Composite score ----------------------------------------------------
export interface ScoreInputs {
	accountCreatedAt?: null | number;
	botPatternMatch?: boolean;
	distinctOwners?: number;
	followers?: number;
	following?: number;
	importedSource: null | string;
	isAllowedSticky: boolean;
	isKnownGithubBot: boolean;
	nowSeconds?: number;
	prCount: number;
	recentPrCount?: number;
	reportScore: number;
	signalScore: number;
	suspiciousHandleEntropy?: boolean;
	totalContributions?: number;
	totalStars?: number;
	validatedReportCount?: number;
}

const boundedConfidence = (value: number): number =>
	Math.max(0, Math.min(100, Math.round(value)));

export const composeProfileScore = ({
	accountCreatedAt,
	botPatternMatch,
	distinctOwners,
	followers,
	following,
	importedSource,
	isAllowedSticky,
	isKnownGithubBot,
	nowSeconds,
	prCount,
	recentPrCount,
	reportScore,
	signalScore,
	suspiciousHandleEntropy,
	totalContributions,
	totalStars,
	validatedReportCount,
}: ScoreInputs): { score: number; status: RiskStatus } => {
	const now = nowSeconds ?? Math.floor(Date.now() / 1000);
	const evidenceScore = reportScore + signalScore;
	const activityScore = Math.min(20, prCount * 2);
	const importedScore = importedSource ? 48 : 0;
	const youngAccountBoost = accountAgeBoost({
		accountCreatedAt,
		evidenceScore,
		nowSeconds: now,
	});
	const accountSuspicion = accountSuspicionBoost({
		botPatternMatch,
		evidenceScore,
		followers,
		following,
		suspiciousHandleEntropy,
	});
	const velocityBoost = prVelocityBoost({
		distinctOwners: distinctOwners ?? 0,
		recentPrCount: recentPrCount ?? 0,
	});
	const reputationPenalty =
		(validatedReportCount ?? 0) > 0
			? 0
			: accountReputationPenalty({
					accountCreatedAt,
					followers,
					nowSeconds: now,
					totalContributions,
					totalStars,
				});
	const computedScore = boundedConfidence(
		reportScore +
			signalScore +
			activityScore +
			importedScore +
			youngAccountBoost +
			accountSuspicion +
			velocityBoost -
			reputationPenalty
	);
	const isAllowed = isKnownGithubBot || isAllowedSticky;
	const score = isAllowed ? 0 : computedScore;
	return {
		score,
		status: riskStatusForScore({ isAllowed, score }),
	};
};
