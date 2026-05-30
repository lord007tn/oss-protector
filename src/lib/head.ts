import { publicAppUrl } from "@/components/landing/constants";

interface SharedHeadInput {
	description: string;
	ogImage?: string;
	ogType?: "article" | "website";
	path: string;
	title: string;
}

// Builds the per-route <head> meta + canonical link with Open Graph + Twitter
// Card fields filled in consistently. TanStack Router's head() returns
// { links, meta } — each route either uses this directly or spreads the
// result and adds its own extras.
//
// Defaults: og:type=website, og:image=site logo. Routes that need different
// values override via the explicit fields.
export function buildSharedHead({
	description,
	ogImage,
	ogType = "website",
	path,
	title,
}: SharedHeadInput) {
	const canonical = `${publicAppUrl}${path}`;
	const socialImage = ogImage ?? `${publicAppUrl}/oss-protector-mark.svg`;
	return {
		links: [{ href: canonical, rel: "canonical" }],
		meta: [
			{ title },
			{ content: description, name: "description" },
			{ content: title, property: "og:title" },
			{ content: description, property: "og:description" },
			{ content: canonical, property: "og:url" },
			{ content: ogType, property: "og:type" },
			{ content: socialImage, property: "og:image" },
			{ content: "summary_large_image", name: "twitter:card" },
			{ content: title, name: "twitter:title" },
			{ content: description, name: "twitter:description" },
			{ content: socialImage, name: "twitter:image" },
		],
	};
}
