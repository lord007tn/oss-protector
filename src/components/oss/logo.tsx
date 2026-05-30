import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
	return (
		<a
			aria-label="OSS Protector home"
			className={cn("flex items-center gap-2.5", className)}
			href="/"
		>
			<img
				alt=""
				className="size-6"
				height={24}
				src="/oss-protector-mark.svg"
				width={22}
			/>
			<span className="font-semibold text-[14.5px] tracking-tight">
				OSS<span className="text-primary">·</span>Protector
			</span>
		</a>
	);
}
