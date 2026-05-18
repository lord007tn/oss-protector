export const appName = "OSS Protector";
export const apiDocsPath = "/api-docs";
export const publicAppUrl = "https://oss-protector.raedbahri90.workers.dev";
const githubAppSlug = import.meta.env.VITE_GITHUB_APP_SLUG ?? "oss-protector";
export const githubAppInstallUrl = `https://github.com/apps/${githubAppSlug}/installations/new`;
export const githubAuthEnabled =
	import.meta.env.VITE_ENABLE_GITHUB_AUTH === "true";
export const githubRepoSlug = "lord007tn/oss-protector";
export const githubRepoUrl = `https://github.com/${githubRepoSlug}`;
export const githubRepoLicenseUrl = `${githubRepoUrl}/blob/master/LICENSE`;
