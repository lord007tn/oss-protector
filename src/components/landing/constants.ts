export const appName = "OSS Protector";
export const apiDocsPath = "/docs";
export const publicAppUrl = "https://oss-protector.raedbahri90.workers.dev";
const githubAppSlug = import.meta.env.VITE_GITHUB_APP_SLUG ?? "oss-protector";
export const githubAppInstallUrl = `https://github.com/apps/${githubAppSlug}/installations/new`;
// Default to enabled on the hosted instance. wrangler.json `vars` are
// runtime, not build-time, so `import.meta.env.VITE_ENABLE_GITHUB_AUTH` was
// undefined at compile time and hid the button. Self-hosted forks that
// genuinely want the GitHub flow disabled can set the build env to "false".
export const githubAuthEnabled =
	import.meta.env.VITE_ENABLE_GITHUB_AUTH !== "false";
export const emailOtpEnabled =
	import.meta.env.VITE_ENABLE_EMAIL_OTP !== "false";
export const githubRepoSlug = "lord007tn/oss-protector";
export const githubRepoUrl = `https://github.com/${githubRepoSlug}`;
export const githubRepoLicenseUrl = `${githubRepoUrl}/blob/master/LICENSE`;
