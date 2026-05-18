import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { type ReactNode, useState } from "react";

export function RootProvider({ children }: { children: ReactNode }) {
	const showDevtools =
		import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEVTOOLS === "true";
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						refetchOnWindowFocus: false,
						retry: 1,
					},
				},
			})
	);

	return (
		<QueryClientProvider client={queryClient}>
			{children}
			{showDevtools ? (
				<ReactQueryDevtools buttonPosition="bottom-left" />
			) : null}
		</QueryClientProvider>
	);
}
