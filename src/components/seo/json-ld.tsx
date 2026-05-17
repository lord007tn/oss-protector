import { appName, publicAppUrl } from "@/components/landing/constants";

export function JsonLd({ data }: { data: unknown }) {
	const json = JSON.stringify(data).replaceAll("<", "\\u003c");

	return <script type="application/ld+json">{json}</script>;
}

export function siteJsonLd() {
	return {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@id": `${publicAppUrl}/#organization`,
				"@type": "Organization",
				logo: `${publicAppUrl}/oss-protector-mark.svg`,
				name: appName,
				url: publicAppUrl,
			},
			{
				"@id": `${publicAppUrl}/#website`,
				"@type": "WebSite",
				description:
					"OSS Protector publishes a public review directory of suspicious open-source contribution patterns.",
				name: appName,
				publisher: { "@id": `${publicAppUrl}/#organization` },
				url: `${publicAppUrl}/`,
			},
			{
				"@id": `${publicAppUrl}/#software`,
				"@type": "SoftwareApplication",
				applicationCategory: "SecurityApplication",
				description:
					"A GitHub App and public directory for maintainer review of suspicious OSS contribution activity.",
				name: appName,
				operatingSystem: "Web",
				url: publicAppUrl,
			},
		],
	};
}
