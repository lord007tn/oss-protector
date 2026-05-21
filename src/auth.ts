import type { IncomingRequestCfProperties } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { withCloudflare } from "better-auth-cloudflare";
import { getAppUrl, type RuntimeBindings, runtimeBindings } from "@/env";

type CloudflareRequest = Request & {
	cf?: IncomingRequestCfProperties;
};

type OtpType =
	| "sign-in"
	| "email-verification"
	| "forget-password"
	| "change-email";

const OTP_SUBJECTS: Record<OtpType, string> = {
	"change-email": "Confirm your new OSS Protector email",
	"email-verification": "Verify your OSS Protector email",
	"forget-password": "Reset your OSS Protector password",
	"sign-in": "Your OSS Protector sign-in code",
};

const otpEmailHtml = (otp: string) =>
	`<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:420px;margin:0 auto">
		<p style="color:#16140f;font-size:15px">Here is your OSS Protector code:</p>
		<p style="font-size:30px;font-weight:600;letter-spacing:8px;color:#e66a38;margin:18px 0">${otp}</p>
		<p style="color:#7e7a6e;font-size:13px">This code expires in 5 minutes. If you didn't request it, you can ignore this email.</p>
	</div>`;

// Sends a one-time code. Uses Resend when RESEND_API_KEY is configured; in local
// development with no provider it logs the code to the server console so the
// flow stays testable.
// TODO(real-data): wire a production email provider + verified sending domain.
async function sendOtpEmail({
	env,
	email,
	otp,
	type,
}: {
	env: RuntimeBindings;
	email: string;
	otp: string;
	type: OtpType;
}) {
	const apiKey = env.RESEND_API_KEY;
	if (!apiKey) {
		// biome-ignore lint/suspicious/noConsole: dev-only OTP delivery fallback
		console.log(`[email-otp] ${type} code for ${email}: ${otp}`);
		return;
	}
	const from = env.EMAIL_FROM ?? "OSS Protector <onboarding@resend.dev>";
	const response = await fetch("https://api.resend.com/emails", {
		body: JSON.stringify({
			from,
			html: otpEmailHtml(otp),
			subject: OTP_SUBJECTS[type],
			to: email,
		}),
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		method: "POST",
	});
	if (!response.ok) {
		// biome-ignore lint/suspicious/noConsole: surface delivery failures in logs
		console.error(
			"Resend email failed",
			response.status,
			await response.text()
		);
	}
}

const configuredGithubProvider = (env: RuntimeBindings) => {
	if (!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)) {
		return;
	}
	return {
		github: {
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
		},
	};
};

export const createAuth = ({
	env,
	request,
}: {
	env?: RuntimeBindings;
	request: Request;
}) => {
	const bindings = { ...runtimeBindings(), ...env };
	const appUrl = bindings.VITE_APP_URL ?? getAppUrl();
	const cfRequest = request as CloudflareRequest;

	return betterAuth({
		...withCloudflare(
			{
				autoDetectIpAddress: true,
				cf: cfRequest.cf ?? null,
				d1Native: bindings.clankers_db,
				geolocationTracking: false,
			},
			{
				plugins: [
					emailOTP({
						expiresIn: 300,
						otpLength: 6,
						sendVerificationOTP: async ({ email, otp, type }) => {
							await sendOtpEmail({ email, env: bindings, otp, type });
						},
					}),
				],
				secret: bindings.BETTER_AUTH_SECRET,
				socialProviders: configuredGithubProvider(bindings),
				trustedOrigins: [appUrl],
			}
		),
		baseURL: appUrl,
	});
};

// Which sign-in methods are usable given the current environment.
export const getAuthMethods = (env?: RuntimeBindings) => {
	const bindings = { ...runtimeBindings(), ...env };
	return {
		// Email OTP only needs the verification table + a sender (dev console works).
		emailOtp: true,
		github: Boolean(bindings.GITHUB_CLIENT_ID && bindings.GITHUB_CLIENT_SECRET),
	};
};

export const getAuthConfigStatus = (env?: RuntimeBindings) => {
	const bindings = { ...runtimeBindings(), ...env };
	// Core auth only needs a secret + database. Individual providers (GitHub,
	// email) are optional and surfaced separately via getAuthMethods.
	const missing = [
		["BETTER_AUTH_SECRET", bindings.BETTER_AUTH_SECRET],
		["clankers_db", bindings.clankers_db],
	]
		.filter(([, value]) => !value)
		.map(([key]) => key);

	return {
		isConfigured: missing.length === 0,
		methods: getAuthMethods(bindings),
		missing,
	};
};
