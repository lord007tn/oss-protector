import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getRepoProfile } from "@/actions/repo-profile";

export const getRepoProfileFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) =>
		z
			.object({
				name: z.string().min(1).max(100),
				owner: z.string().min(1).max(100),
			})
			.parse(data)
	)
	.handler(async ({ data }) => getRepoProfile(data.owner, data.name));
