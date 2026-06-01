import { createFileRoute } from "@tanstack/react-router";
import { Activity, Check, Loader2, Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Stepper } from "@/components/oss/stepper";
import { PageShell } from "@/components/site/page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxCard, CheckboxCardIndicator } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildSharedHead } from "@/lib/head";

// Basic, dependency-free email shape check: one @, a dot in the domain, no
// whitespace. The flagged account's verdict is emailed here, so an undeliverable
// address means the appellant never hears back — block it before Step 1 advances.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STEPS = [
	{ label: "Identify" },
	{ label: "Your story" },
	{ label: "Evidence" },
	{ label: "Submit" },
];

const EVIDENCE = [
	{
		key: "email",
		title: "Verify via employer email",
		body: "We'll send a one-time code to a domain you own (work email).",
	},
	{
		key: "commits",
		title: "Sign a commit with your GitHub keys",
		body: "Prove control of the account by signing a unique string.",
	},
	{
		key: "employer",
		title: "Letter from your employer",
		body: "A short note from a colleague at your org vouching for you.",
	},
	{
		key: "statement",
		title: "Public statement on your GitHub profile",
		body: "Add a verification string to your README within 24h.",
	},
] as const;

type EvidenceKey = (typeof EVIDENCE)[number]["key"];

export const Route = createFileRoute("/appeal")({
	component: AppealRoute,
	head: () =>
		buildSharedHead({
			description:
				"Wrongly flagged? Submit an appeal — three trust-graph maintainers review within 48 hours. No fees, no gatekeeping.",
			path: "/appeal",
			title: "Appeal a flag | OSS Protector",
		}),
});

function FieldRow({
	label,
	hint,
	children,
}: {
	label: string;
	hint: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid items-center gap-4 border-border border-t py-3 first:border-0 sm:grid-cols-[200px_1fr]">
			<div>
				<span className="font-medium text-[13.5px]">{label}</span>
				<div className="mt-0.5 text-muted-foreground text-xs">{hint}</div>
			</div>
			{children}
		</div>
	);
}

function AppealRoute() {
	const [step, setStep] = useState(0);
	const [handle, setHandle] = useState("");
	const [email, setEmail] = useState("");
	const [holder, setHolder] = useState<"rep" | "self" | null>(null);
	const [story, setStory] = useState("");
	const [evidence, setEvidence] = useState<Record<EvidenceKey, boolean>>({
		commits: false,
		email: false,
		employer: false,
		statement: false,
	});
	const [submitted, setSubmitted] = useState(false);
	const [tracking, setTracking] = useState("");
	const [pending, setPending] = useState(false);
	const identifyValid = Boolean(
		handle.trim().length >= 2 && EMAIL_PATTERN.test(email.trim()) && holder
	);

	const submit = async () => {
		if (!holder) {
			toast.error(
				"Choose whether you are the account holder or a representative."
			);
			return;
		}
		setPending(true);
		try {
			const response = await fetch("/api/appeal", {
				body: JSON.stringify({
					email,
					evidence: Object.entries(evidence).flatMap(([key, on]) =>
						on ? [key] : []
					),
					login: handle,
					relationship: holder,
					story,
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const data = (await response.json()) as {
				error?: string;
				trackingId?: string;
			};
			if (!response.ok) {
				toast.error(data.error ?? "Couldn't submit your appeal. Try again.");
				return;
			}
			setTracking(data.trackingId ?? "");
			setSubmitted(true);
		} catch {
			toast.error("Network error — try again.");
		} finally {
			setPending(false);
		}
	};

	if (submitted) {
		return (
			<PageShell>
				<div className="mx-auto w-full max-w-[760px] px-4 py-16 md:px-8">
					<div className="rounded-2xl border bg-card p-14 text-center">
						<div className="mb-5 inline-flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
							<Check className="size-7" />
						</div>
						<h1 className="font-medium text-3xl tracking-tight">
							Appeal received.
						</h1>
						<p className="mx-auto mt-3 mb-6 max-w-lg text-muted-foreground">
							Tracking ID{" "}
							<span className="font-mono text-foreground">{tracking}</span>.
							Three maintainers from the trust graph will review within 48
							hours. We'll email you the moment a verdict is published.
						</p>
						<Alert className="mx-auto max-w-md text-left" variant="info">
							<Shield />
							<AlertDescription>
								<b className="text-foreground">While you wait:</b> your account
								remains flagged. Maintainers reviewing your PRs will see the
								appeal is in progress.
							</AlertDescription>
						</Alert>
						<a className="mt-6 inline-block" href="/">
							<Button type="button">Back to home</Button>
						</a>
					</div>
				</div>
			</PageShell>
		);
	}

	return (
		<PageShell>
			<div className="mx-auto w-full max-w-[760px] px-4 py-12 md:px-8">
				<Stepper current={step} steps={STEPS} />

				{step === 0 ? (
					<>
						<h1 className="font-medium text-3xl tracking-tight">
							Were you wrongly flagged?
						</h1>
						<p className="mt-2 mb-8 text-[16px] text-muted-foreground leading-relaxed">
							False positives happen. If your account got caught by our
							heuristics and you're a real human (or running a tool with
							maintainer consent), tell us about yourself. No fees, no lawyers,
							no gatekeeping.
						</p>
						<div className="rounded-2xl border bg-card p-7">
							<FieldRow
								hint="The account that was flagged"
								label="GitHub handle"
							>
								<Input
									onChange={(event) => setHandle(event.target.value)}
									placeholder="@your-handle"
									value={handle}
								/>
							</FieldRow>
							<FieldRow hint="Where we'll send the verdict" label="Your email">
								<Input
									onChange={(event) => setEmail(event.target.value)}
									placeholder="you@example.com"
									type="email"
									value={email}
								/>
							</FieldRow>
							<FieldRow
								hint="Or representing them"
								label="Are you the account holder?"
							>
								<div className="flex flex-wrap gap-2">
									<Button
										aria-pressed={holder === "self"}
										onClick={() => setHolder("self")}
										size="xs"
										type="button"
										variant={holder === "self" ? "default" : "outline"}
									>
										I am the account holder
									</Button>
									<Button
										aria-pressed={holder === "rep"}
										onClick={() => setHolder("rep")}
										size="xs"
										type="button"
										variant={holder === "rep" ? "default" : "outline"}
									>
										I represent them
									</Button>
								</div>
							</FieldRow>
						</div>
						{identifyValid ? null : (
							<p className="mt-3 text-muted-foreground text-xs">
								Enter a GitHub handle, a valid email, and choose whether you are
								the account holder or a representative.
							</p>
						)}
						<Alert className="mt-4" variant="warning">
							<Shield />
							<AlertDescription>
								<b className="text-foreground">Anti-abuse note.</b> Appeals
								submitted from new emails or with no commit history get extra
								scrutiny. We do this to prevent bot-driven appeal floods, not to
								gatekeep real humans.
							</AlertDescription>
						</Alert>
						<div className="mt-7 flex items-center justify-between">
							<a href="/">
								<Button type="button" variant="ghost">
									Cancel
								</Button>
							</a>
							<Button
								disabled={!identifyValid}
								onClick={() => setStep(1)}
								type="button"
							>
								Continue →
							</Button>
						</div>
					</>
				) : null}

				{step === 1 ? (
					<>
						<h1 className="font-medium text-3xl tracking-tight">
							What did we get wrong?
						</h1>
						<p className="mt-2 mb-8 text-[16px] text-muted-foreground leading-relaxed">
							In your own words. Be specific. Vague appeals don't move
							maintainers. Tell us who you are, why you opened those PRs, and
							what context our heuristics missed.
						</p>
						<div className="rounded-2xl border bg-card p-7">
							<Textarea
								onChange={(event) => setStory(event.target.value)}
								placeholder="e.g. I'm a backend engineer at Acme Co. I started using GitHub recently because we open-sourced a library. The PRs you flagged are mine — I wrote them by hand…"
								rows={9}
								value={story}
							/>
							<div className="mt-2.5 flex justify-between text-muted-foreground text-xs">
								<span>{story.length} characters · minimum 60</span>
								<span>Published publicly with the appeal</span>
							</div>
						</div>
						<div className="mt-7 flex items-center justify-between">
							<Button onClick={() => setStep(0)} type="button" variant="ghost">
								← Back
							</Button>
							<Button
								disabled={story.length < 60}
								onClick={() => setStep(2)}
								type="button"
							>
								Continue →
							</Button>
						</div>
					</>
				) : null}

				{step === 2 ? (
					<>
						<h1 className="font-medium text-3xl tracking-tight">
							Help us verify.
						</h1>
						<p className="mt-2 mb-8 text-[16px] text-muted-foreground leading-relaxed">
							The more you can show, the faster maintainers can move. None of
							these are required, but each one strengthens your appeal.
						</p>
						<div className="flex flex-col gap-2">
							{EVIDENCE.map((item) => {
								const on = evidence[item.key];
								return (
									<CheckboxCard
										checked={on}
										key={item.key}
										onCheckedChange={() =>
											setEvidence((prev) => ({ ...prev, [item.key]: !on }))
										}
									>
										<CheckboxCardIndicator />
										<span>
											<span className="block font-medium text-sm">
												{item.title}
											</span>
											<span className="mt-1 block text-muted-foreground text-xs">
												{item.body}
											</span>
										</span>
									</CheckboxCard>
								);
							})}
						</div>
						<div className="mt-7 flex items-center justify-between">
							<Button onClick={() => setStep(1)} type="button" variant="ghost">
								← Back
							</Button>
							<Button onClick={() => setStep(3)} type="button">
								Continue →
							</Button>
						</div>
					</>
				) : null}

				{step === 3 ? (
					<>
						<h1 className="font-medium text-3xl tracking-tight">
							Ready to submit.
						</h1>
						<p className="mt-2 mb-8 text-[16px] text-muted-foreground leading-relaxed">
							Three maintainers will review your appeal within 48 hours. The
							verdict will be published publicly with your story attached.
						</p>
						<div className="rounded-2xl border bg-card p-7">
							<SummaryRow label="Account" value={handle || "@your-handle"} />
							<SummaryRow
								label="Representing"
								value={holder === "self" ? "account holder" : "on their behalf"}
							/>
							<SummaryRow
								label="Story"
								value={`${story.length} characters · public`}
							/>
							<SummaryRow
								label="Verification methods"
								value={
									Object.entries(evidence)
										.flatMap(([key, value]) => (value ? [key] : []))
										.join(", ") || "none chosen"
								}
							/>
							<SummaryRow label="SLA" value="48 hours from submission" />
							<SummaryRow label="Cost" value="$0" />
						</div>
						<Alert className="mt-4" variant="default">
							<Activity />
							<AlertDescription>
								<b className="text-foreground">What happens next.</b> Three
								trust-graph maintainers vote. If 2+ overturn, your account is
								moved out of the "automated" tier and the flag is rescinded
								across all repos that imported the shared blocklist.
							</AlertDescription>
						</Alert>
						<div className="mt-7 flex items-center justify-between">
							<Button onClick={() => setStep(2)} type="button" variant="ghost">
								← Back
							</Button>
							<Button
								disabled={pending}
								onClick={submit}
								size="lg"
								type="button"
							>
								{pending ? <Loader2 className="animate-spin" /> : null}
								Submit appeal
							</Button>
						</div>
					</>
				) : null}
			</div>
		</PageShell>
	);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between border-border border-t py-2.5 text-[13.5px] first:border-0">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-mono">{value}</span>
		</div>
	);
}
