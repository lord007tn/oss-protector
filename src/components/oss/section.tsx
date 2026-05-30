import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Section({
	children,
	narrow = false,
	className,
}: {
	children: ReactNode;
	narrow?: boolean;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"mx-auto w-full px-4 py-16 md:px-8 md:py-24",
				narrow ? "max-w-[980px]" : "max-w-[1240px]",
				className
			)}
		>
			{children}
		</section>
	);
}

export function SectionHead({
	eyebrow,
	title,
	sub,
	center = false,
	className,
}: {
	eyebrow: string;
	title: ReactNode;
	sub?: ReactNode;
	center?: boolean;
	className?: string;
}) {
	return (
		<div className={cn("mb-10", center && "text-center", className)}>
			<div
				className={cn(
					"mb-3.5 inline-flex items-center gap-2 font-mono text-primary text-xs uppercase tracking-[0.08em]",
					"before:h-px before:w-4.5 before:bg-primary before:content-['']"
				)}
			>
				{eyebrow}
			</div>
			<h2
				className={cn(
					"max-w-3xl text-balance font-medium text-[clamp(28px,3.4vw,44px)] leading-[1.05] tracking-tight",
					center && "mx-auto"
				)}
			>
				{title}
			</h2>
			{sub ? (
				<p
					className={cn(
						"mt-3.5 max-w-xl text-[15px] text-muted-foreground",
						center && "mx-auto"
					)}
				>
					{sub}
				</p>
			) : null}
		</div>
	);
}
