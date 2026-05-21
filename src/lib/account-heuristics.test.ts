import { describe, expect, it } from "vitest";
import {
	bioMatchesBotPattern,
	handleEntropyIsSuspicious,
	handleMatchesBotPattern,
	normalizedEntropy,
} from "./account-heuristics";

describe("handleMatchesBotPattern", () => {
	it("flags automation-style handles", () => {
		expect(handleMatchesBotPattern("ai-helper")).toBe(true);
		expect(handleMatchesBotPattern("gpt-coder")).toBe(true);
		expect(handleMatchesBotPattern("code-helper-12")).toBe(true);
		expect(handleMatchesBotPattern("fix-typo-bot")).toBe(true);
		expect(handleMatchesBotPattern("deploy-bot")).toBe(true);
		expect(handleMatchesBotPattern("johnsmith99999")).toBe(true);
	});

	it("does not flag normal handles", () => {
		expect(handleMatchesBotPattern("torvalds")).toBe(false);
		expect(handleMatchesBotPattern("octocat")).toBe(false);
		expect(handleMatchesBotPattern("gaearon")).toBe(false);
		expect(handleMatchesBotPattern("user123")).toBe(false); // short digit run
	});
});

describe("bioMatchesBotPattern", () => {
	it("flags self-identified automation bios", () => {
		expect(bioMatchesBotPattern("I am a bot that fixes typos")).toBe(true);
		expect(bioMatchesBotPattern("Autonomous agent powered by GPT")).toBe(true);
		expect(bioMatchesBotPattern("contribution farmer")).toBe(true);
	});

	it("does not flag normal or empty bios", () => {
		expect(bioMatchesBotPattern("Senior engineer at Acme")).toBe(false);
		expect(bioMatchesBotPattern(null)).toBe(false);
		expect(bioMatchesBotPattern(undefined)).toBe(false);
		expect(bioMatchesBotPattern("")).toBe(false);
	});
});

describe("handleEntropyIsSuspicious", () => {
	it("flags long, digit-bearing, vowel-less random handles", () => {
		expect(handleEntropyIsSuspicious("x7k9p2mq3")).toBe(true);
	});

	it("does not flag normal handles", () => {
		expect(handleEntropyIsSuspicious("torvalds")).toBe(false); // no digit
		expect(handleEntropyIsSuspicious("octocat")).toBe(false); // short, no digit
		expect(handleEntropyIsSuspicious("user42")).toBe(false); // too short
		expect(handleEntropyIsSuspicious("johnsmith2024")).toBe(false); // has vowels
	});
});

describe("normalizedEntropy", () => {
	it("returns 0 for empty or single-character strings", () => {
		expect(normalizedEntropy("")).toBe(0);
		expect(normalizedEntropy("a")).toBe(0);
		expect(normalizedEntropy("aaaa")).toBe(0);
	});

	it("returns 1 for a maximally varied two-symbol string", () => {
		expect(normalizedEntropy("ab")).toBe(1);
		expect(normalizedEntropy("abab")).toBe(1);
	});

	it("falls between 0 and 1 for natural text", () => {
		const value = normalizedEntropy("hello world this is a normal bio");
		expect(value).toBeGreaterThan(0);
		expect(value).toBeLessThanOrEqual(1);
	});
});
