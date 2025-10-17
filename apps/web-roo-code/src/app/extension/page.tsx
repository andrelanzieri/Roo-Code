import { ArrowRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui"
import { AnimatedBackground } from "@/components/homepage"
import { SEO } from "@/lib/seo"
import { EXTERNAL_LINKS } from "@/lib/constants"

const TITLE = "Roo Code Extension"
const DESCRIPTION = "Open-source VS Code extension that turns your editor into an AI dev team. Works with any model."
const PATH = "/extension"
const OG_IMAGE = SEO.ogImage

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: `${SEO.url}${PATH}` },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: `${SEO.url}${PATH}`,
		siteName: SEO.name,
		images: [{ url: OG_IMAGE.url, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE.alt }],
		locale: SEO.locale,
		type: "website",
	},
	twitter: {
		card: SEO.twitterCard,
		title: TITLE,
		description: DESCRIPTION,
		images: [OG_IMAGE.url],
	},
	keywords: [...SEO.keywords, "VS Code extension", "Roo Code extension"],
}

export default function ExtensionPage() {
	const breadcrumbLd = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: "Home", item: SEO.url },
			{ "@type": "ListItem", position: 2, name: "Extension", item: `${SEO.url}${PATH}` },
		],
	}

	return (
		<>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
			<section className="relative flex md:h-[calc(80vh-theme(spacing.12))] items-center overflow-hidden">
				<AnimatedBackground />
				<div className="container relative flex items-center h-full z-10 mx-auto px-4 sm:px-6 lg:px-8">
					<div className="grid h-full relative gap-8 lg:grid-cols-2">
						<div className="flex flex-col px-4 justify-center space-y-6 sm:space-y-8">
							<div>
								<h1 className="text-4xl font-bold tracking-tight mt-8 text-center md:text-left md:text-4xl lg:text-5xl lg:mt-0">
									Roo Code Extension
								</h1>
								<p className="mt-4 max-w-md text-lg text-muted-foreground text-center md:text-left sm:mt-6">
									Open-source AI coding agent that lives in VS Code. Multi-step, project‑wide context,
									and works with any model.
								</p>
							</div>
							<div className="flex flex-col space-y-3 sm:flex-row sm:space-x-4 sm:space-y-0">
								<Button
									size="lg"
									className="w-full hover:bg-gray-200 dark:bg-white dark:text-black sm:w-auto">
									<a
										href={EXTERNAL_LINKS.MARKETPLACE}
										target="_blank"
										rel="noreferrer"
										className="flex w-full items-center justify-center">
										Install VS Code Extension
										<ArrowRight className="ml-2" />
									</a>
								</Button>
								<Button
									variant="outline"
									size="lg"
									className="w-full sm:w-auto bg-white/20 dark:bg-white/10 backdrop-blur-sm border border-black/40 dark:border-white/30 hover:border-blue-400 hover:bg-white/30 dark:hover:bg-white/20 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all duration-300">
									<a
										href={EXTERNAL_LINKS.DOCUMENTATION}
										target="_blank"
										rel="noreferrer"
										className="flex w-full items-center justify-center">
										Docs
										<ArrowRight className="ml-2" />
									</a>
								</Button>
							</div>
							<div className="text-sm text-muted-foreground text-center md:text-left">
								<Link href="/pricing" className="underline underline-offset-4 hover:text-foreground">
									Pricing
								</Link>
							</div>
						</div>
					</div>
				</div>
			</section>
		</>
	)
}
