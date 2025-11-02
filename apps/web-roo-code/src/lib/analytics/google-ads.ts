/**
 * Google Ads conversion tracking utilities with enhanced conversions support
 * Implements manual enhanced conversion tracking for better attribution
 */

import { hasConsent } from "./consent-manager"

/**
 * SHA256 hash function for enhanced conversion data
 * Required for properly hashing user data before sending to Google
 */
async function sha256(text: string): Promise<string> {
	const utf8 = new TextEncoder().encode(text.toLowerCase().trim())
	const hashBuffer = await crypto.subtle.digest("SHA-256", utf8)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Interface for enhanced conversion user data
 */
interface EnhancedConversionData {
	email?: string
	phone?: string
	firstName?: string
	lastName?: string
	address?: {
		street?: string
		city?: string
		region?: string
		postalCode?: string
		country?: string
	}
}

/**
 * Prepare and hash user data for enhanced conversions
 * All data is hashed using SHA256 before sending to Google
 */
async function prepareEnhancedData(
	userData?: EnhancedConversionData,
): Promise<Record<string, string | Record<string, string>[]> | null> {
	if (!userData) return null

	const enhancedData: Record<string, string | Record<string, string>[]> = {}

	try {
		if (userData.email) {
			enhancedData.email = await sha256(userData.email)
		}
		if (userData.phone) {
			// Remove non-numeric characters and add country code if missing
			const cleanPhone = userData.phone.replace(/[^0-9]/g, "")
			enhancedData.phone = await sha256(cleanPhone)
		}
		if (userData.firstName) {
			enhancedData.first_name = await sha256(userData.firstName)
		}
		if (userData.lastName) {
			enhancedData.last_name = await sha256(userData.lastName)
		}
		if (userData.address) {
			const address: Record<string, string> = {}
			if (userData.address.street) {
				address.street = await sha256(userData.address.street)
			}
			if (userData.address.city) {
				address.city = await sha256(userData.address.city)
			}
			if (userData.address.region) {
				address.region = await sha256(userData.address.region)
			}
			if (userData.address.postalCode) {
				address.postal_code = await sha256(userData.address.postalCode)
			}
			if (userData.address.country) {
				address.country = await sha256(userData.address.country)
			}
			if (Object.keys(address).length > 0) {
				enhancedData.address = [address]
			}
		}

		return Object.keys(enhancedData).length > 0 ? enhancedData : null
	} catch (error) {
		console.error("Error preparing enhanced conversion data:", error)
		return null
	}
}

/**
 * Track a Google Ads conversion event with enhanced conversions
 * Implements manual enhanced conversion tracking for improved accuracy
 *
 * @param conversionLabel - Optional conversion label (defaults to PR Reviewer trial signup)
 * @param value - Optional conversion value
 * @param userData - Optional user data for enhanced conversions
 */
export async function trackGoogleAdsConversion(
	conversionLabel = "VtOZCJe_77MbEInXkOVA",
	value = 10.0,
	userData?: EnhancedConversionData,
) {
	// Only track if consent has been given
	if (!hasConsent()) {
		console.log("Google Ads conversion tracking skipped - no consent")
		return
	}

	if (typeof window !== "undefined" && window.gtag) {
		try {
			// Prepare enhanced conversion data if provided
			const enhancedData = await prepareEnhancedData(userData)

			// Build the conversion event parameters
			const conversionParams: Record<
				string,
				string | number | Record<string, string | Record<string, string>[]>
			> = {
				send_to: `AW-17391954825/${conversionLabel}`,
				value: value,
				currency: "USD",
			}

			// Add enhanced conversion data if available
			if (enhancedData) {
				conversionParams.user_data = enhancedData
			}

			// Send the conversion event
			window.gtag("event", "conversion", conversionParams)

			console.log("Google Ads conversion tracked with enhanced data")
		} catch (error) {
			console.error("Error tracking Google Ads conversion:", error)
			// Fall back to basic conversion tracking
			window.gtag("event", "conversion", {
				send_to: `AW-17391954825/${conversionLabel}`,
				value: value,
				currency: "USD",
			})
		}
	}
}

/**
 * Track a page view conversion (for automatic event tracking)
 * Used when the conversion should fire on page load rather than user action
 */
export function trackPageViewConversion(conversionLabel = "VtOZCJe_77MbEInXkOVA", value = 10.0) {
	// Only track if consent has been given
	if (!hasConsent()) {
		return
	}

	if (typeof window !== "undefined" && window.gtag) {
		// Use a slight delay to ensure gtag is fully initialized
		setTimeout(() => {
			window.gtag("event", "page_view", {
				send_to: `AW-17391954825/${conversionLabel}`,
				value: value,
				currency: "USD",
			})
		}, 100)
	}
}
