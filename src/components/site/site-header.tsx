import { useRouterState } from "@tanstack/react-router";
import {
	Bell,
	Bot,
	Check,
	ChevronDown,
	Flag,
	Github,
	Inbox,
	Info,
	LogOut,
	Settings,
	Shield,
	ShieldCheck,
	Star,
} from "lucide-react";
import {
	appName,
	githubAppInstallUrl,
	githubRepoUrl,
} from "@/components/landing/constants";
import { InitialsAvatar } from "@/components/oss/initials-avatar";
import { Logo } from "@/components/oss/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { githubStars } from "@/generated/github-stars";
import { authClient } from "@/lib/auth-client";
import { relativeTime } from "@/lib/directory-view";
import { formatStarCount } from "@/lib/github-stars";
import {
	type ClientNotification,
	useNotifications,
} from "@/lib/use-notifications";
import { useSessionState } from "@/lib/use-session-state";
import { cn } from "@/lib/utils";

// Every primary destination shown inline in the header — no "More" dropdown.
const NAV_LINKS = [
	{ href: "/feed", label: "Feed" },
	{ href: "/accounts", label: "Accounts" },
	{ href: "/methodology", label: "Methodology" },
	{ href: "/sponsors", label: "Sponsors" },
	{ href: "/appeal", label: "Appeal" },
];

function notificationIcon(kind: string) {
	if (kind === "report" || kind === "dispute") {
		return <Flag className="size-3.5 text-primary" />;
	}
	if (kind === "flag") {
		return <Bot className="size-3.5 text-destructive" />;
	}
	if (kind === "correction" || kind === "ok") {
		return <Check className="size-3.5 text-success" />;
	}
	return <Info className="size-3.5 text-info" />;
}

export function SiteHeader() {
	const { signedIn, session } = useSessionState();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { notifications, unread, markRead, markAllRead } =
		useNotifications(signedIn);
	const isAdmin = session?.user?.role === "admin";
	const displayName =
		session?.user?.name?.trim() ||
		session?.user?.email?.split("@")[0] ||
		"account";
	const initials = displayName.slice(0, 2).toUpperCase();

	const isActive = (href: string) =>
		pathname === href || pathname.startsWith(`${href}/`);

	const signOut = async () => {
		await authClient.signOut();
		window.location.href = "/";
	};

	// Record the read server-side before navigating; a plain full-page nav would
	// otherwise abort the in-flight fetch and leave the badge stuck.
	const openNotification = async (notification: ClientNotification) => {
		await markRead(notification.id);
		window.location.href = notification.link ?? "/dashboard";
	};

	return (
		<header className="sticky top-0 z-50 border-b bg-background/75 backdrop-blur-xl backdrop-saturate-150">
			<div className="mx-auto flex h-14 w-full max-w-[1240px] items-center justify-between gap-4 px-4 md:px-8">
				<div className="flex items-center gap-7">
					<Logo />
					<nav className="hidden items-center gap-0.5 md:flex">
						{NAV_LINKS.map((link) => (
							<a
								className={cn(
									buttonVariants({ size: "sm", variant: "ghost" }),
									"text-muted-foreground",
									isActive(link.href) && "bg-muted text-foreground"
								)}
								href={link.href}
								key={link.href}
							>
								{link.label}
							</a>
						))}
					</nav>
				</div>

				<div className="flex items-center gap-1.5">
					<a
						aria-label={`Star ${appName} on GitHub`}
						className={cn(
							buttonVariants({ size: "sm", variant: "outline" }),
							"hidden gap-0 overflow-hidden p-0 sm:inline-flex"
						)}
						href={githubRepoUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						<span className="flex items-center gap-1.5 px-2.5">
							<Github className="size-3.5" />
							<span className="hidden lg:inline">Star</span>
						</span>
						<span className="flex h-full items-center gap-1 border-l bg-muted/40 px-2.5 font-mono text-muted-foreground text-xs tabular-nums">
							<Star className="size-3 text-warning" />
							{formatStarCount(githubStars)}
						</span>
					</a>

					<ThemeToggle />

					{signedIn ? (
						<>
							<Popover>
								<PopoverTrigger
									render={
										<Button
											aria-label="Notifications"
											className="relative"
											size="icon"
											variant="ghost"
										/>
									}
								>
									<Bell />
									{unread > 0 ? (
										<span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-primary ring-2 ring-background" />
									) : null}
								</PopoverTrigger>
								<PopoverContent
									align="end"
									className="w-[360px] gap-0 p-0"
									sideOffset={8}
								>
									<div className="flex items-center justify-between border-b px-3.5 py-3 font-mono text-muted-foreground text-xs">
										<span>Notifications · {unread} unread</span>
										<Button
											disabled={unread === 0}
											onClick={() => markAllRead()}
											size="xs"
											type="button"
											variant="link"
										>
											Mark all read
										</Button>
									</div>
									<div className="max-h-[350px] overflow-y-auto">
										{notifications.length === 0 ? (
											<div className="px-3.5 py-8 text-center text-muted-foreground text-xs">
												You're all caught up.
											</div>
										) : (
											notifications.map((n) => (
												<a
													className={cn(
														"grid grid-cols-[24px_1fr_auto] gap-2.5 border-b px-3.5 py-3 text-[13.5px] transition-colors last:border-0 hover:bg-muted",
														!n.read && "bg-primary/[0.06]"
													)}
													href={n.link ?? "/dashboard"}
													key={n.id}
													onClick={(event) => {
														event.preventDefault();
														openNotification(n);
													}}
												>
													<span className="mt-0.5">
														{notificationIcon(n.kind)}
													</span>
													<span className="flex flex-col gap-0.5">
														<span
															className={cn(
																n.read ? "font-normal" : "font-medium"
															)}
														>
															{n.title}
														</span>
														{n.body ? (
															<span className="text-muted-foreground text-xs">
																{n.body}
															</span>
														) : null}
													</span>
													<span className="font-mono text-muted-foreground text-xs">
														{relativeTime(n.createdAt)}
													</span>
												</a>
											))
										)}
									</div>
									<div className="border-t px-3.5 py-3 font-mono text-xs">
										<a className="text-primary" href="/settings">
											Notification settings →
										</a>
									</div>
								</PopoverContent>
							</Popover>

							<DropdownMenu>
								<DropdownMenuTrigger className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 outline-none transition-colors hover:bg-muted">
									<InitialsAvatar
										className="size-7 text-[10px]"
										color={1}
										initials={initials}
									/>
									<span className="hidden text-[12.5px] text-muted-foreground sm:inline">
										{displayName}
									</span>
									<ChevronDown className="size-3 opacity-60" />
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-60">
									<DropdownMenuGroup>
										<DropdownMenuLabel className="py-1.5">
											<div className="truncate font-medium text-foreground text-sm">
												{session?.user?.email ?? displayName}
											</div>
											<div className="mt-0.5 text-muted-foreground text-xs">
												Signed in
											</div>
										</DropdownMenuLabel>
									</DropdownMenuGroup>
									<DropdownMenuSeparator />
									{isAdmin ? (
										<DropdownMenuItem
											render={
												<a href="/admin">
													<ShieldCheck className="size-3.5" />
													Admin
												</a>
											}
										/>
									) : null}
									<DropdownMenuItem
										render={
											<a href="/settings">
												<Settings className="size-3.5" />
												Settings
											</a>
										}
									/>
									<DropdownMenuItem
										render={
											<a href="/install">
												<Shield className="size-3.5" />
												Install on another repo
											</a>
										}
									/>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={signOut} variant="destructive">
										<LogOut className="size-3.5" />
										Sign out
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</>
					) : (
						<a className={cn(buttonVariants({ size: "sm" }))} href="/login">
							<Github data-icon="inline-start" />
							<span className="hidden sm:inline">Sign in</span>
						</a>
					)}

					{signedIn ? (
						<a
							className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
							href="/dashboard"
						>
							<Inbox data-icon="inline-start" />
							Dashboard
						</a>
					) : (
						<a
							className={cn(
								buttonVariants({ size: "sm", variant: "outline" }),
								"shrink-0"
							)}
							href={githubAppInstallUrl}
						>
							<Shield data-icon="inline-start" />
							Install
						</a>
					)}
				</div>
			</div>
			<MobileNav isActive={isActive} />
		</header>
	);
}

function MobileNav({ isActive }: { isActive: (href: string) => boolean }) {
	return (
		<nav className="-mx-1 flex items-center gap-1 overflow-x-auto border-t px-3 py-2 md:hidden">
			{NAV_LINKS.map((link) => (
				<a
					className={cn(
						buttonVariants({ size: "sm", variant: "ghost" }),
						"shrink-0 text-muted-foreground",
						isActive(link.href) && "bg-muted text-foreground"
					)}
					href={link.href}
					key={link.href}
				>
					{link.label}
				</a>
			))}
		</nav>
	);
}
