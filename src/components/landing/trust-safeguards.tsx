import {
	EyeOff,
	GitPullRequest,
	ShieldCheck,
	SlidersHorizontal,
} from "lucide-react";

import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

import { SectionHeading } from "./shared";

const safeguards = [
	{
		description:
			"Repo insiders and trusted automation are skipped by default, and private repositories do not send patch content to AI unless a repo policy opts in.",
		icon: EyeOff,
		title: "Private by default",
	},
	{
		description:
			"Scores separate imported records, maintainer reports, AI review, and corroborated evidence so a single weak signal does not become a verdict.",
		icon: SlidersHorizontal,
		title: "Evidence-weighted scoring",
	},
	{
		description:
			"Maintainers can confirm, dismiss, allow, or reset from PR comments, and listed users get a clear contest path.",
		icon: ShieldCheck,
		title: "False-positive controls",
	},
	{
		description:
			"Each assessment points back to the pull request context, reason code, confidence, and scoring breakdown that drove the result.",
		icon: GitPullRequest,
		title: "Auditable reviews",
	},
] as const;

export function TrustSafeguards() {
	return (
		<section className="border-b">
			<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 md:px-6">
				<SectionHeading
					description="The directory is designed as a maintainer review aid, not an automatic blocklist. Evidence quality, provenance, and correction paths are part of the product surface."
					eyebrow="Why trust it"
					title="Guardrails before public scores."
				/>
				<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
					{safeguards.map((item) => (
						<Card className="rounded-md border-muted/60" key={item.title}>
							<CardHeader className="space-y-2 pb-3">
								<span className="grid size-8 place-items-center rounded-md border border-muted bg-muted/40 text-foreground">
									<item.icon className="size-3.5" />
								</span>
								<CardTitle className="font-medium text-base">
									{item.title}
								</CardTitle>
								<CardDescription className="text-xs leading-5">
									{item.description}
								</CardDescription>
							</CardHeader>
						</Card>
					))}
				</div>
			</div>
		</section>
	);
}
