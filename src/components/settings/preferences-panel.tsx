import { Check, Key, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type NotificationKind =
	| "correction"
	| "dispute"
	| "flag"
	| "info"
	| "ok"
	| "report";

interface PreferencesView {
	hasOpenrouterKey: boolean;
	notificationKinds: NotificationKind[];
	openrouterKeyPreview: null | string;
	updatedAt: null | number;
}

interface FreeModel {
	id: string;
	tier: string;
	url: string;
}

const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
	correction: "Maintainer corrections (confirm / dismiss / allow)",
	dispute: "Disputes filed against flagged accounts you protect",
	flag: "New flags on accounts active in your repos",
	info: "Product announcements",
	ok: "Resolutions when something is dismissed cleanly",
	report: "Reports filed in your repos",
};

const NOTIFICATION_KINDS: NotificationKind[] = [
	"report",
	"dispute",
	"flag",
	"correction",
	"ok",
	"info",
];

export function PreferencesPanel() {
	const [view, setView] = useState<null | PreferencesView>(null);
	const [loading, setLoading] = useState(true);
	const [kinds, setKinds] = useState<Set<NotificationKind>>(new Set());
	const [keyInput, setKeyInput] = useState("");
	const [keySaving, setKeySaving] = useState(false);
	const [keyTesting, setKeyTesting] = useState(false);
	const [kindsSaving, setKindsSaving] = useState(false);
	const [models, setModels] = useState<FreeModel[]>([]);

	useEffect(() => {
		const load = async () => {
			try {
				const [prefsResponse, modelsResponse] = await Promise.all([
					fetch("/api/user/preferences"),
					fetch("/api/openrouter/free-models"),
				]);
				if (prefsResponse.ok) {
					const data = (await prefsResponse.json()) as {
						preferences: PreferencesView;
					};
					setView(data.preferences);
					setKinds(new Set(data.preferences.notificationKinds));
				}
				if (modelsResponse.ok) {
					const data = (await modelsResponse.json()) as { models: FreeModel[] };
					setModels(data.models);
				}
			} finally {
				setLoading(false);
			}
		};
		load().catch(() => setLoading(false));
	}, []);

	const toggleKind = (kind: NotificationKind) => {
		setKinds((current) => {
			const next = new Set(current);
			if (next.has(kind)) {
				next.delete(kind);
			} else {
				next.add(kind);
			}
			return next;
		});
	};

	const saveNotificationKinds = async () => {
		setKindsSaving(true);
		try {
			const response = await fetch("/api/user/preferences", {
				body: JSON.stringify({ notificationKinds: [...kinds] }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json()) as {
				error?: string;
				preferences?: PreferencesView;
			};
			if (!response.ok) {
				toast.error(data.error ?? "Couldn't save notification preferences.");
				return;
			}
			if (data.preferences) {
				setView(data.preferences);
				setKinds(new Set(data.preferences.notificationKinds));
			}
			toast.success("Notification preferences saved.");
		} finally {
			setKindsSaving(false);
		}
	};

	const saveOpenRouterKey = async (newValue: null | string) => {
		setKeySaving(true);
		try {
			const response = await fetch("/api/user/preferences", {
				body: JSON.stringify({ openrouterApiKey: newValue }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json()) as {
				error?: string;
				preferences?: PreferencesView;
			};
			if (!response.ok) {
				toast.error(data.error ?? "Couldn't save the key.");
				return;
			}
			if (data.preferences) {
				setView(data.preferences);
				setKeyInput("");
			}
			toast.success(
				newValue ? "OpenRouter key saved." : "OpenRouter key removed."
			);
		} finally {
			setKeySaving(false);
		}
	};

	const testOpenRouterKey = async () => {
		const trimmed = keyInput.trim();
		if (!trimmed) {
			toast.error("Paste a key first.");
			return;
		}
		setKeyTesting(true);
		try {
			const response = await fetch("/api/openrouter/test", {
				body: JSON.stringify({ apiKey: trimmed }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json()) as { error?: string; ok?: boolean };
			if (response.ok && data.ok) {
				toast.success("Key works — OpenRouter accepted it.");
			} else {
				toast.error(data.error ?? "OpenRouter rejected this key.");
			}
		} finally {
			setKeyTesting(false);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center rounded-2xl border bg-card p-10 text-muted-foreground text-sm">
				<Loader2 className="mr-2 size-4 animate-spin" />
				Loading preferences…
			</div>
		);
	}

	if (!view) {
		return (
			<div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground text-sm">
				Preferences aren't available right now. Reload the page or try again
				later.
			</div>
		);
	}

	const dirty =
		[...kinds].sort().join(",") !==
		view.notificationKinds.slice().sort().join(",");

	return (
		<div className="flex flex-col gap-4">
			<section className="rounded-2xl border bg-card p-7">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h2 className="font-medium text-lg tracking-tight">
							Notifications
						</h2>
						<p className="mt-1 text-[13.5px] text-muted-foreground">
							Pick which in-app notifications you want to receive. Anything you
							turn off won't even be created — no badge, no inbox entry.
						</p>
					</div>
					<Button
						disabled={!dirty || kindsSaving}
						onClick={saveNotificationKinds}
						size="sm"
						type="button"
					>
						{kindsSaving ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							<Check className="size-3.5" />
						)}
						Save
					</Button>
				</div>
				<div className="mt-4 grid gap-2">
					{NOTIFICATION_KINDS.map((kind) => {
						const enabled = kinds.has(kind);
						return (
							<button
								className={cn(
									"flex items-start gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:border-input",
									enabled ? "border-primary/40 bg-primary/5" : "border-border"
								)}
								key={kind}
								onClick={() => toggleKind(kind)}
								type="button"
							>
								<span
									className={cn(
										"mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border-2",
										enabled
											? "border-primary bg-primary text-primary-foreground"
											: "border-border bg-background"
									)}
								>
									{enabled ? <Check className="size-3" /> : null}
								</span>
								<span>
									<span className="block font-medium text-[13.5px] capitalize">
										{kind}
									</span>
									<span className="mt-0.5 block text-[12.5px] text-muted-foreground">
										{NOTIFICATION_LABELS[kind]}
									</span>
								</span>
							</button>
						);
					})}
				</div>
			</section>

			<section className="rounded-2xl border bg-card p-7">
				<div className="flex items-start gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
						<Key className="size-5" />
					</div>
					<div>
						<h2 className="font-medium text-lg tracking-tight">
							OpenRouter (AI scoring)
						</h2>
						<p className="mt-1 text-[13.5px] text-muted-foreground">
							OSS Protector runs each suspicious PR through OpenRouter for a
							structured second opinion. By default we use a platform-provided
							key restricted to free-tier models. Bring your own key to unlock
							the full model catalog including paid fallback.
						</p>
					</div>
				</div>

				<div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
					<div
						className={cn(
							"rounded-2xl border p-5",
							view.hasOpenrouterKey
								? "border-border bg-background"
								: "border-primary/40 bg-primary/5"
						)}
					>
						<div className="flex items-center justify-between">
							<div className="font-medium text-[14px]">Platform key</div>
							{view.hasOpenrouterKey ? null : (
								<Badge variant="info">Active</Badge>
							)}
						</div>
						<p className="mt-1 text-[12.5px] text-muted-foreground">
							No cost to you. Limited to free models. If every free model
							rate-limits or errors, OSS Protector falls back to a deterministic
							scoring path — no paid call is made on your behalf.
						</p>
						<div className="mt-3 grid gap-1.5">
							<div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
								Free models in rotation
							</div>
							{models.length === 0 ? (
								<div className="text-muted-foreground text-xs">
									Model list unavailable.
								</div>
							) : (
								models.map((model) => (
									<a
										className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11.5px] hover:bg-muted"
										href={model.url}
										key={model.id}
										rel="noopener noreferrer"
										target="_blank"
									>
										<span className="size-1.5 rounded-full bg-success" />
										{model.id}
									</a>
								))
							)}
						</div>
					</div>

					<div
						className={cn(
							"rounded-2xl border p-5",
							view.hasOpenrouterKey
								? "border-primary/40 bg-primary/5"
								: "border-border bg-background"
						)}
					>
						<div className="flex items-center justify-between">
							<div className="font-medium text-[14px]">Your OpenRouter key</div>
							{view.hasOpenrouterKey ? (
								<Badge variant="info">Active</Badge>
							) : null}
						</div>
						<p className="mt-1 text-[12.5px] text-muted-foreground">
							Used for PR analysis on every repo you maintain. We encrypt the
							key at rest with AES-256-GCM keyed off the server secret. The
							plaintext key never leaves OpenRouter or your browser after you
							save it.
						</p>
						{view.hasOpenrouterKey && view.openrouterKeyPreview ? (
							<div className="mt-3 flex items-center gap-2">
								<span className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11.5px]">
									{view.openrouterKeyPreview}
								</span>
								<Button
									disabled={keySaving}
									onClick={() => saveOpenRouterKey(null)}
									size="sm"
									type="button"
									variant="ghost"
								>
									{keySaving ? (
										<Loader2 className="size-3 animate-spin" />
									) : (
										<Trash2 className="size-3" />
									)}
									Remove
								</Button>
							</div>
						) : null}

						<div className="mt-4 grid gap-2.5">
							<label
								className="font-medium text-[12.5px]"
								htmlFor="openrouter-key"
							>
								{view.hasOpenrouterKey ? "Replace key" : "Paste your key"}
							</label>
							<Input
								autoComplete="off"
								className="font-mono text-[12.5px]"
								id="openrouter-key"
								onChange={(event) => setKeyInput(event.target.value)}
								placeholder="sk-or-v1-..."
								type="password"
								value={keyInput}
							/>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									disabled={!keyInput.trim() || keyTesting}
									onClick={testOpenRouterKey}
									size="sm"
									type="button"
									variant="outline"
								>
									{keyTesting ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<RefreshCw className="size-3.5" />
									)}
									Test
								</Button>
								<Button
									disabled={!keyInput.trim() || keySaving}
									onClick={() => saveOpenRouterKey(keyInput.trim())}
									size="sm"
									type="button"
								>
									{keySaving ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<Check className="size-3.5" />
									)}
									{view.hasOpenrouterKey ? "Replace" : "Save"}
								</Button>
								<a
									className={cn(
										buttonVariants({ size: "sm", variant: "ghost" })
									)}
									href="https://openrouter.ai/keys"
									rel="noopener noreferrer"
									target="_blank"
								>
									Get a key
								</a>
							</div>
						</div>
					</div>
				</div>
				<div className="mt-4 flex items-start gap-2.5 rounded-xl border border-info/25 bg-info/10 p-3.5 text-[12.5px] text-muted-foreground leading-relaxed">
					<X className="mt-0.5 size-3.5 shrink-0 text-info" />
					<div>
						<b className="text-foreground">Heads up:</b> when you provide a key,
						OSS Protector uses it for AI scoring across every repo where you're
						a maintainer on this installation. If multiple maintainers set a
						key, the earliest-linked maintainer's key wins.
					</div>
				</div>
			</section>
		</div>
	);
}
