import { Bot, Github, ListChecks, MessageSquareWarning } from "lucide-react";

import { ProcessStep, SectionHeading } from "./shared";

export function HowItWorks() {
	const steps = [
		{
			description:
				"Install one shared GitHub App on the repositories you want covered.",
			icon: Github,
			title: "Install",
		},
		{
			description:
				"The app joins new pull requests automatically, inspects files + patch snippets, then posts an assessment.",
			icon: MessageSquareWarning,
			title: "Review",
		},
		{
			description:
				"AI inspects the report or PR context, detects abuse patterns, and scores by verdict and reason.",
			icon: Bot,
			title: "Detect",
		},
		{
			description:
				"Submitted reports stay as signals. Only validated or corroborated evidence affects the public score.",
			icon: ListChecks,
			title: "Classify",
		},
	];

	return (
		<section className="border-b">
			<div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 md:px-6">
				<SectionHeading
					description="A report becomes a structured signal with one of four states: submitted, needs review, validated, or dismissed."
					eyebrow="How it works"
					title="Install. Review. Detect. Classify."
				/>
				<div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
					{steps.map((step, index) => (
						<ProcessStep
							description={step.description}
							icon={step.icon}
							index={index + 1}
							key={step.title}
							title={step.title}
						/>
					))}
				</div>
			</div>
		</section>
	);
}
