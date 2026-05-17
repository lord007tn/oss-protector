import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getClankerProfile } from "@/actions/clanker-profile";

export const getClankerProfileFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) =>
		z.object({ login: z.string().min(1).max(100) }).parse(data)
	)
	.handler(async ({ data }) => getClankerProfile(data.login));
