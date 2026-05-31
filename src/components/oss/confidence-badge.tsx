import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { confidenceTone } from "@/lib/oss";
import { cn } from "@/lib/utils";

const TIER_VARIANT = {
	high: "destructive",
	med: "warning",
	low: "success",
} as const;

export function ConfidenceBadge({
	value,
	className,
}: {
	value: number;
	className?: string;
}) {
	const pct = Math.round(value * 100);
	const tone = confidenceTone(value);
	const variant = TIER_VARIANT[tone.label as keyof typeof TIER_VARIANT];

	return (
		<Badge
			className={cn("gap-2 font-mono tabular-nums", className)}
			render={<div />}
			title={`${pct}% confidence — ${tone.label}`}
			variant={variant}
		>
			<Progress
				className="w-14"
				indicatorClassName={tone.fill}
				trackClassName="h-1.5 w-14"
				value={pct}
			/>
			<span>
				{pct}
				<span className="opacity-60">%</span>
			</span>
		</Badge>
	);
}
