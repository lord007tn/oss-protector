import { drizzle } from "drizzle-orm/d1";
import type { RuntimeBindings } from "@/env";
import { relations } from "./relations";
import { appSchema } from "./schema";

type GlobalWithDbBindings = typeof globalThis & {
	__devVars?: RuntimeBindings;
	__env__?: RuntimeBindings;
};

const globalWithDbBindings = globalThis as GlobalWithDbBindings;
const d1Binding =
	globalWithDbBindings.__env__?.accounts_db ??
	globalWithDbBindings.__devVars?.accounts_db;

const fallbackD1Binding = new Proxy({} as D1Database, {
	get() {
		throw new Error("Missing Cloudflare D1 binding: accounts_db");
	},
});

export const hasDatabaseBinding = Boolean(d1Binding);

export const database = drizzle(d1Binding ?? fallbackD1Binding, {
	relations,
	schema: appSchema,
});

export type Database = typeof database;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DatabaseOrTransaction = Database | Transaction;
