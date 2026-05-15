import { ArrowUpRight, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export function Credits() {
	return (
		<section className="border-b">
			<div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
				<Card className="rounded-md border-muted/60">
					<CardHeader className="space-y-1 pb-3">
						<CardTitle className="flex items-center gap-2 font-medium text-base">
							<Sparkles className="size-4 text-muted-foreground" />
							Inspiration and first data layer
						</CardTitle>
						<CardDescription className="text-xs leading-5">
							OSS Protector started from the Clankers Leaderboard idea and its
							public bot blocklist data. Credit to @heyandras for the original
							leaderboard.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-wrap gap-2 pt-0">
						<a
							className={buttonVariants({ size: "sm", variant: "outline" })}
							href="https://clankers-leaderboard.pages.dev/"
							rel="noopener"
							target="_blank"
						>
							Leaderboard
							<ArrowUpRight data-icon="inline-end" />
						</a>
						<a
							className={buttonVariants({ size: "sm", variant: "ghost" })}
							href="https://x.com/heyandras"
							rel="noopener"
							target="_blank"
						>
							@heyandras
							<ArrowUpRight data-icon="inline-end" />
						</a>
					</CardContent>
				</Card>
			</div>
		</section>
	);
}
