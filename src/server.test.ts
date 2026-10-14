import {
	appendResponseHeader,
	getRequestHeader,
	setCookie,
	setResponseHeader,
	setResponseStatus,
} from "@tanstack/react-start/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import server from "./server";

const mocks = vi.hoisted(() => ({
	authConfigured: vi.fn(),
	authHandler: vi.fn(),
	fetch: vi.fn(),
	listAccountsApi: vi.fn(),
	listProtectorsApi: vi.fn(),
}));

vi.mock("@tanstack/react-start/server-entry", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@tanstack/react-start/server-entry")
	>()),
	default: { fetch: mocks.fetch },
}));

vi.mock("./auth", () => ({
	createAuth: () => ({ handler: mocks.authHandler }),
	getAuthConfigStatus: mocks.authConfigured,
}));

vi.mock("./actions/directory", async (importOriginal) => ({
	...(await importOriginal<typeof import("./actions/directory")>()),
	listAccountsApi: mocks.listAccountsApi,
	listProtectorsApi: mocks.listProtectorsApi,
}));

const request = (path: string, init?: RequestInit) =>
	server.fetch(new Request(`https://example.test${path}`, init), undefined);

const hasSecurityHeaders = (response: Response) =>
	response.headers.get("X-Content-Type-Options") === "nosniff" &&
	response.headers.get("X-Frame-Options") === "DENY" &&
	response.headers
		.get("Content-Security-Policy")
		?.includes("default-src 'self'") === true;

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
	vi.spyOn(console, "log").mockImplementation(() => undefined);
	mocks.authConfigured.mockReturnValue({ isConfigured: false, missing: [] });
	mocks.fetch.mockImplementation(() => new Response("Rendered page"));
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("custom Start server entry", () => {
	it("preserves endpoint-specific validation errors and security headers", async () => {
		const response = await request("/api/accounts?min_score=101");

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			field: "min_score",
			value: "101",
		});
		expect(hasSecurityHeaders(response)).toBe(true);
		expect(mocks.listAccountsApi).not.toHaveBeenCalled();
	});

	it("preserves the auth endpoint's unconfigured response", async () => {
		const response = await request("/api/auth/get-session");

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			error: "Sign-in is not configured on this deployment.",
		});
		expect(hasSecurityHeaders(response)).toBe(true);
	});

	it("preserves the malformed JSON error before invoking a write action", async () => {
		const response = await request("/api/user/preferences", {
			body: "{",
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid JSON body." });
		expect(hasSecurityHeaders(response)).toBe(true);
	});

	it("keeps multiple Better Auth cookies when adding security headers", async () => {
		mocks.authConfigured.mockReturnValue({ isConfigured: true });
		const headers = new Headers();
		headers.append("set-cookie", "test_session=one; HttpOnly; Path=/");
		headers.append("set-cookie", "test_session_data=two; HttpOnly; Path=/");
		mocks.authHandler.mockResolvedValue(
			Response.json({ ok: true }, { headers })
		);

		const response = await request("/api/auth/get-session");

		expect(response.status).toBe(200);
		expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
		expect(hasSecurityHeaders(response)).toBe(true);
	});

	it("preserves the legacy docs redirect", async () => {
		const response = await request("/api-docs");

		expect(response.status).toBe(301);
		expect(response.headers.get("Location")).toBe("/docs");
		expect(hasSecurityHeaders(response)).toBe(true);
	});

	it("rejects malformed percent encoding before custom API dispatch", async () => {
		const response = await request("/api/auth/%E0%A4%A");

		expect(response.status).toBe(400);
		expect(mocks.authConfigured).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
		expect(hasSecurityHeaders(response)).toBe(true);
	});

	it("converts uncaught custom API errors without exposing diagnostics", async () => {
		mocks.listAccountsApi.mockRejectedValue(
			Object.assign(new Error("Private diagnostic"), { status: 422 })
		);

		const response = await request("/api/accounts");

		expect(response.status).toBe(422);
		expect(response.headers.get("Content-Type")).toContain("application/json");
		expect(await response.text()).not.toContain("Private diagnostic");
		expect(hasSecurityHeaders(response)).toBe(true);
	});

	it.each([
		undefined,
		null,
		false,
		0,
		"",
	])("converts a falsy thrown value (%s) to a protected error response", async (value) => {
		mocks.fetch.mockRejectedValue(value);

		const response = await request("/");

		expect(response.status).toBe(500);
		expect(response.headers.get("Content-Type")).toContain("application/json");
		expect(hasSecurityHeaders(response)).toBe(true);
	});

	it("preserves a thrown Response's error body and metadata", async () => {
		mocks.fetch.mockRejectedValue(
			Response.json(
				{ error: "Endpoint-specific error" },
				{ headers: { "WWW-Authenticate": "Bearer" }, status: 401 }
			)
		);

		const response = await request("/");

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Endpoint-specific error" });
		expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
		expect(hasSecurityHeaders(response)).toBe(true);
	});

	it("keeps a thrown redirect's Location", async () => {
		mocks.fetch.mockRejectedValue(
			new Response(null, { headers: { Location: "/login" }, status: 307 })
		);

		const response = await request("/");

		expect(response.status).toBe(307);
		expect(response.headers.get("Location")).toBe("/login");
	});

	it("applies helper error status, headers, and additive cookies in context", async () => {
		mocks.fetch.mockImplementation(() => {
			setResponseStatus(401);
			setResponseHeader("WWW-Authenticate", "Bearer");
			setCookie("test_cookie", "one", { httpOnly: true });
			appendResponseHeader("set-cookie", "test_cookie_two=two; Path=/");
			throw new Response("Authentication required", { status: 200 });
		});

		const response = await request("/");

		expect(response.status).toBe(401);
		expect(await response.text()).toBe("Authentication required");
		expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
		expect(response.headers.getSetCookie()).toHaveLength(2);
		expect(response.headers.getSetCookie().join("; ")).toContain(
			"test_cookie=one"
		);
		expect(response.headers.getSetCookie().join("; ")).toContain(
			"test_cookie_two=two"
		);
	});

	it.each([
		199, 600,
	])("ignores an invalid helper status (%s)", async (status) => {
		mocks.fetch.mockImplementation(() => {
			setResponseStatus(status);
			throw new Response("Endpoint-specific error", { status: 409 });
		});

		const response = await request("/");

		expect(response.status).toBe(409);
		expect(await response.text()).toBe("Endpoint-specific error");
	});

	it("does not turn an uncaught error into a previously selected success", async () => {
		mocks.fetch.mockImplementation(() => {
			setResponseStatus(201);
			throw Object.assign(new Error("Failed"), { status: 503 });
		});

		const response = await request("/");

		expect(response.status).toBe(503);
	});

	it.each([
		204, 205, 304,
	])("strips the body for helper status %s", async (status) => {
		mocks.fetch.mockImplementation(() => {
			setResponseStatus(status);
			throw new Response("Must not be sent");
		});

		const response = await request("/");

		expect(response.status).toBe(status);
		expect(await response.text()).toBe("");
	});

	it("strips a thrown Response body for HEAD", async () => {
		mocks.fetch.mockRejectedValue(
			new Response("Must not be sent", { status: 401 })
		);

		const response = await request("/", { method: "HEAD" });

		expect(response.status).toBe(401);
		expect(await response.text()).toBe("");
	});

	it("distinguishes empty and missing request headers in the delegated context", async () => {
		mocks.fetch.mockImplementation(() =>
			Response.json({
				empty: getRequestHeader("x-empty"),
				missing: getRequestHeader("x-missing") === undefined,
			})
		);

		const response = await request("/", { headers: { "x-empty": "" } });

		expect(await response.json()).toEqual({ empty: "", missing: true });
	});
});
