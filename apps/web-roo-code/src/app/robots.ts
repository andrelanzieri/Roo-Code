import type { MetadataRoute } from "next"
import { SEO } from "@/lib/seo"

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: "/",
		},
		sitemap: [`${SEO.url}/sitemap.xml`, "https://docs.roocode.com/sitemap.xml"],
		host: SEO.url,
	}
}
