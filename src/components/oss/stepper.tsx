import { cn } from "@/lib/utils";

export interface Step {
	label: string;
}

export function Stepper({
	steps,
	current,
}: {
	steps: Step[];
	current: number;
}) {
	return (
		<div
			className="mb-9 grid gap-2"
			style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}
		>
			{steps.map((step, index) => {
				const done = index < current;
				const active = index === current;
				return (
					<div className="flex flex-col gap-2 pt-3" key={step.label}>
						<div
							className={cn(
								"h-[3px] rounded-full",
								done && "bg-success",
								active && "bg-primary",
								!(done || active) && "bg-border"
							)}
						/>
						<span
							className={cn(
								"font-mono text-xs uppercase tracking-wider",
								done && "text-success",
								active && "text-primary",
								!(done || active) && "text-muted-foreground"
							)}
						>
							Step {index + 1}
						</span>
						<span
							className={cn(
								"text-sm",
								done || active
									? "font-medium text-foreground"
									: "text-muted-foreground"
							)}
						>
							{step.label}
						</span>
					</div>
				);
			})}
		</div>
	);
}
