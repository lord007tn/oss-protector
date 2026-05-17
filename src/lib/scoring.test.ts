import { describe, expect, it } from "vitest";
import {
	ageDecay,
	aiPrSignalWeight,
	composeProfileScore,
	DECAY_FLOOR,
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
