import { Bot, Github, ListChecks, MessageSquareWarning } from "lucide-react";

import { ProcessStep, SectionHeading } from "./shared";

export function HowItWorks() {
	const steps = [
		{
			description:
				"Add one GitHub App to the repositories where maintainers want shared protection.",
			icon: Github,
			title: "Install",
		},
		{
			description:
				"OSS Protector joins new pull requests automatically, inspects changed files and patch snippets, then posts an assessment.",
			icon: MessageSquareWarning,
			title: "Review",
		},
		{
			description:
				"AI reviews the report context, detects abuse patterns, and classifies the signal by verdict, confidence, and reason.",
			icon: Bot,
			title: "Detect",
		},
		{
			description:
				"Submitted and needs-review reports are tracked as signals; only validated or independently corroborated evidence affects shared scores.",
			icon: ListChecks,
			title: "Classify",
		},
	];

	return (
		<section className="border-b">
			<div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 md:px-6">
				<SectionHeading
					description="A report becomes a structured signal with one of four states: submitted, needs review, validated, or dismissed."
					eyebrow="How it works"
					title="Install, report, detect, classify."
				/>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
