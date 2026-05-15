import { type LucideIcon, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import type { RiskStatus } from "@/constants/risk-statuses";
import { RISK_STATUS_LABELS } from "@/constants/risk-statuses";
import { cn } from "@/lib/utils";

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
		<Empty className="rounded-md border border-dashed bg-muted/15 py-8">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

const STATUS_DOT_CLASSES: Record<string, string> = {
	allow: "bg-emerald-500",
	block: "bg-destructive",
	dismissed: "bg-muted-foreground/40",
	high_risk: "bg-orange-500",
	needs_review: "bg-amber-500",
	pending: "bg-muted-foreground/60",
	review: "bg-amber-500",
	validated: "bg-emerald-500",
	watch: "bg-sky-500",
};

const statusVariant = (
	status: RiskStatus | string
): "destructive" | "outline" | "secondary" => {
	if (status === "block") {
		return "destructive";
	}
	if (
		status === "high_risk" ||
		status === "review" ||
		status === "needs_review"
	) {
		return "secondary";
	}
	return "outline";
};

const SCORE_TONE_CLASSES: Record<string, string> = {
	allow: "bg-emerald-500",
	block: "bg-destructive",
	high_risk: "bg-orange-500",
	review: "bg-amber-500",
	watch: "bg-sky-500",
};

const scoreTone = (status: RiskStatus | string) =>
	SCORE_TONE_CLASSES[status] ?? "bg-muted-foreground/60";

export function ScoreMeter({
	score,
	status,
}: {
	score: number;
	status: RiskStatus | string;
}) {
	const width = Math.max(2, Math.min(100, score));
	return (
		<div className="grid w-32 gap-1">
			<div className="flex items-baseline justify-between gap-2">
				<span className="font-mono text-foreground text-xs tabular-nums">
					{score}
				</span>
				<span className="text-[10px] text-muted-foreground uppercase tracking-wide">
					/100
				</span>
			</div>
			<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
				<div
					aria-hidden
					className={cn("h-full rounded-full", scoreTone(status))}
					style={{ width: `${width}%` }}
				/>
			</div>
		</div>
	);
}

export function StatusBadge({ status }: { status: RiskStatus | string }) {
	const variant = statusVariant(status);
	const label =
		status in RISK_STATUS_LABELS
			? RISK_STATUS_LABELS[status as RiskStatus]
			: String(status).replaceAll("_", " ");
	const dotClass = STATUS_DOT_CLASSES[status] ?? "bg-muted-foreground/60";

	return (
		<Badge
			className="gap-1.5 font-medium text-[11px] uppercase tracking-wide"
			variant={variant}
		>
			<span aria-hidden className={cn("size-1.5 rounded-full", dotClass)} />
			{label}
		</Badge>
	);
}
