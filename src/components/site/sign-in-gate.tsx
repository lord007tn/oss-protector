import { useRouterState } from "@tanstack/react-router";

import { LoginForm } from "@/components/site/login-form";

export function SignInGate() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	return (
		<div className="flex min-h-[70vh] items-center justify-center px-6 py-16">
			<LoginForm callbackURL={pathname} />
		</div>
	);
}
