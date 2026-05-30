import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getAccountProfile } from "@/actions/account-profile";

export const getAccountProfileFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) =>
		z.object({ login: z.string().min(1).max(100) }).parse(data)
	)
	.handler(async ({ data }) => getAccountProfile(data.login));
