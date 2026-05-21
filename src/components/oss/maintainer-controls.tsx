import { useRouter } from "@tanstack/react-router";
import { Check, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSessionState } from "@/lib/use-session-state";

type Decision = "confirm" | "dismiss" | "allow" | "reset";

export function MaintainerControls({ login }: { login: string }) {
	const { signedIn } = useSessionState();
	const router = useRouter();
	const [pending, setPending] = useState<Decision | null>(null);

	if (!signedIn) {
		return null;
	}

	const apply = async (decision: Decision) => {
		setPending(decision);
		try {
			const response = await fetch("/api/maintainer/decision", {
				body: JSON.stringify({ decision, login }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json()) as {
				error?: string;
				status?: string | null;
			};
			if (!response.ok) {
				toast.error(data.error ?? "Action failed.");
				return;
			}
			toast.success(`@${login} → ${data.status ?? decision}.`);
			await router.invalidate();
		} catch {
			toast.error("Network error — try again.");
		} finally {
			setPending(null);
		}
	};

	const busy = pending !== null;

	return (
		<div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-6">
			<div className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.07em]">
				Maintainer controls
			</div>
			<p className="mb-3.5 text-[13.5px] text-muted-foreground leading-relaxed">
				Decisions write to the shared trust graph immediately and are recorded
				in the audit ledger. Reset undoes a prior allow.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button
					disabled={busy}
					onClick={() => apply("confirm")}
					size="sm"
					type="button"
					variant="success"
				>
					<Check />
					Confirm flag
				</Button>
				<Button
					disabled={busy}
					onClick={() => apply("dismiss")}
					size="sm"
					type="button"
					variant="outline"
				>
					<X />
					Dismiss
				</Button>
				<Button
					disabled={busy}
					onClick={() => apply("allow")}
					size="sm"
					type="button"
					variant="ghost"
				>
					<ShieldCheck />
					Allow author
				</Button>
				<Button
					disabled={busy}
					onClick={() => apply("reset")}
					size="sm"
					type="button"
					variant="ghost"
				>
					<RotateCcw />
					Reset
				</Button>
			</div>
		</div>
	);
}
