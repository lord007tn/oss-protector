import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";

import { SectionHeading } from "./shared";

export function PolicyPage({
	children,
	description,
	eyebrow,
	title,
}: {
	children: ReactNode;
	description: string;
	eyebrow: string;
	title: string;
}) {
	return (
		<div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-12 md:px-6 md:py-16">
			<SectionHeading
				description={description}
				eyebrow={eyebrow}
				headingLevel={1}
				title={title}
			/>
			<div className="grid gap-1 text-sm leading-6">{children}</div>
		</div>
	);
}

export function PolicySection({
	children,
	title,
}: {
	children: ReactNode;
	title: string;
}) {
	return (
		<section className="grid gap-2 pt-5 first:pt-0">
			<Separator className="mb-5 [section:first-child_&]:hidden" />
			<h2 className="font-medium text-base tracking-tight">{title}</h2>
			<div className="grid gap-2 text-muted-foreground">{children}</div>
		</section>
	);
}
