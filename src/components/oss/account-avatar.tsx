import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarInitials } from "@/lib/directory-view";
import { avatarColorClass } from "@/lib/oss";
import { cn } from "@/lib/utils";

function colorFromLogin(login: string): number {
	let hash = 0;
	for (let index = 0; index < login.length; index += 1) {
		hash = (hash * 31 + login.charCodeAt(index)) % 1_000_003;
	}
	return (hash % 6) + 1;
}

export function AccountAvatar({
	login,
	avatarUrl,
	className,
}: {
	login: string;
	avatarUrl?: string | null;
	className?: string;
}) {
	return (
		<Avatar className={className}>
			{avatarUrl ? <AvatarImage alt={login} src={avatarUrl} /> : null}
			<AvatarFallback
				className={cn(
					"font-mono font-semibold",
					avatarColorClass(colorFromLogin(login))
				)}
			>
				{avatarInitials(login)}
			</AvatarFallback>
		</Avatar>
	);
}
