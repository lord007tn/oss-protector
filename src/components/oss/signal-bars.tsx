import { Progress } from "@/components/ui/progress";
import { signalFillClass } from "@/lib/oss";

export type SignalKey =
	| "accountAge"
	| "prVolume"
	| "diffSignature"
	| "crossRepoOverlap"
	| "bioPattern"
	| "commitVoice";

export const SIGNAL_LABELS: Record<SignalKey, string> = {
	accountAge: "Account age",
	bioPattern: "Bio / handle pattern",
	commitVoice: "Commit-message voice",
	crossRepoOverlap: "Cross-repo overlap",
	diffSignature: "Diff signature",
	prVolume: "PR volume",
};

export const SIGNAL_ORDER: SignalKey[] = [
	"accountAge",
	"prVolume",
	"diffSignature",
	"crossRepoOverlap",
	"bioPattern",
	"commitVoice",
];

export function SignalBars({
	signals,
}: {
	signals: Record<SignalKey, number>;
}) {
	return (
		<div>
			{SIGNAL_ORDER.map((key) => {
				const value = signals[key] ?? 0;
				const pct = Math.round(value * 100);
				return (
					<div
						className="grid grid-cols-[150px_1fr_52px] items-center gap-3.5 border-border border-b py-2.5 text-sm last:border-0"
						key={key}
					>
						<div className="text-muted-foreground">{SIGNAL_LABELS[key]}</div>
						<Progress
							indicatorClassName={signalFillClass(value)}
							trackClassName="h-2"
							value={pct}
						/>
						<div className="text-right font-mono text-foreground tabular-nums">
							{pct}%
						</div>
					</div>
				);
			})}
		</div>
	);
}
