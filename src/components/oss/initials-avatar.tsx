import { avatarColorClass } from "@/lib/oss";
import { cn } from "@/lib/utils";

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
		<div
			className={cn(
				"flex shrink-0 items-center justify-center rounded-full font-mono font-semibold",
				avatarColorClass(color),
				className
			)}
		>
			{initials}
		</div>
	);
}
