import { env, getAppUrl, runtimeEnv } from "@/env";

export interface GithubManifestConversion {
	html_url?: string;
	id: number;
	name?: string;
	owner?: {
		login?: string;
	};
	pem: string;
	slug: string;
	webhook_secret: string;
}

export const githubAppManifest = () => {
	const appUrl = getAppUrl();
	return {
		callback_urls: [`${appUrl}/install`],
		default_events: [
			"issue_comment",
			"pull_request",
			"pull_request_review_comment",
		],
		default_permissions: {
			contents: "read",
			issues: "write",
			pull_requests: "write",
		},
		description:
			"OSS Guard scores suspicious GitHub pull requests and maintainer bot reports for shared open-source defense.",
		hook_attributes: {
			active: true,
			url: `${appUrl}/api/github/webhook`,
		},
		name: runtimeEnv().APP_NAME ?? env.APP_NAME,
		public: true,
		redirect_url: `${appUrl}/install`,
		setup_on_update: true,
		setup_url: `${appUrl}/install`,
		url: appUrl,
	};
};

export const githubManifestCreateUrl = () => {
	const owner =
		runtimeEnv().GITHUB_APP_CREATE_OWNER ?? env.GITHUB_APP_CREATE_OWNER;
	if (!owner) {
		return "https://github.com/settings/apps/new?state=oss-guard";
	}
	return `https://github.com/organizations/${encodeURIComponent(owner)}/settings/apps/new?state=oss-guard`;
};

export const convertGithubManifestCode = async (code: string) => {
	const headers = new Headers({
		Accept: "application/vnd.github+json",
		"User-Agent": "oss-guard",
		"X-GitHub-Api-Version": "2026-03-10",
	});
	const token = runtimeEnv().GITHUB_MANIFEST_TOKEN ?? env.GITHUB_MANIFEST_TOKEN;
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(
		`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
		{
			headers,
			method: "POST",
		},
	);
	if (!response.ok) {
		throw new Error(
			`GitHub manifest conversion failed with ${response.status}`,
		);
	}
	return (await response.json()) as GithubManifestConversion;
};
