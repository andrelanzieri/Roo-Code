import { SEO } from "./seo"
import { EXTERNAL_LINKS } from "./constants"

/**
 * Type definitions for Schema.org structured data
 */
interface ImageObject {
	"@type": "ImageObject"
	url: string
	width: number
	height: number
}

interface Organization {
	"@type": "Organization"
	"@id": string
	name: string
	url: string
	logo: ImageObject
	alternateName: string[]
	sameAs: string[]
}

interface WebSite {
	"@type": "WebSite"
	"@id": string
	url: string
	name: string
	alternateName: string[]
	publisher: { "@id": string }
}

interface SoftwareApplication {
	"@type": "SoftwareApplication"
	"@id": string
	name: string
	applicationCategory: string
	operatingSystem: string
	url: string
	downloadUrl: string
	offers: {
		"@type": "Offer"
		price: string
		priceCurrency: string
	}
	isAccessibleForFree: boolean
	publisher: { "@id": string }
}

interface SiteNavigationElement {
	"@type": "SiteNavigationElement"
	name: string
	url: string
}

type GraphNode = Organization | WebSite | SoftwareApplication | SiteNavigationElement

interface StructuredDataGraph {
	"@context": "https://schema.org"
	"@graph": GraphNode[]
}

/**
 * Generates the complete JSON-LD structured data for SEO
 *
 * This includes:
 * - Organization schema (brand identity, logo, social profiles)
 * - WebSite schema (site name for Google Search)
 * - SoftwareApplication schema (VS Code extension metadata)
 *
 * @returns Complete structured data object ready for JSON-LD injection
 */
export function getStructuredData(): StructuredDataGraph {
	// Organization ID - used to link all entities
	const orgId = `${SEO.url}#org`

	const organization: Organization = {
		"@type": "Organization",
		"@id": orgId,
		name: SEO.name,
		url: SEO.url,
		logo: {
			"@type": "ImageObject",
			url: `${SEO.url}/android-chrome-512x512.png`,
			width: 512,
			height: 512,
		},
		alternateName: ["RooCode"],
		sameAs: [
			EXTERNAL_LINKS.GITHUB,
			EXTERNAL_LINKS.MARKETPLACE,
			EXTERNAL_LINKS.X,
			EXTERNAL_LINKS.LINKEDIN,
			EXTERNAL_LINKS.REDDIT,
			EXTERNAL_LINKS.DISCORD,
			EXTERNAL_LINKS.YOUTUBE,
		],
	}

	const website: WebSite = {
		"@type": "WebSite",
		"@id": `${SEO.url}#website`,
		url: SEO.url,
		name: SEO.name,
		alternateName: ["RooCode"],
		publisher: { "@id": orgId },
	}

	const softwareApplication: SoftwareApplication = {
		"@type": "SoftwareApplication",
		"@id": `${SEO.url}#vscode-extension`,
		name: "Roo Code (VS Code extension)",
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Windows, macOS, Linux",
		url: SEO.url,
		downloadUrl: EXTERNAL_LINKS.MARKETPLACE,
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
		isAccessibleForFree: true,
		publisher: { "@id": orgId },
	}

	const siteNavigation: SiteNavigationElement[] = [
		{ "@type": "SiteNavigationElement", name: "Extension", url: `${SEO.url}/extension` },
		{ "@type": "SiteNavigationElement", name: "Cloud", url: `${SEO.url}/cloud` },
		{ "@type": "SiteNavigationElement", name: "Docs", url: EXTERNAL_LINKS.DOCUMENTATION },
		{ "@type": "SiteNavigationElement", name: "Pricing", url: `${SEO.url}/pricing` },
	]

	return {
		"@context": "https://schema.org",
		"@graph": [organization, website, softwareApplication, ...siteNavigation],
	}
}

/**
 * Type export for use in components
 */
export type { StructuredDataGraph }
