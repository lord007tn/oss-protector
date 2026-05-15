import { ExternalLink, Sparkles } from "lucide-react";

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
			<div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
				<Card className="rounded-lg">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Sparkles className="size-5 text-primary" />
							Inspiration and first data layer
						</CardTitle>
						<CardDescription>
							OSS Protector started from the Clankers Leaderboard idea and its
							public bot blocklist data. Credit to @heyandras for publishing the
							original leaderboard.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-wrap gap-2">
						<a
							className={buttonVariants({ variant: "outline" })}
							href="https://clankers-leaderboard.pages.dev/"
							rel="noopener"
							target="_blank"
						>
							Leaderboard
							<ExternalLink data-icon="inline-end" />
						</a>
						<a
							className={buttonVariants({ variant: "ghost" })}
							href="https://x.com/heyandras"
							rel="noopener"
							target="_blank"
						>
							@heyandras
							<ExternalLink data-icon="inline-end" />
						</a>
					</CardContent>
				</Card>
			</div>
		</section>
	);
}
