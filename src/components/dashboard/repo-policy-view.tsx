import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxCard } from "@/components/ui/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { DashboardRepo } from "@/data-access/maintainer-dashboard";
import { cn } from "@/lib/utils";

interface RepoPolicyResponse {
	dbPolicy: {
		analyzePrivateRepositories?: boolean;
		enabled?: boolean;
		ignoredPaths?: string[];
		minimumLikelyAbuseConfidence?: number;
		trustedAuthors?: string[];
	};
	updatedAt: null | number;
	updatedByLogin: null | string;
}

interface PolicyFormState {
	analyzePrivateRepositories: boolean;
	enabled: boolean;
	ignoredPaths: string[];
	minimumLikelyAbuseConfidence: number;
	trustedAuthors: string[];
}

interface PolicyMeta {
	hasDbRow: boolean;
	updatedAt: null | number;
	updatedByLogin: null | string;
}

interface PolicyServerState {
	meta: PolicyMeta;
	serverState: PolicyFormState;
}

const DEFAULTS: PolicyFormState = {
	analyzePrivateRepositories: false,
	enabled: true,
	ignoredPaths: [],
	minimumLikelyAbuseConfidence: 70,
	trustedAuthors: [],
};

const EMPTY_META: PolicyMeta = {
	hasDbRow: false,
	updatedAt: null,
	updatedByLogin: null,
};

const MIN_CONFIDENCE = 65;
const MAX_CONFIDENCE = 95;

const toFormState = (
	policy: RepoPolicyResponse["dbPolicy"]
): PolicyFormState => ({
	analyzePrivateRepositories:
		policy.analyzePrivateRepositories ?? DEFAULTS.analyzePrivateRepositories,
	enabled: policy.enabled ?? DEFAULTS.enabled,
	ignoredPaths: policy.ignoredPaths ?? DEFAULTS.ignoredPaths,
	minimumLikelyAbuseConfidence:
		policy.minimumLikelyAbuseConfidence ??
		DEFAULTS.minimumLikelyAbuseConfidence,
	trustedAuthors: policy.trustedAuthors ?? DEFAULTS.trustedAuthors,
});

const toServerState = (policy: RepoPolicyResponse): PolicyServerState => ({
	meta: {
		hasDbRow: Object.keys(policy.dbPolicy).length > 0,
		updatedAt: policy.updatedAt,
		updatedByLogin: policy.updatedByLogin,
	},
	serverState: toFormState(policy.dbPolicy),
});

const formStatesEqual = (a: PolicyFormState, b: PolicyFormState): boolean =>
	a.enabled === b.enabled &&
	a.analyzePrivateRepositories === b.analyzePrivateRepositories &&
	a.minimumLikelyAbuseConfidence === b.minimumLikelyAbuseConfidence &&
	a.trustedAuthors.length === b.trustedAuthors.length &&
	a.trustedAuthors.every((value, idx) => value === b.trustedAuthors[idx]) &&
	a.ignoredPaths.length === b.ignoredPaths.length &&
	a.ignoredPaths.every((value, idx) => value === b.ignoredPaths[idx]);

const repoPolicyKey = (repositoryId: string) =>
	["repo-policy", repositoryId] as const;

export function RepoPolicyView({ repos }: { repos: DashboardRepo[] }) {
	const [repositoryId, setRepositoryId] = useState(repos[0]?.id ?? "");
	const policyQuery = useQuery({
		enabled: Boolean(repositoryId),
		queryFn: async (): Promise<PolicyServerState> => {
			const response = await fetch(
				`/api/maintainer/repo-policy?repositoryId=${encodeURIComponent(repositoryId)}`
			);
			if (!response.ok) {
				throw new Error("Couldn't load policy for this repo.");
			}
			const data = (await response.json()) as { policy: RepoPolicyResponse };
			return toServerState(data.policy);
		},
		queryKey: repoPolicyKey(repositoryId),
	});

	if (repos.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>No repositories yet</EmptyTitle>
					<EmptyDescription>
						Install OSS Protector on a repo before editing policy from the
						dashboard.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-2xl border bg-card p-6">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="font-medium text-[16px]">Repo policy</div>
						<div className="mt-0.5 text-[13px] text-muted-foreground">
							Per-repo behavior settings normally controlled by{" "}
							<code className="font-mono text-[11.5px]">
								.github/oss-protector.json
							</code>
							. Edits here apply when no file is committed; a committed file
							always wins on a field-by-field basis.
						</div>
					</div>
					<div className="flex items-center gap-2">
						{policyQuery.data?.meta.hasDbRow ? (
							<Badge variant="info">Editing dashboard values</Badge>
						) : (
							<Badge variant="secondary">Using defaults</Badge>
						)}
					</div>
				</div>

				<div className="mt-4 grid gap-1.5">
					<label className="font-medium text-[12.5px]" htmlFor="policy-repo">
						Repository
					</label>
					<Select
						id="policy-repo"
						onValueChange={(value) => setRepositoryId(value ?? "")}
						value={repositoryId}
					>
						<SelectTrigger className="w-full max-w-md">
							<SelectValue>
								{(value) => {
									const repo = repos.find((entry) => entry.id === value);
									if (!repo) {
										return null;
									}
									return `${repo.fullName} ${repo.isPrivate ? "(private)" : ""}`;
								}}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{repos.map((repo) => (
								<SelectItem key={repo.id} value={repo.id}>
									{repo.fullName} {repo.isPrivate ? "(private)" : ""}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{policyQuery.isPending || !policyQuery.data ? (
					<div className="mt-6 flex items-center gap-2 text-muted-foreground text-sm">
						<Loader2 className="size-4 animate-spin" />
						{policyQuery.isError
							? "Couldn't load policy for this repo."
							: "Loading policy…"}
					</div>
				) : (
					<PolicyEditor
						initial={policyQuery.data}
						key={repositoryId}
						repositoryId={repositoryId}
					/>
				)}
			</div>

			<Alert variant="info">
				<AlertDescription>
					<b className="text-foreground">Heads up:</b> if your repo has a
					committed{" "}
					<code className="font-mono text-[11.5px]">
						.github/oss-protector.json
					</code>
					, each field present in the file overrides the corresponding value
					here. Remove a field from the file (or remove the file entirely) for
					dashboard values to take effect on that field.
				</AlertDescription>
			</Alert>
		</div>
	);
}

function PolicyEditor({
	initial,
	repositoryId,
}: {
	initial: PolicyServerState;
	repositoryId: string;
}) {
	const queryClient = useQueryClient();
	const [formState, setFormState] = useState<PolicyFormState>(
		initial.serverState
	);
	const [trustedInput, setTrustedInput] = useState("");
	const [ignoredInput, setIgnoredInput] = useState("");
	const [saving, setSaving] = useState(false);
	const [clearing, setClearing] = useState(false);

	const { meta, serverState } = initial;
	const dirty = !formStatesEqual(formState, serverState);

	const cacheServerState = (next: PolicyServerState) => {
		queryClient.setQueryData(repoPolicyKey(repositoryId), next);
	};

	const save = async () => {
		setSaving(true);
		try {
			const response = await fetch("/api/maintainer/repo-policy", {
				body: JSON.stringify({ policy: formState, repositoryId }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json()) as {
				error?: string;
				policy?: RepoPolicyResponse;
			};
			if (!(response.ok && data.policy)) {
				toast.error(data.error ?? "Couldn't save the policy.");
				return;
			}
			const next = toServerState(data.policy);
			cacheServerState(next);
			setFormState(next.serverState);
			toast.success("Repo policy saved.");
		} finally {
			setSaving(false);
		}
	};

	const clear = async () => {
		setClearing(true);
		try {
			const response = await fetch("/api/maintainer/repo-policy", {
				body: JSON.stringify({ repositoryId }),
				headers: { "Content-Type": "application/json" },
				method: "DELETE",
			});
			const data = (await response.json()) as {
				error?: string;
				policy?: RepoPolicyResponse;
			};
			if (!(response.ok && data.policy)) {
				toast.error(data.error ?? "Couldn't clear the policy.");
				return;
			}
			cacheServerState({ meta: EMPTY_META, serverState: DEFAULTS });
			setFormState(DEFAULTS);
			toast.success("Repo policy cleared — falling back to defaults.");
		} finally {
			setClearing(false);
		}
	};

	const reset = () => setFormState(serverState);

	const addTrusted = () => {
		const value = trustedInput.trim().toLowerCase();
		if (!value) {
			return;
		}
		if (formState.trustedAuthors.includes(value)) {
			setTrustedInput("");
			return;
		}
		setFormState((current) => ({
			...current,
			trustedAuthors: [...current.trustedAuthors, value],
		}));
		setTrustedInput("");
	};

	const removeTrusted = (value: string) => {
		setFormState((current) => ({
			...current,
			trustedAuthors: current.trustedAuthors.filter((entry) => entry !== value),
		}));
	};

	const addIgnored = () => {
		const value = ignoredInput.trim();
		if (!value) {
			return;
		}
		if (formState.ignoredPaths.includes(value)) {
			setIgnoredInput("");
			return;
		}
		setFormState((current) => ({
			...current,
			ignoredPaths: [...current.ignoredPaths, value],
		}));
		setIgnoredInput("");
	};

	const removeIgnored = (value: string) => {
		setFormState((current) => ({
			...current,
			ignoredPaths: current.ignoredPaths.filter((entry) => entry !== value),
		}));
	};

	return (
		<>
			<div className="mt-6 grid gap-4 md:grid-cols-2">
				<BooleanCard
					description="When off, OSS Protector still tracks PRs but skips automatic abuse review."
					label="Enabled"
					onChange={(value) =>
						setFormState((current) => ({ ...current, enabled: value }))
					}
					value={formState.enabled}
				/>
				<BooleanCard
					description="Opt private repos into AI review. Off means private-repo PRs are tracked but not scored by OpenRouter."
					label="Analyze private repositories"
					onChange={(value) =>
						setFormState((current) => ({
							...current,
							analyzePrivateRepositories: value,
						}))
					}
					value={formState.analyzePrivateRepositories}
				/>
			</div>

			<div className="mt-4 rounded-xl border bg-background p-4">
				<div className="flex items-center justify-between">
					<div>
						<div className="font-medium text-[13.5px]">
							Likely-abuse confidence threshold
						</div>
						<div className="mt-0.5 text-[12px] text-muted-foreground">
							Below this confidence, "likely abuse" downgrades to
							"review-needed". Clamped to {MIN_CONFIDENCE}–{MAX_CONFIDENCE}.
						</div>
					</div>
					<span className="font-mono text-foreground text-sm tabular-nums">
						{formState.minimumLikelyAbuseConfidence}
					</span>
				</div>
				<input
					className="mt-3 w-full"
					max={MAX_CONFIDENCE}
					min={MIN_CONFIDENCE}
					onChange={(event) =>
						setFormState((current) => ({
							...current,
							minimumLikelyAbuseConfidence: Number(event.target.value),
						}))
					}
					step={1}
					type="range"
					value={formState.minimumLikelyAbuseConfidence}
				/>
			</div>

			<TagsInput
				addLabel="Add author"
				description="Skip automatic review for these GitHub logins. Useful for known automation accounts (e.g. dependabot[bot])."
				empty="No trusted authors. Bot accounts and your own helpers go here."
				inputValue={trustedInput}
				label="Trusted authors"
				onAdd={addTrusted}
				onChangeInput={setTrustedInput}
				onRemove={removeTrusted}
				placeholder="dependabot[bot]"
				values={formState.trustedAuthors}
			/>

			<TagsInput
				addLabel="Add path"
				description="Skip review when every changed file matches one of these prefixes."
				empty="No ignored paths. Add prefixes like docs/ or examples/ if you trust those areas."
				inputValue={ignoredInput}
				label="Ignored paths"
				onAdd={addIgnored}
				onChangeInput={setIgnoredInput}
				onRemove={removeIgnored}
				placeholder="docs/"
				values={formState.ignoredPaths}
			/>

			<div className="mt-5 flex flex-wrap items-center gap-2">
				<Button disabled={!dirty || saving} onClick={save} type="button">
					{saving ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<Check className="size-3.5" />
					)}
					Save
				</Button>
				<Button disabled={!dirty} onClick={reset} type="button" variant="ghost">
					<RotateCcw className="size-3.5" />
					Reset to saved
				</Button>
				<Button
					disabled={!meta.hasDbRow || clearing}
					onClick={clear}
					type="button"
					variant="ghost"
				>
					{clearing ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<Trash2 className="size-3.5" />
					)}
					Clear policy
				</Button>
				{meta.updatedAt && meta.updatedByLogin ? (
					<span className="ml-auto font-mono text-muted-foreground text-xs">
						Last edited by @{meta.updatedByLogin}
					</span>
				) : null}
			</div>
		</>
	);
}

function BooleanCard({
	description,
	label,
	onChange,
	value,
}: {
	description: string;
	label: string;
	onChange: (value: boolean) => void;
	value: boolean;
}) {
	return (
		<CheckboxCard
			checked={value}
			className="grid grid-cols-[1fr_auto] items-center"
			onCheckedChange={onChange}
		>
			<div>
				<div className="font-medium text-[13.5px]">{label}</div>
				<div className="mt-0.5 text-[12px] text-muted-foreground">
					{description}
				</div>
			</div>
			<span
				className={cn(
					"flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
					value
						? "border-primary bg-primary text-primary-foreground"
						: "border-border bg-background text-muted-foreground"
				)}
			>
				{value ? <Check className="size-3" /> : <X className="size-3" />}
			</span>
		</CheckboxCard>
	);
}

function TagsInput({
	addLabel,
	description,
	empty,
	inputValue,
	label,
	onAdd,
	onChangeInput,
	onRemove,
	placeholder,
	values,
}: {
	addLabel: string;
	description: string;
	empty: string;
	inputValue: string;
	label: string;
	onAdd: () => void;
	onChangeInput: (value: string) => void;
	onRemove: (value: string) => void;
	placeholder: string;
	values: string[];
}) {
	return (
		<div className="mt-4 rounded-xl border bg-background p-4">
			<div className="font-medium text-[13.5px]">{label}</div>
			<div className="mt-0.5 text-[12px] text-muted-foreground">
				{description}
			</div>
			<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
				<Input
					onChange={(event) => onChangeInput(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							onAdd();
						}
					}}
					placeholder={placeholder}
					value={inputValue}
				/>
				<Button
					disabled={!inputValue.trim()}
					onClick={onAdd}
					size="sm"
					type="button"
					variant="outline"
				>
					{addLabel}
				</Button>
			</div>
			<div className="mt-3 flex flex-wrap gap-1.5">
				{values.length === 0 ? (
					<span className="text-muted-foreground text-xs">{empty}</span>
				) : (
					values.map((value) => (
						<Badge key={value} size="tag" variant="outline">
							{value}
							<Button
								aria-label={`Remove ${value}`}
								onClick={() => onRemove(value)}
								size="icon-xs"
								type="button"
								variant="ghost"
							>
								<X />
							</Button>
						</Badge>
					))
				)}
			</div>
		</div>
	);
}
