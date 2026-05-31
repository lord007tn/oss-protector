import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Ban, Loader2, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SponsorsTab } from "@/components/admin/sponsors-tab";
import { InitialsAvatar } from "@/components/oss/initials-avatar";
import {
	PageContainer,
	PageHeader,
	PageShell,
} from "@/components/site/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminOverview } from "@/functions/admin";
import { getAdminOverviewFn } from "@/functions/admin";
import { authClient } from "@/lib/auth-client";
import { useSessionState } from "@/lib/use-session-state";

export const Route = createFileRoute("/admin")({
	// Admin-only. The session is resolved in the root beforeLoad; non-admins are
	// bounced before the console renders (signed-out -> login, signed-in
	// non-admin -> home).
	beforeLoad: ({ context, location }) => {
		if (!context.session) {
			throw redirect({ search: { redirect: location.href }, to: "/login" });
		}
		if (!context.session.isAdmin) {
			throw redirect({ to: "/" });
		}
	},
	loader: () => getAdminOverviewFn(),
	head: () => ({
		meta: [
			{ title: "Admin | OSS Protector" },
			{ content: "noindex", name: "robots" },
		],
	}),
	component: AdminRoute,
});

type AdminTab = "overview" | "sponsors" | "users";

function AdminRoute() {
	const overview = Route.useLoaderData();
	const { session } = useSessionState();
	const [tab, setTab] = useState<AdminTab>("overview");

	return (
		<PageShell authed consoleLabel="Admin">
			<PageContainer className="py-9">
				<PageHeader
					description={
						<>
							Platform administration. Signed in as{" "}
							<span className="font-mono text-foreground">
								{session?.user?.email}
							</span>
							.
						</>
					}
					title="Admin"
				/>

				<div className="mt-6">
					<Tabs
						onValueChange={(value) => setTab(value as AdminTab)}
						value={tab}
					>
						<TabsList>
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="users">Users</TabsTrigger>
							<TabsTrigger value="sponsors">Sponsors</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				<div className="mt-6">
					{tab === "overview" ? <OverviewTab overview={overview} /> : null}
					{tab === "users" ? <UsersTab /> : null}
					{tab === "sponsors" ? <SponsorsTab /> : null}
				</div>
			</PageContainer>
		</PageShell>
	);
}

function StatCard({ label, value }: { label: string; value: number }) {
	return (
		<Card className="p-5">
			<div className="font-mono text-muted-foreground text-xs uppercase tracking-[0.06em]">
				{label}
			</div>
			<div className="mt-2 font-medium text-3xl tabular-nums tracking-tight">
				{value.toLocaleString()}
			</div>
		</Card>
	);
}

function AdminCountAlert({ admins }: { admins: number }) {
	if (admins === 1) {
		return (
			<Alert className="mb-5" variant="success">
				<ShieldCheck />
				<AlertTitle>You are the only admin.</AlertTitle>
				<AlertDescription>
					Exactly one account holds the admin role, as intended.
				</AlertDescription>
			</Alert>
		);
	}
	return (
		<Alert className="mb-5" variant="warning">
			<ShieldCheck />
			<AlertTitle>{admins} accounts hold the admin role.</AlertTitle>
			<AlertDescription>
				Only your account should be an admin. Review the Users tab and demote
				any unexpected admins.
			</AlertDescription>
		</Alert>
	);
}

function OverviewTab({ overview }: { overview: AdminOverview | null }) {
	if (!overview) {
		return (
			<Alert variant="destructive">
				<AlertDescription>
					The admin overview is unavailable — the database isn't configured.
				</AlertDescription>
			</Alert>
		);
	}

	const cards: { label: string; value: number }[] = [
		{ label: "Registered users", value: overview.users },
		{ label: "Admins", value: overview.admins },
		{ label: "Tracked accounts", value: overview.trackedAccounts },
		{ label: "Risk profiles", value: overview.riskProfiles },
		{ label: "Reports", value: overview.reports },
		{ label: "Installations", value: overview.installations },
		{ label: "Repositories", value: overview.repositories },
		{ label: "Pull requests", value: overview.pullRequests },
		{ label: "Pending appeals", value: overview.pendingAppeals },
		{ label: "Pending backfills", value: overview.pendingBackfills },
	];

	return (
		<>
			<AdminCountAlert admins={overview.admins} />
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{cards.map((card) => (
					<StatCard key={card.label} label={card.label} value={card.value} />
				))}
			</div>
		</>
	);
}

interface AdminUser {
	banned?: boolean | null;
	createdAt: Date | number | string;
	email: string;
	id: string;
	name?: null | string;
	role?: null | string;
}

function joinedLabel(value: Date | number | string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "—";
	}
	return date.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function UserActions({
	banned,
	pending,
	confirmingDelete,
	onBan,
	onUnban,
	onDelete,
}: {
	banned: boolean;
	pending: boolean;
	confirmingDelete: boolean;
	onBan: () => void;
	onUnban: () => void;
	onDelete: () => void;
}) {
	return (
		<>
			{banned ? (
				<Button
					disabled={pending}
					onClick={onUnban}
					size="sm"
					type="button"
					variant="ghost"
				>
					<RotateCcw />
					Unban
				</Button>
			) : (
				<Button
					disabled={pending}
					onClick={onBan}
					size="sm"
					type="button"
					variant="ghost"
				>
					<Ban />
					Ban
				</Button>
			)}
			<Button
				disabled={pending}
				onClick={onDelete}
				size="sm"
				type="button"
				variant={confirmingDelete ? "destructive" : "ghost"}
			>
				{pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
				{confirmingDelete ? "Confirm delete" : "Delete"}
			</Button>
		</>
	);
}

function UserRow({
	user,
	isSelf,
	pending,
	confirmingDelete,
	onBan,
	onUnban,
	onDelete,
}: {
	user: AdminUser;
	isSelf: boolean;
	pending: boolean;
	confirmingDelete: boolean;
	onBan: () => void;
	onUnban: () => void;
	onDelete: () => void;
}) {
	const isAdmin = user.role === "admin";
	const initials = (user.name?.trim() || user.email).slice(0, 2).toUpperCase();
	return (
		<div className="grid grid-cols-[36px_1fr_auto] items-center gap-3.5 border-t px-5 py-3.5">
			<InitialsAvatar
				className="size-9 text-[11px]"
				color={2}
				initials={initials}
			/>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<span className="truncate font-medium text-[14px]">{user.email}</span>
					{isAdmin ? <Badge variant="primary">admin</Badge> : null}
					{user.banned ? <Badge variant="destructive">banned</Badge> : null}
					{isSelf ? <Badge variant="outline">you</Badge> : null}
				</div>
				<div className="mt-0.5 font-mono text-[12px] text-muted-foreground">
					joined {joinedLabel(user.createdAt)}
				</div>
			</div>
			<div className="flex gap-2">
				{isSelf ? (
					<span className="font-mono text-muted-foreground/70 text-xs">
						current admin
					</span>
				) : (
					<UserActions
						banned={Boolean(user.banned)}
						confirmingDelete={confirmingDelete}
						onBan={onBan}
						onDelete={onDelete}
						onUnban={onUnban}
						pending={pending}
					/>
				)}
			</div>
		</div>
	);
}

function UsersTab() {
	const { session } = useSessionState();
	const meId = session?.user?.id;
	const [pendingId, setPendingId] = useState<null | string>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<null | string>(null);

	const { data, error, isPending, refetch } = useQuery({
		queryFn: async () => {
			const result = await authClient.admin.listUsers({
				query: { limit: 200, sortBy: "createdAt", sortDirection: "desc" },
			});
			if (result.error) {
				throw new Error(result.error.message ?? "Failed to load users.");
			}
			return (result.data?.users ?? []) as AdminUser[];
		},
		queryKey: ["admin", "users"],
	});

	const run = async (
		id: string,
		action: () => Promise<{ error?: { message?: string } | null }>,
		successMessage: string
	) => {
		setPendingId(id);
		try {
			const result = await action();
			if (result.error) {
				toast.error(result.error.message ?? "Action failed.");
				return;
			}
			toast.success(successMessage);
			await refetch();
		} catch {
			toast.error("Network error — try again.");
		} finally {
			setPendingId(null);
			setConfirmDeleteId(null);
		}
	};

	const onDeleteClick = (user: AdminUser) => {
		if (confirmDeleteId === user.id) {
			run(
				user.id,
				() => authClient.admin.removeUser({ userId: user.id }),
				`Deleted ${user.email}.`
			);
		} else {
			setConfirmDeleteId(user.id);
		}
	};

	if (isPending) {
		return (
			<Card className="p-12 text-center text-muted-foreground text-sm">
				Loading users…
			</Card>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertDescription>{(error as Error).message}</AlertDescription>
			</Alert>
		);
	}

	const users = data ?? [];

	return (
		<Card className="gap-0 py-0">
			<div className="border-b px-5 py-4">
				<div className="font-medium text-[16px]">
					Users · {users.length.toLocaleString()}
				</div>
				<div className="mt-0.5 text-[13px] text-muted-foreground">
					Everyone who has signed in. Ban blocks sign-in; delete removes the
					account entirely.
				</div>
			</div>
			{users.length === 0 ? (
				<Empty className="p-12">
					<EmptyDescription>No users have signed in yet.</EmptyDescription>
				</Empty>
			) : (
				users.map((user) => (
					<UserRow
						confirmingDelete={confirmDeleteId === user.id}
						isSelf={user.id === meId}
						key={user.id}
						onBan={() =>
							run(
								user.id,
								() => authClient.admin.banUser({ userId: user.id }),
								`Banned ${user.email}.`
							)
						}
						onDelete={() => onDeleteClick(user)}
						onUnban={() =>
							run(
								user.id,
								() => authClient.admin.unbanUser({ userId: user.id }),
								`Unbanned ${user.email}.`
							)
						}
						pending={pendingId === user.id}
						user={user}
					/>
				))
			)}
		</Card>
	);
}
