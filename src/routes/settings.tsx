import { createFileRoute } from "@tanstack/react-router";
import { Check, Github, LogOut, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { githubAppInstallUrl } from "@/components/landing/constants";
import { PreferencesPanel } from "@/components/settings/preferences-panel";
import {
	PageContainer,
	PageHeader,
	PageShell,
} from "@/components/site/page-shell";
import { SignInGate } from "@/components/site/sign-in-gate";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";
import { useSessionState } from "@/lib/use-session-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
	component: SettingsRoute,
	head: () => ({ meta: [{ title: "Settings | OSS Protector" }] }),
});

function SettingsRoute() {
	const { signedIn, session } = useSessionState();

	if (!signedIn) {
		return (
			<PageShell>
				<SignInGate />
			</PageShell>
		);
	}

	const handle =
		session?.user?.name?.trim() ||
		session?.user?.email?.split("@")[0] ||
		"maintainer";

	const signOut = async () => {
		await authClient.signOut();
		window.location.href = "/";
	};

	return (
		<PageShell authed consoleLabel="Account settings">
			<PageContainer className="py-9">
				<PageHeader
					description="Your linked account, how OSS Protector notifies you, and where to manage protection."
					title="Settings"
				/>

				<div className="mt-6 flex max-w-2xl flex-col gap-4">
					<Section
						desc="Linked through GitHub. Managed by GitHub — change your name or email there."
						title="Account"
					>
						<FieldRow label="Account">
							<div className="flex items-center gap-2.5">
								<Github className="size-3.5" />
								<span className="font-mono text-sm">@{handle}</span>
								<Badge variant="success">
									<Check />
									verified
								</Badge>
							</div>
						</FieldRow>
						{session?.user?.email ? (
							<FieldRow hint="Used for sign-in" label="Email">
								<span className="font-mono text-sm">{session.user.email}</span>
							</FieldRow>
						) : null}
						<FieldRow hint="Ends your web session" label="Session">
							<Button
								onClick={signOut}
								size="sm"
								type="button"
								variant="outline"
							>
								<LogOut data-icon="inline-start" />
								Sign out
							</Button>
						</FieldRow>
					</Section>

					<PreferencesPanel />

					<Section
						desc="Protection is controlled by the GitHub App installation. Add or remove repositories, or uninstall, from GitHub."
						title="Manage protection"
					>
						<div className="flex flex-wrap gap-2">
							<a
								className={cn(buttonVariants({ size: "sm" }))}
								href="/dashboard"
							>
								<Shield data-icon="inline-start" />
								Open dashboard
							</a>
							<a
								className={cn(
									buttonVariants({ size: "sm", variant: "outline" })
								)}
								href={githubAppInstallUrl}
							>
								<Github data-icon="inline-start" />
								Manage repositories on GitHub
							</a>
						</div>
						<p className="mt-3 text-[12.5px] text-muted-foreground leading-relaxed">
							Uninstalling the GitHub App stops all analysis on your repos and
							removes the installation.
						</p>
					</Section>
				</div>
			</PageContainer>
		</PageShell>
	);
}

function Section({
	title,
	desc,
	children,
}: {
	title: string;
	desc: string;
	children: ReactNode;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{desc}</CardDescription>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

function FieldRow({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<>
			<Separator />
			<div className="grid items-center gap-4 py-3 sm:grid-cols-[200px_1fr]">
				<div>
					<span className="font-medium text-[13.5px]">{label}</span>
					{hint ? (
						<div className="mt-0.5 text-muted-foreground text-xs">{hint}</div>
					) : null}
				</div>
				{children}
			</div>
		</>
	);
}
