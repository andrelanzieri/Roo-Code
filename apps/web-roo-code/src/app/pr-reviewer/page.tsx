import type { Metadata } from "next"

import { SEO } from "@/lib/seo"
import { ogImageUrl } from "@/lib/og"
import { PRReviewerContent } from "./PRReviewerContent"

const TITLE = "PR Reviewer"
const DESCRIPTION =
	"Your AI wrote the code. Roo made sure it's safe to ship. AI-generated commits are flooding PRs. Roo PR Reviewer catches what slipped through before it hits prod."
const OG_DESCRIPTION = "Your AI wrote the code. Roo made sure it's safe to ship."
const PATH = "/pr-reviewer"

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: {
		canonical: `${SEO.url}${PATH}`,
	},
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: `${SEO.url}${PATH}`,
		siteName: SEO.name,
		images: [
			{
				url: ogImageUrl(TITLE, OG_DESCRIPTION),
				width: 1200,
				height: 630,
				alt: TITLE,
			},
		],
		locale: SEO.locale,
		type: "website",
	},
	twitter: {
		card: SEO.twitterCard,
		title: TITLE,
		description: DESCRIPTION,
		images: [ogImageUrl(TITLE, OG_DESCRIPTION)],
	},
	keywords: [
		...SEO.keywords,
		"PR reviewer",
		"code review",
		"pull request review",
		"AI code review",
		"GitHub PR review",
		"automated code review",
		"AI-generated code",
		"security review",
		"JWT verification",
		"regex security",
		"billing errors",
		"logic bugs",
		"AI hallucinations",
		"senior developer",
		"paranoid code review",
		"bring your own key",
		"BYOK AI",
	],
}

export default function PRReviewerPage() {
	return <PRReviewerContent />
}
