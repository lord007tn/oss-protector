import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { avatarColorClass } from "@/lib/oss";
import { cn } from "@/lib/utils";

// Initials-only avatar built on the Avatar primitive. The caller's `className`
// carries both the circle size and the initials text size, so it is applied to
// the root (for sizing) and to the fallback (for the text size) — `size-full`
// is reasserted last on the fallback so it always fills the root.
export function InitialsAvatar({
	initials,
	color = 1,
	className,
}: {
	initials: string;
	color?: number;
	className?: string;
}) {
	return (
		<Avatar className={className}>
			<AvatarFallback
				className={cn(
					className,
					"size-full font-mono font-semibold",
					avatarColorClass(color)
				)}
			>
				{initials}
			</AvatarFallback>
		</Avatar>
	);
}
