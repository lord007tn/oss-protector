import { ArrowLeft, Github, Loader2, Mail, Shield } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import {
	emailOtpEnabled,
	githubAppInstallUrl,
	githubAuthEnabled,
} from "@/components/landing/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({
	callbackURL = "/dashboard",
}: {
	callbackURL?: string;
}) {
	const [step, setStep] = useState<"email" | "otp">("email");
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [pending, setPending] = useState(false);

	const sendCode = async (event?: FormEvent) => {
		event?.preventDefault();
		if (!EMAIL_PATTERN.test(email)) {
			toast.error("Enter a valid email address.");
			return;
		}
		setPending(true);
		const { error } = await authClient.emailOtp.sendVerificationOtp({
			email,
			type: "sign-in",
		});
		setPending(false);
		if (error) {
			toast.error(error.message ?? "Couldn't send the code. Try again.");
			return;
		}
		setStep("otp");
		toast.success(`We sent a 6-digit code to ${email}.`);
	};

	const verify = async (event: FormEvent) => {
		event.preventDefault();
		if (otp.trim().length < 6) {
			toast.error("Enter the 6-digit code.");
			return;
		}
		setPending(true);
		const { error } = await authClient.signIn.emailOtp({ email, otp });
		if (error) {
			setPending(false);
			toast.error(error.message ?? "That code didn't work. Try again.");
			return;
		}
		toast.success("Signed in.");
		window.location.href = callbackURL;
	};

	const signInGithub = async () => {
		setPending(true);
		try {
			const { error } = await authClient.signIn.social({
				callbackURL,
				provider: "github",
			});
			if (error) {
				setPending(false);
				toast.error(error.message ?? "GitHub sign-in failed.");
			}
			// On success Better Auth returns a github.com authorize URL and triggers
			// a full-page navigation. Leave `pending` true so the button stays in its
			// loading state until the browser actually unloads the page.
		} catch {
			// A network-layer rejection (offline, DNS/TLS failure) would otherwise
			// leave the whole form stuck on the spinner with no way to recover.
			setPending(false);
			toast.error("Couldn't reach GitHub sign-in. Check your connection.");
		}
	};

	return (
		<div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-soft">
			<div className="mb-5 inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
				<Shield className="size-6" />
			</div>
			<h1 className="font-medium text-2xl tracking-tight">
				Sign in to OSS Protector
			</h1>
			<p className="mt-2 mb-6 text-muted-foreground text-sm leading-relaxed">
				Maintainer controls require an account. Public surfaces — feed,
				accounts, disputes — stay open to everyone.
			</p>

			{githubAuthEnabled ? (
				<>
					<Button
						className="w-full"
						disabled={pending}
						onClick={signInGithub}
						size="lg"
						type="button"
						variant="outline"
					>
						{pending ? (
							<Loader2 className="animate-spin" data-icon="inline-start" />
						) : (
							<Github data-icon="inline-start" />
						)}
						{pending ? "Redirecting to GitHub…" : "Continue with GitHub"}
					</Button>
					{emailOtpEnabled ? (
						<div className="my-5 flex items-center gap-3 text-muted-foreground text-xs">
							<Separator className="flex-1" />
							or
							<Separator className="flex-1" />
						</div>
					) : null}
				</>
			) : null}

			{emailOtpEnabled && step === "email" ? (
				<form className="flex flex-col gap-3" onSubmit={sendCode}>
					<label className="font-medium text-[13.5px]" htmlFor="login-email">
						Email
					</label>
					<div className="relative">
						<Mail className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							autoComplete="email"
							className="pl-8"
							id="login-email"
							onChange={(event) => setEmail(event.target.value)}
							placeholder="you@example.com"
							size="lg"
							type="email"
							value={email}
						/>
					</div>
					<Button disabled={pending} size="lg" type="submit">
						{pending ? <Loader2 className="animate-spin" /> : <Mail />}
						Email me a code
					</Button>
				</form>
			) : null}

			{emailOtpEnabled && step === "otp" ? (
				<form className="flex flex-col gap-3" onSubmit={verify}>
					<div className="flex items-center justify-between">
						<label className="font-medium text-[13.5px]" htmlFor="login-otp">
							6-digit code
						</label>
						<Button
							onClick={() => {
								setStep("email");
								setOtp("");
							}}
							size="xs"
							type="button"
							variant="link"
						>
							<ArrowLeft data-icon="inline-start" />
							Change email
						</Button>
					</div>
					<Input
						autoComplete="one-time-code"
						className="text-center font-mono text-lg tracking-[0.4em]"
						id="login-otp"
						inputMode="numeric"
						maxLength={6}
						onChange={(event) =>
							setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
						}
						placeholder="••••••"
						size="lg"
						value={otp}
					/>
					<Button disabled={pending} size="lg" type="submit">
						{pending ? <Loader2 className="animate-spin" /> : null}
						Verify &amp; sign in
					</Button>
					<Button
						disabled={pending}
						onClick={() => sendCode()}
						size="xs"
						type="button"
						variant="link"
					>
						Didn't get it? Resend code
					</Button>
				</form>
			) : null}

			<div className="mt-6 rounded-xl bg-muted p-3.5 text-muted-foreground text-xs leading-relaxed">
				Next step after sign-in:{" "}
				<a className="text-primary" href={githubAppInstallUrl}>
					install OSS Protector on your repos →
				</a>
			</div>
		</div>
	);
}
