import { describe, expect, it } from "vitest";
import { appealOutcome, isAppealResolution } from "./appeals";

describe("isAppealResolution", () => {
	it("accepts the two known resolutions", () => {
		expect(isAppealResolution("uphold")).toBe(true);
		expect(isAppealResolution("reject")).toBe(true);
	});

	it("rejects anything else, including legacy/empty values", () => {
		expect(isAppealResolution("upheld")).toBe(false);
		expect(isAppealResolution("dismiss")).toBe(false);
		expect(isAppealResolution("")).toBe(false);
		expect(isAppealResolution(null)).toBe(false);
		expect(isAppealResolution(undefined)).toBe(false);
		expect(isAppealResolution(0)).toBe(false);
	});
});

describe("appealOutcome", () => {
	it("uphold clears the flag (allowlist) and records 'upheld'", () => {
		expect(appealOutcome("uphold")).toEqual({
			allowlist: true,
			status: "upheld",
		});
	});

	it("reject leaves the flag in place and records 'rejected'", () => {
		expect(appealOutcome("reject")).toEqual({
			allowlist: false,
			status: "rejected",
		});
	});

	it("only uphold triggers allowlisting", () => {
		expect(appealOutcome("uphold").allowlist).toBe(true);
		expect(appealOutcome("reject").allowlist).toBe(false);
	});
});
