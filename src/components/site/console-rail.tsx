import { Shield } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { useSessionState } from "@/lib/use-session-state";

export function ConsoleRail({ label = "Console" }: { label?: string }) {
	const { session } = useSessionState();
	const who =
		session?.user?.name?.trim() ||
		session?.user?.email ||
		"signed-in maintainer";

	const signOut = async () => {
		await authClient.signOut();
		window.location.href = "/";
	};

	return (
		<div className="border-b bg-muted">
			<div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-2 px-4 py-2 font-mono text-muted-foreground text-xs md:px-8">
				<div className="flex items-center gap-2.5">
					<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium text-[10.5px] text-primary tracking-wide">
						<Shield className="size-2.5" />
						private
					</span>
					<span className="pulse-ring inline-block size-1.5 rounded-full bg-primary" />
					<span className="text-foreground">{label}</span>
					<span>·</span>
					<span className="max-w-[180px] truncate">{who}</span>
				</div>
				<div className="flex items-center gap-3.5">
					<a className="hover:text-foreground" href="/dashboard">
						Dashboard
					</a>
					<a className="hover:text-foreground" href="/settings">
						Settings
					</a>
					<button
						className="hover:text-foreground"
						onClick={signOut}
						type="button"
					>
						Sign out
					</button>
				</div>
			</div>
		</div>
	);
}
