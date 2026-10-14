import { H3 } from "nitro/h3";
import { describe, expect, it, vi } from "vitest";

describe("Nitro's HTTP adapter", () => {
	it.each([
		"%",
		"%ZZ",
		"%E0%A4%A",
	])("rejects malformed encoding %s before middleware or app handlers", async (path) => {
		const onRequest = vi.fn();
		const handler = vi.fn(() => new Response("Must not run"));
		const app = new H3({ onRequest });
		app.all("/**", handler);

		const response = await app.fetch(
			new Request(`https://example.test/api/auth/${path}`)
		);

		expect(response.status).toBe(400);
		expect(onRequest).not.toHaveBeenCalled();
		expect(handler).not.toHaveBeenCalled();
	});

	it("continues routing valid percent-encoded paths", async () => {
		const app = new H3();
		app.all("/**", () => new Response("OK"));

		const response = await app.fetch(
			new Request("https://example.test/api/%E2%9C%93")
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("OK");
	});

	it("preserves a returned Response's status, body, and separate cookies", async () => {
		const headers = new Headers();
		headers.append("set-cookie", "test_session=one; HttpOnly; Path=/");
		headers.append("set-cookie", "test_session_data=two; HttpOnly; Path=/");
		const app = new H3();
		app.all("/**", () => new Response("Created", { headers, status: 201 }));

		const response = await app.fetch(
			new Request("https://example.test/api/auth")
		);

		expect(response.status).toBe(201);
		expect(await response.text()).toBe("Created");
		expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
	});
});
