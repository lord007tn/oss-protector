import { type LucideIcon, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { RiskStatus } from "@/constants/risk-statuses";
import { RISK_STATUS_LABELS } from "@/constants/risk-statuses";

export function SectionHeading({
	description,
	eyebrow,
	headingLevel = 2,
	title,
}: {
	description: string;
	eyebrow: string;
	headingLevel?: 1 | 2;
	title: string;
}) {
	const Heading = headingLevel === 1 ? "h1" : "h2";

	return (
		<div className="max-w-3xl">
			<span className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
				{eyebrow}
			</span>
			<Heading className="mt-2 text-balance font-semibold text-2xl tracking-tight md:text-3xl">
				{title}
			</Heading>
			<p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6 md:text-[15px]">
				{description}
			</p>
		</div>
	);
}

export function ProcessStep({
	description,
	icon: Icon,
	index,
	title,
}: {
	description: string;
	icon: LucideIcon;
	index: number;
	title: string;
}) {
	return (
		<Card className="rounded-md border-muted/60">
			<CardHeader className="space-y-2 pb-3">
				<div className="flex items-center justify-between gap-3">
					<span className="font-mono text-muted-foreground text-xs tabular-nums">
						{String(index).padStart(2, "0")}
					</span>
					<span className="grid size-8 place-items-center rounded-md border border-muted bg-muted/40 text-foreground">
						<Icon className="size-3.5" />
					</span>
				</div>
				<CardTitle className="font-medium text-base">{title}</CardTitle>
				<CardDescription className="text-xs leading-5">
					{description}
				</CardDescription>
			</CardHeader>
		</Card>
	);
}

export function CodePanel({
	description,
	lines,
	title,
}: {
	description: string;
	lines: string[];
	title: string;
}) {
	return (
		<Card className="rounded-lg">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Terminal className="size-5 text-primary" />
					{title}
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<pre className="overflow-x-auto rounded-lg border bg-foreground p-4 text-background text-sm">
					<code>{lines.join("\n")}</code>
				</pre>
			</CardContent>
		</Card>
	);
}

export function EmptyState({
	description,
	icon: Icon,
	title,
}: {
	description: string;
	icon: LucideIcon;
	title: string;
}) {
	return (
		<div className="grid min-h-40 place-items-center rounded-lg border border-dashed bg-muted/20 p-6 text-center">
			<div>
				<Icon className="mx-auto size-8 text-muted-foreground" />
				<p className="mt-3 font-medium">{title}</p>
				<p className="mt-1 max-w-md text-muted-foreground text-sm">
					{description}
				</p>
			</div>
		</div>
	);
}

export function StatusBadge({ status }: { status: RiskStatus | string }) {
	let variant: "destructive" | "outline" | "secondary" = "outline";
	if (status === "block") {
		variant = "destructive";
	} else if (
		status === "high_risk" ||
		status === "review" ||
		status === "needs_review"
	) {
		variant = "secondary";
	}
	const label =
		status in RISK_STATUS_LABELS
			? RISK_STATUS_LABELS[status as RiskStatus]
			: String(status).replaceAll("_", " ");

	return <Badge variant={variant}>{label}</Badge>;
}
