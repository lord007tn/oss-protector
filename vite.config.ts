import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig(({ mode }) => ({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
		tsconfigPaths: true,
	},
	plugins: [
		mode === "development" ? devtools() : null,
		tailwindcss(),
		nitro({
			compatibilityDate: "2026-05-14",
			preset: "cloudflare_module",
			cloudflare: {
				deployConfig: true,
				nodeCompat: true,
			},
		}),
		tanstackStart({
			start: {
				entry: "./src/server.ts",
			},
		}),
		viteReact(),
	],
}));

export default config;
