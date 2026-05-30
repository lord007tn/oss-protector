import { confidenceTone } from "@/lib/oss";
import { cn } from "@/lib/utils";

export function ConfidenceBadge({
	value,
	className,
}: {
	value: number;
	className?: string;
}) {
	const pct = Math.round(value * 100);
	const tone = confidenceTone(value);

	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 rounded-md px-2 py-1 font-mono text-xs tabular-nums",
				tone.soft,
				tone.text,
				className
			)}
			title={`${pct}% confidence — ${tone.label}`}
		>
			<span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-foreground/10">
				<span
					className={cn("absolute inset-y-0 left-0 rounded-full", tone.fill)}
					style={{ width: `${pct}%` }}
				/>
			</span>
			<span>
				{pct}
				<span className="opacity-60">%</span>
			</span>
		</span>
	);
}
