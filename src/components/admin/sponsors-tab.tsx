import { useQuery } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	SPONSOR_STATUS_LABELS,
	SPONSOR_STATUSES,
	SPONSOR_TIER_LABELS,
	SPONSOR_TIERS,
	type SponsorStatus,
	type SponsorTier,
	sponsorTierLabel,
} from "@/constants/sponsor-tiers";
import type { SponsorRecord } from "@/data-access/sponsors";
import {
	adminCreateSponsorFn,
	adminDeleteSponsorFn,
	adminListSponsorsFn,
	adminUpdateSponsorFn,
} from "@/functions/sponsors";

interface FormState {
	description: string;
	logoUrl: string;
	name: string;
	sortOrder: string;
	status: SponsorStatus;
	tier: SponsorTier;
	url: string;
}

function toFormState(sponsor: SponsorRecord | null): FormState {
	return {
		description: sponsor?.description ?? "",
		logoUrl: sponsor?.logoUrl ?? "",
		name: sponsor?.name ?? "",
		sortOrder: String(sponsor?.sortOrder ?? 0),
		status: (sponsor?.status as SponsorStatus) ?? "active",
		tier: (sponsor?.tier as SponsorTier) ?? "supporter",
		url: sponsor?.url ?? "",
	};
}

function Field({
	children,
	htmlFor,
	label,
}: {
	children: ReactNode;
	htmlFor?: string;
	label: string;
}) {
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
		</div>
	);
}

function SponsorLogo({
	logoUrl,
	name,
}: {
	logoUrl: null | string;
	name: string;
}) {
	if (logoUrl) {
		return (
			<img
				alt={`${name} logo`}
				className="size-9 shrink-0 rounded-md object-contain"
				height={36}
				src={logoUrl}
				width={36}
			/>
		);
	}
	return (
		<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted font-medium text-muted-foreground text-xs">
			{name.slice(0, 2).toUpperCase()}
		</div>
	);
}

function SponsorEditor({
	onCancel,
	onSaved,
	sponsor,
}: {
	onCancel: () => void;
	onSaved: () => void;
	sponsor: SponsorRecord | null;
}) {
	const [form, setForm] = useState<FormState>(() => toFormState(sponsor));
	const [saving, setSaving] = useState(false);
	const isEdit = sponsor !== null;

	const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
		setForm((prev) => ({ ...prev, [key]: value }));

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const payload = {
			description: form.description.trim(),
			logoUrl: form.logoUrl.trim(),
			name: form.name.trim(),
			sortOrder: Number(form.sortOrder) || 0,
			status: form.status,
			tier: form.tier,
			url: form.url.trim(),
		};
		if (!(payload.name && payload.url)) {
			toast.error("Name and website URL are required.");
			return;
		}
		setSaving(true);
		try {
			if (isEdit) {
				await adminUpdateSponsorFn({ data: { ...payload, id: sponsor.id } });
				toast.success("Sponsor updated.");
			} else {
				await adminCreateSponsorFn({ data: payload });
				toast.success("Sponsor added.");
			}
			onSaved();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save sponsor."
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Card className="mb-4 gap-0 p-5">
			<form className="grid gap-4" onSubmit={handleSubmit}>
				<div className="font-medium text-[15px]">
					{isEdit ? "Edit sponsor" : "New sponsor"}
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field htmlFor="sponsor-name" label="Name">
						<Input
							id="sponsor-name"
							onChange={(event) => update("name", event.target.value)}
							placeholder="Acme Inc."
							value={form.name}
						/>
					</Field>
					<Field htmlFor="sponsor-url" label="Website URL">
						<Input
							id="sponsor-url"
							onChange={(event) => update("url", event.target.value)}
							placeholder="https://acme.com"
							type="url"
							value={form.url}
						/>
					</Field>
					<Field htmlFor="sponsor-logo" label="Logo URL (optional)">
						<Input
							id="sponsor-logo"
							onChange={(event) => update("logoUrl", event.target.value)}
							placeholder="https://acme.com/logo.svg"
							value={form.logoUrl}
						/>
					</Field>
					<Field htmlFor="sponsor-order" label="Sort order">
						<Input
							id="sponsor-order"
							inputMode="numeric"
							onChange={(event) => update("sortOrder", event.target.value)}
							value={form.sortOrder}
						/>
					</Field>
					<Field label="Tier">
						<Select
							onValueChange={(value) => update("tier", value as SponsorTier)}
							value={form.tier}
						>
							<SelectTrigger className="w-full">
								<SelectValue>{SPONSOR_TIER_LABELS[form.tier]}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{SPONSOR_TIERS.map((tier) => (
									<SelectItem key={tier} value={tier}>
										{SPONSOR_TIER_LABELS[tier]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field label="Status">
						<Select
							onValueChange={(value) =>
								update("status", value as SponsorStatus)
							}
							value={form.status}
						>
							<SelectTrigger className="w-full">
								<SelectValue>{SPONSOR_STATUS_LABELS[form.status]}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{SPONSOR_STATUSES.map((status) => (
									<SelectItem key={status} value={status}>
										{SPONSOR_STATUS_LABELS[status]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
				</div>
				<Field htmlFor="sponsor-description" label="Description (optional)">
					<Textarea
						id="sponsor-description"
						onChange={(event) => update("description", event.target.value)}
						placeholder="One line on who they are."
						value={form.description}
					/>
				</Field>
				<div className="flex justify-end gap-2">
					<Button onClick={onCancel} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={saving} type="submit">
						{saving ? <Loader2 className="animate-spin" /> : null}
						{isEdit ? "Save changes" : "Add sponsor"}
					</Button>
				</div>
			</form>
		</Card>
	);
}

function SponsorRow({
	confirmingDelete,
	onDelete,
	onEdit,
	pending,
	sponsor,
}: {
	confirmingDelete: boolean;
	onDelete: () => void;
	onEdit: () => void;
	pending: boolean;
	sponsor: SponsorRecord;
}) {
	return (
		<div className="grid grid-cols-[1fr_auto] items-center gap-3.5 border-t px-5 py-3.5">
			<div className="flex min-w-0 items-center gap-3">
				<SponsorLogo logoUrl={sponsor.logoUrl} name={sponsor.name} />
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="truncate font-medium text-[14px]">
							{sponsor.name}
						</span>
						<Badge
							variant={sponsor.tier === "supporter" ? "outline" : "primary"}
						>
							{sponsorTierLabel(sponsor.tier)}
						</Badge>
						{sponsor.status === "inactive" ? (
							<Badge variant="secondary">hidden</Badge>
						) : null}
					</div>
					<a
						className="mt-0.5 block truncate font-mono text-[12px] text-muted-foreground hover:text-foreground"
						href={sponsor.url}
						rel="noopener noreferrer"
						target="_blank"
					>
						{sponsor.url}
					</a>
				</div>
			</div>
			<div className="flex gap-2">
				<Button onClick={onEdit} size="sm" type="button" variant="ghost">
					<Pencil />
					Edit
				</Button>
				<Button
					disabled={pending}
					onClick={onDelete}
					size="sm"
					type="button"
					variant={confirmingDelete ? "destructive" : "ghost"}
				>
					{pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
					{confirmingDelete ? "Confirm" : "Delete"}
				</Button>
			</div>
		</div>
	);
}

export function SponsorsTab() {
	const [editing, setEditing] = useState<SponsorRecord | "new" | null>(null);
	const [pendingId, setPendingId] = useState<null | string>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<null | string>(null);

	const { data, error, isPending, refetch } = useQuery({
		queryFn: () => adminListSponsorsFn(),
		queryKey: ["admin", "sponsors"],
	});

	const handleSaved = async () => {
		setEditing(null);
		await refetch();
	};

	const handleDelete = async (sponsor: SponsorRecord) => {
		if (confirmDeleteId !== sponsor.id) {
			setConfirmDeleteId(sponsor.id);
			return;
		}
		setPendingId(sponsor.id);
		try {
			await adminDeleteSponsorFn({ data: { id: sponsor.id } });
			toast.success(`Removed ${sponsor.name}.`);
			await refetch();
		} catch {
			toast.error("Could not delete sponsor.");
		} finally {
			setPendingId(null);
			setConfirmDeleteId(null);
		}
	};

	if (isPending) {
		return (
			<Card className="p-12 text-center text-muted-foreground text-sm">
				Loading sponsors…
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

	const sponsors = data ?? [];

	return (
		<div>
			<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="font-medium text-[16px]">
						Sponsors · {sponsors.length.toLocaleString()}
					</div>
					<div className="mt-0.5 text-[13px] text-muted-foreground">
						Manage who appears on the public sponsors page. Only active sponsors
						are shown publicly.
					</div>
				</div>
				{editing === null ? (
					<Button onClick={() => setEditing("new")} size="sm" type="button">
						<Plus />
						Add sponsor
					</Button>
				) : null}
			</div>

			{editing === null ? null : (
				<SponsorEditor
					onCancel={() => setEditing(null)}
					onSaved={handleSaved}
					sponsor={editing === "new" ? null : editing}
				/>
			)}

			<Card className="gap-0 py-0">
				{sponsors.length === 0 ? (
					<Empty className="p-12">
						<EmptyDescription>
							No sponsors yet. Add one to publish it on the sponsors page.
						</EmptyDescription>
					</Empty>
				) : (
					sponsors.map((sponsor) => (
						<SponsorRow
							confirmingDelete={confirmDeleteId === sponsor.id}
							key={sponsor.id}
							onDelete={() => handleDelete(sponsor)}
							onEdit={() => setEditing(sponsor)}
							pending={pendingId === sponsor.id}
							sponsor={sponsor}
						/>
					))
				)}
			</Card>
		</div>
	);
}
