import { PageShell } from "@/components/site/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Centered({
	eyebrow,
	title,
	description,
	primary,
	secondary,
}: {
	eyebrow: string;
	title: string;
	description: string;
	primary: { href: string; label: string };
	secondary: { href: string; label: string };
}) {
	return (
		<div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
			<div className="font-mono text-primary text-sm tracking-[0.08em]">
				{eyebrow}
			</div>
			<h1 className="mt-2.5 mb-2 font-medium text-[clamp(36px,6vw,56px)] leading-none tracking-tight">
				{title}
			</h1>
			<p className="mb-7 max-w-md text-[16px] text-muted-foreground">
				{description}
			</p>
			<div className="flex flex-wrap justify-center gap-2.5">
				<a className={cn(buttonVariants())} href={primary.href}>
					{primary.label}
				</a>
				<a
					className={cn(buttonVariants({ variant: "outline" }))}
					href={secondary.href}
				>
					{secondary.label}
				</a>
			</div>
		</div>
	);
}

export function NotFoundView() {
	return (
		<PageShell>
			<Centered
				description="That page doesn't exist, or the account was reclassified and disappeared from the directory. The trust graph never stands still."
				eyebrow="— 404"
				primary={{ href: "/", label: "Back to home" }}
				secondary={{ href: "/feed", label: "Open the live feed" }}
				title="Not the bot you're looking for."
			/>
		</PageShell>
	);
}

export function ErrorView({ digest }: { digest?: string }) {
	return (
		<PageShell>
			<Centered
				description={
					digest
						? `Something broke on our end (ref ${digest}). The trust graph is fine — try reloading or head back home.`
						: "Something broke on our end. The trust graph is fine — try reloading or head back home."
				}
				eyebrow="— 500"
				primary={{ href: "/", label: "Back to home" }}
				secondary={{ href: "/feed", label: "Open the live feed" }}
				title="That wasn't supposed to happen."
			/>
		</PageShell>
	);
}
