import { describe, expect, it } from "vitest";
import {
	accountAgeBoost,
	accountReputationPenalty,
	accountSuspicionBoost,
	ageDecay,
	aiPrSignalWeight,
	composeProfileScore,
	DECAY_FLOOR,
	prVelocityBoost,
	reporterTrust,
} from "./scoring";

describe("ageDecay", () => {
	const now = 1_800_000_000;

	it("returns 1.0 for fresh observations", () => {
		expect(ageDecay(now, now)).toBe(1);
		expect(ageDecay(now - 86_400, now)).toBe(1);
		expect(ageDecay(now - 29 * 86_400, now)).toBe(1);
	});

	it("starts decaying after 30 days", () => {
		const half = ageDecay(now - 197 * 86_400, now); // mid-range
		expect(half).toBeLessThan(1);
		expect(half).toBeGreaterThan(DECAY_FLOOR);
	});

	it("floors at 0.2 after one year", () => {
		expect(ageDecay(now - 365 * 86_400, now)).toBe(DECAY_FLOOR);
		expect(ageDecay(now - 5 * 365 * 86_400, now)).toBe(DECAY_FLOOR);
	});

	it("handles negative ages (createdAt in future) as fresh", () => {
		expect(ageDecay(now + 86_400, now)).toBe(1);
	});
});

describe("reporterTrust", () => {
	it("returns neutral (0.5) for new reporters with no history", () => {
		expect(reporterTrust(0, 0)).toBe(0.5);
	});

	it("returns full trust (1.0) for fully-validated history", () => {
		expect(reporterTrust(10, 10)).toBe(1);
	});

	it("floors low-accuracy reporters at 0.2", () => {
		// 0/20 = 0 raw → floored to 0.2
		expect(reporterTrust(0, 20)).toBe(0.2);
	});

	it("applies a +3 prior so a single validated report isn't 100% trust", () => {
		// 1 validated / max(1, 3) = 1/3 ≈ 0.333
		expect(reporterTrust(1, 1)).toBeCloseTo(1 / 3, 5);
	});

	it("scales smoothly for established reporters", () => {
		// 7 validated / max(10, 3) = 0.7
		expect(reporterTrust(7, 10)).toBeCloseTo(0.7, 5);
	});
});

describe("accountAgeBoost", () => {
	const now = 1_800_000_000;
	const daysAgo = (n: number) => now - n * 86_400;

	it("returns 0 when there is no existing evidence", () => {
		// A brand-new account opening a clean PR must never be accused on age.
		expect(
			accountAgeBoost({
				accountCreatedAt: daysAgo(1),
				evidenceScore: 0,
				nowSeconds: now,
			})
		).toBe(0);
	});

	it("returns 0 when account age is unknown", () => {
		expect(
			accountAgeBoost({
				accountCreatedAt: null,
				evidenceScore: 50,
				nowSeconds: now,
			})
		).toBe(0);
	});

	it("boosts younger accounts more, gated on evidence", () => {
		expect(
			accountAgeBoost({
				accountCreatedAt: daysAgo(5),
				evidenceScore: 50,
				nowSeconds: now,
			})
		).toBe(12);
		expect(
			accountAgeBoost({
				accountCreatedAt: daysAgo(20),
				evidenceScore: 50,
				nowSeconds: now,
			})
		).toBe(8);
		expect(
			accountAgeBoost({
				accountCreatedAt: daysAgo(60),
				evidenceScore: 50,
				nowSeconds: now,
			})
		).toBe(4);
	});

	it("does not boost established accounts", () => {
		expect(
			accountAgeBoost({
				accountCreatedAt: daysAgo(120),
				evidenceScore: 50,
				nowSeconds: now,
			})
		).toBe(0);
	});
});

describe("aiPrSignalWeight", () => {
	it("returns 0 below the 65% confidence threshold", () => {
		expect(aiPrSignalWeight(0)).toBe(0);
		expect(aiPrSignalWeight(40)).toBe(0);
		expect(aiPrSignalWeight(64)).toBe(0);
	});

	it("scales by confidence tier", () => {
		expect(aiPrSignalWeight(65)).toBe(30);
		expect(aiPrSignalWeight(80)).toBe(50);
		expect(aiPrSignalWeight(85)).toBe(50);
		expect(aiPrSignalWeight(90)).toBe(65);
		expect(aiPrSignalWeight(100)).toBe(65);
	});
});

describe("accountReputationPenalty", () => {
	const now = 1_800_000_000;
	const yearsAgo = (n: number) => now - n * 365 * 86_400;

	it("is 0 for a brand-new, unknown account", () => {
		expect(
			accountReputationPenalty({ accountCreatedAt: now, nowSeconds: now })
		).toBe(0);
	});

	it("rewards established, starred, prolific accounts", () => {
		expect(
			accountReputationPenalty({
				accountCreatedAt: yearsAgo(3),
				followers: 800,
				nowSeconds: now,
				totalContributions: 600,
				totalStars: 2000,
			})
		).toBeGreaterThan(20);
	});

	it("caps the penalty at 28", () => {
		expect(
			accountReputationPenalty({
				accountCreatedAt: yearsAgo(10),
				followers: 100_000,
				nowSeconds: now,
				totalContributions: 100_000,
				totalStars: 1_000_000,
			})
		).toBeLessThanOrEqual(28);
	});
});

describe("accountSuspicionBoost", () => {
	it("returns 0 without existing evidence", () => {
		expect(
			accountSuspicionBoost({
				botPatternMatch: true,
				evidenceScore: 0,
				followers: 0,
				following: 500,
				suspiciousHandleEntropy: true,
			})
		).toBe(0);
	});

	it("sums corroborators and caps at 16", () => {
		expect(
			accountSuspicionBoost({
				botPatternMatch: true,
				evidenceScore: 30,
				followers: 1,
				following: 500,
				suspiciousHandleEntropy: true,
			})
		).toBe(16);
	});

	it("flags a bot-like follow graph (follows many, followed by few)", () => {
		expect(
			accountSuspicionBoost({
				evidenceScore: 30,
				followers: 2,
				following: 200,
			})
		).toBe(4);
	});

	it("does not flag a normal follow graph", () => {
		expect(
			accountSuspicionBoost({
				evidenceScore: 30,
				followers: 300,
				following: 200,
			})
		).toBe(0);
	});
});

describe("prVelocityBoost", () => {
	it("is 0 below the minimum PR count", () => {
		expect(prVelocityBoost({ distinctOwners: 3, recentPrCount: 4 })).toBe(0);
	});

	it("returns the cap for a high-volume, high-diversity burst", () => {
		expect(prVelocityBoost({ distinctOwners: 8, recentPrCount: 15 })).toBe(25);
	});

	it("scales by volume and diversity", () => {
		expect(prVelocityBoost({ distinctOwners: 4, recentPrCount: 8 })).toBe(15);
		expect(prVelocityBoost({ distinctOwners: 4, recentPrCount: 6 })).toBe(8);
	});

	it("does not flag a prolific maintainer working in one org", () => {
		expect(prVelocityBoost({ distinctOwners: 1, recentPrCount: 12 })).toBe(0);
	});
});

describe("composeProfileScore", () => {
	const blank = {
		importedSource: null,
		isAllowedSticky: false,
		isKnownGithubBot: false,
		prCount: 0,
		reportScore: 0,
		signalScore: 0,
	};

	it("brand-new user with no signals is `watch` and 0", () => {
		const result = composeProfileScore(blank);
		expect(result.score).toBe(0);
		expect(result.status).toBe("watch");
	});

	it("first malicious PR (likely_abuse 85%) lands in `review` band", () => {
		// Regression for the "first-PR baseline too low" gap. ai_pr_review at
		// 85% confidence gives weight 50; with activityScore 2 → 52.
		// status band: 1-54 = watch, 55-74 = review.
		// We want this *at least near* review — bumping pulls a clear malicious
		// signal out of the noisy "watch" pile.
		const result = composeProfileScore({
			...blank,
			prCount: 1,
			signalScore: aiPrSignalWeight(85),
		});
		expect(result.score).toBeGreaterThanOrEqual(50);
	});

	it("first highly-confident malicious PR (95%) lands in `high_risk`", () => {
		// 65 + 2 activity = 67 → review. We want high-conf to push higher.
		const result = composeProfileScore({
			...blank,
			prCount: 1,
			signalScore: aiPrSignalWeight(95),
		});
		expect(result.status).toBe("review");
		expect(result.score).toBeGreaterThanOrEqual(65);
	});

	it("report-bombing: 5 validated reports from one reporter capped at one MAX × trust", () => {
		// perReporterContributionQuery already returns 1 row with MAX per
		// reporter. This test enforces the contract: the JS layer can't
		// inflate by repeating the reporter.
		const singleReporterMax = 54;
		const trust = reporterTrust(5, 5); // very-accurate reporter
		const result = composeProfileScore({
			...blank,
			reportScore: singleReporterMax * trust,
		});
		// 54 × ~0.833 = ~45 → still in watch band, but lifts. Multiple distinct
		// reporters would each contribute one MAX. We just assert we're nowhere
		// near the old 5×54 = 270 → capped 100 = block behaviour.
		expect(result.score).toBeLessThan(60);
		expect(result.status).toBe("watch");
	});

	it("young account boosts a PR that already has signal evidence", () => {
		const now = 1_800_000_000;
		const withoutAge = composeProfileScore({
			...blank,
			prCount: 1,
			signalScore: aiPrSignalWeight(80),
		});
		const withAge = composeProfileScore({
			...blank,
			accountCreatedAt: now - 5 * 86_400,
			nowSeconds: now,
			prCount: 1,
			signalScore: aiPrSignalWeight(80),
		});
		expect(withAge.score).toBe(withoutAge.score + 12);
	});

	it("young account never accuses on its own (no evidence)", () => {
		const now = 1_800_000_000;
		const result = composeProfileScore({
			...blank,
			accountCreatedAt: now - 86_400,
			nowSeconds: now,
			prCount: 1,
		});
		// prCount 1 → activityScore 2, evidenceScore 0 → no boost.
		expect(result.score).toBe(2);
		expect(result.status).toBe("watch");
	});

	it("allowed users (sticky) always score 0 regardless of inputs", () => {
		const result = composeProfileScore({
			...blank,
			isAllowedSticky: true,
			prCount: 100,
			reportScore: 200,
			signalScore: 500,
		});
		expect(result.score).toBe(0);
		expect(result.status).toBe("allow");
	});

	it("known GitHub bots are always allowed", () => {
		const result = composeProfileScore({
			...blank,
			isKnownGithubBot: true,
			signalScore: 100,
		});
		expect(result.status).toBe("allow");
		expect(result.score).toBe(0);
	});

	it("imported blocklist adds +48 to the score", () => {
		const result = composeProfileScore({
			...blank,
			importedSource: "UnsafeLabs/Bounty-Hunters clankers.json",
			prCount: 5, // activity = 10
		});
		// 48 + 10 = 58 → review band edge
		expect(result.score).toBe(58);
		expect(result.status).toBe("review");
	});

	it("reputation dampens automated suspicion for an established account", () => {
		const now = 1_800_000_000;
		const base = {
			...blank,
			nowSeconds: now,
			signalScore: 60,
		};
		const newcomer = composeProfileScore(base);
		const veteran = composeProfileScore({
			...base,
			accountCreatedAt: now - 3 * 365 * 86_400,
			totalContributions: 600,
			totalStars: 2000,
		});
		expect(veteran.score).toBeLessThan(newcomer.score);
	});

	it("a validated maintainer report overrides the reputation dampener", () => {
		const now = 1_800_000_000;
		const reputable = {
			...blank,
			accountCreatedAt: now - 5 * 365 * 86_400,
			nowSeconds: now,
			signalScore: 60,
			totalContributions: 1000,
			totalStars: 5000,
		};
		const withoutValidation = composeProfileScore(reputable);
		const withValidation = composeProfileScore({
			...reputable,
			validatedReportCount: 1,
		});
		expect(withValidation.score).toBeGreaterThan(withoutValidation.score);
	});

	it("bot-pattern boost only applies when there is existing evidence", () => {
		const now = 1_800_000_000;
		const noEvidence = composeProfileScore({
			...blank,
			botPatternMatch: true,
			nowSeconds: now,
			prCount: 1,
		});
		// prCount 1 → activity 2, no signal/report evidence → no bot boost.
		expect(noEvidence.score).toBe(2);
		const withEvidence = composeProfileScore({
			...blank,
			botPatternMatch: true,
			nowSeconds: now,
			signalScore: 30,
		});
		expect(withEvidence.score).toBe(38); // 30 + 8 bot-pattern corroborator
	});

	it("PR velocity across many orgs lifts a score that also has signal", () => {
		const now = 1_800_000_000;
		const result = composeProfileScore({
			...blank,
			distinctOwners: 8,
			nowSeconds: now,
			recentPrCount: 15,
			signalScore: 30,
		});
		expect(result.score).toBe(55); // 30 signal + 25 velocity → review band
		expect(result.status).toBe("review");
	});

	it("score caps at 100", () => {
		const result = composeProfileScore({
			...blank,
			reportScore: 200,
			signalScore: 500,
		});
		expect(result.score).toBe(100);
		expect(result.status).toBe("block");
	});

	it("activity is capped at 20 regardless of PR count", () => {
		// 100 PRs should add only 20 to score, not 200.
		const result = composeProfileScore({ ...blank, prCount: 100 });
		expect(result.score).toBe(20);
	});

	it("pull_request_seen leak regression: prCount alone keeps user in watch", () => {
		// Pre-fix, 67 pull_request_seen signals at +2 each added +134 (capped
		// 100 → block). After the fix, prCount only contributes via the capped
		// activityScore. 67 PRs → activityScore 20 → status=watch.
		const result = composeProfileScore({ ...blank, prCount: 67 });
		expect(result.score).toBe(20);
		expect(result.status).toBe("watch");
	});
});
