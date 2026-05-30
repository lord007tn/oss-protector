import { cn } from "@/lib/utils";

export interface Stat {
	label: string;
	suffix?: string;
	value: string;
}

export function StatStrip({
	stats,
	className,
}: {
	stats: Stat[];
	className?: string;
}) {
	return (
		<div
			className={cn(
				"grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-2 lg:grid-cols-4",
				className
			)}
		>
			{stats.map((stat) => (
				<div
					className="border-border border-b px-6 py-5 last:border-b-0 lg:border-r lg:border-b-0 lg:last:border-r-0 sm:[&:nth-child(odd)]:border-r"
					key={stat.label}
				>
					<div className="font-medium text-3xl tabular-nums tracking-tight">
						{stat.value}
						{stat.suffix ? (
							<span className="ml-0.5 text-lg text-primary">{stat.suffix}</span>
						) : null}
					</div>
					<div className="mt-1.5 font-mono text-muted-foreground text-xs">
						{stat.label}
					</div>
				</div>
			))}
		</div>
	);
}
