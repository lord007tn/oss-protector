import { InitialsAvatar } from "@/components/oss/initials-avatar";
import { buttonVariants } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";

export interface LiveFeedItem {
	avatarUrl: null | string;
	login: string;
	reason: string;
	score: number;
}

const avatarColor = (login: string) => ((login.charCodeAt(0) || 0) % 6) + 1;
const initials = (login: string) => login.slice(0, 2).toUpperCase();

export function LiveFeed({
	items,
	height = 460,
}: {
	height?: number;
	items: LiveFeedItem[];
}) {
	return (
		<div className="overflow-hidden rounded-2xl border bg-card shadow-pop">
			<div className="flex items-center justify-between border-b px-3.5 py-3 font-mono text-muted-foreground text-xs">
				<div className="flex items-center gap-2">
					<span className="pulse-ring inline-block size-1.5 rounded-full bg-success" />
					<b className="font-medium text-foreground">Live feed</b>
					<span className="text-muted-foreground/60">·</span>
					<span>public review queue</span>
				</div>
				<a
					className={buttonVariants({ size: "xs", variant: "link" })}
					href="/feed"
				>
					view all
				</a>
			</div>
			<div className="overflow-hidden p-1.5" style={{ maxHeight: height }}>
				{items.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>No recent flags yet.</EmptyTitle>
							<EmptyDescription>
								Install the app to start protecting your repos.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					items.map((item) => (
						<a
							className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted"
							href={`/accounts/${item.login}`}
							key={item.login}
						>
							<InitialsAvatar
								className="size-8 text-[11px]"
								color={avatarColor(item.login)}
								initials={initials(item.login)}
							/>
							<div className="min-w-0 flex-1">
								<span className="font-medium text-foreground">
									@{item.login}
								</span>
								<div className="mt-0.5 truncate text-muted-foreground text-xs">
									{item.reason}
								</div>
							</div>
							<span className="shrink-0 font-mono text-muted-foreground/70 text-xs tabular-nums">
								{item.score}
							</span>
						</a>
					))
				)}
			</div>
		</div>
	);
}
