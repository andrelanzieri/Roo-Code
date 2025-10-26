import { useState, useEffect } from "react"

type Platform = "mac" | "windows" | "linux" | "unknown"

export function usePlatform(): Platform {
	const [platform, setPlatform] = useState<Platform>("unknown")

	useEffect(() => {
		const userAgent = window.navigator.userAgent.toLowerCase()
		if (userAgent.includes("mac")) {
			setPlatform("mac")
		} else if (userAgent.includes("win")) {
			setPlatform("windows")
		} else if (userAgent.includes("linux")) {
			setPlatform("linux")
		}
	}, [])

	return platform
}
