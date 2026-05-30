import { describe, expect, it } from "vitest";
import {
	commitVoiceScore,
	diffSignatureScore,
	prHeuristicSignalWeight,
} from "./pr-signals";

const file = (additions: number, deletions: number, filename = "f.ts") => ({
	additions,
	deletions,
	filename,
});

describe("diffSignatureScore", () => {
	it("returns 0 for no files", () => {
		expect(diffSignatureScore([])).toBe(0);
	});

	it("flags many files each touched by one line (scattershot)", () => {
		const files = Array.from({ length: 6 }, (_, i) => file(1, 0, `f${i}.ts`));
		expect(diffSignatureScore(files)).toBeGreaterThanOrEqual(0.5);
	});

	it("does not flag a normal, substantive single-file change", () => {
		expect(diffSignatureScore([file(40, 12)])).toBe(0);
	});

	it("flags uniform tiny edits across several files", () => {
		const files = Array.from({ length: 4 }, (_, i) => file(1, 1, `f${i}.ts`));
		expect(diffSignatureScore(files)).toBeGreaterThan(0);
	});
});

describe("commitVoiceScore", () => {
	it("returns 0 for no commits", () => {
		expect(commitVoiceScore([])).toBe(0);
	});

	it("flags vacuous and duplicated messages", () => {
		expect(
			commitVoiceScore(["update", "update", "fix", "changes"])
		).toBeGreaterThan(0.5);
	});

	it("does not flag descriptive commit messages", () => {
		expect(
			commitVoiceScore([
				"Fix race condition in the auth refresh handler",
				"Add regression test for token expiry edge case",
			])
		).toBe(0);
	});
});

describe("prHeuristicSignalWeight", () => {
	it("is 0 below the weak threshold", () => {
		expect(prHeuristicSignalWeight(0.3, 0.2)).toBe(0);
	});

	it("scales by the stronger of the two signals", () => {
		expect(prHeuristicSignalWeight(0.4, 0)).toBe(10);
		expect(prHeuristicSignalWeight(0, 0.65)).toBe(18);
		expect(prHeuristicSignalWeight(0.9, 0.1)).toBe(25);
	});
});
