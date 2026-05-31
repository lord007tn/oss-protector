"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const progressIndicatorVariants = cva("h-full transition-all", {
	variants: {
		tone: {
			primary: "bg-primary",
			success: "bg-success",
			warning: "bg-warning",
			destructive: "bg-destructive",
			info: "bg-info",
			muted: "bg-muted-foreground",
		},
	},
	defaultVariants: {
		tone: "primary",
	},
});

type ProgressTone = NonNullable<
	VariantProps<typeof progressIndicatorVariants>["tone"]
>;

function Progress({
	className,
	trackClassName,
	indicatorClassName,
	tone,
	value,
	...props
}: ProgressPrimitive.Root.Props & {
	trackClassName?: string;
	indicatorClassName?: string;
	tone?: ProgressTone;
}) {
	return (
		<ProgressPrimitive.Root
			className={cn("w-full", className)}
			data-slot="progress"
			value={value}
			{...props}
		>
			<ProgressPrimitive.Track
				className={cn(
					"relative h-2 w-full overflow-hidden rounded-full bg-muted",
					trackClassName
				)}
				data-slot="progress-track"
			>
				<ProgressPrimitive.Indicator
					className={cn(
						progressIndicatorVariants({ tone }),
						indicatorClassName
					)}
					data-slot="progress-indicator"
				/>
			</ProgressPrimitive.Track>
		</ProgressPrimitive.Root>
	);
}

interface ProgressSegment {
	className?: string;
	label: string;
	tone?: ProgressTone;
	value: number;
}

function ProgressSegments({
	className,
	segments,
	...props
}: React.ComponentProps<"div"> & { segments: ProgressSegment[] }) {
	return (
		<div
			className={cn(
				"flex h-2 w-full overflow-hidden rounded-full bg-muted",
				className
			)}
			data-slot="progress-segments"
			{...props}
		>
			{segments.map((segment) => (
				<div
					className={cn(
						progressIndicatorVariants({ tone: segment.tone }),
						segment.className
					)}
					key={segment.label}
					style={{ width: `${segment.value}%` }}
				/>
			))}
		</div>
	);
}

export { Progress, ProgressSegments, progressIndicatorVariants };
