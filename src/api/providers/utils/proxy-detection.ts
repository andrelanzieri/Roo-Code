import * as vscode from "vscode"

/**
 * Detects if the user has proxy settings configured but http.electronFetch is disabled.
 * This combination can cause connection errors with certain API providers.
 */
export function detectProxyConfigurationIssue(): {
	hasProxyConfig: boolean
	electronFetchEnabled: boolean
	hasIssue: boolean
	proxySettings: string[]
} {
	const config = vscode.workspace.getConfiguration()

	// Check for proxy-related settings
	const httpProxy = config.get<string>("http.proxy")
	const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy
	const httpProxyEnv = process.env.HTTP_PROXY || process.env.http_proxy
	const allProxy = process.env.ALL_PROXY || process.env.all_proxy

	// Check if electronFetch is enabled (default is false in VSCode)
	const electronFetchEnabled = config.get<boolean>("http.electronFetch", false)

	// Collect all proxy settings found
	const proxySettings: string[] = []
	if (httpProxy) proxySettings.push(`VSCode http.proxy: ${httpProxy}`)
	if (httpsProxy) proxySettings.push(`HTTPS_PROXY: ${httpsProxy}`)
	if (httpProxyEnv) proxySettings.push(`HTTP_PROXY: ${httpProxyEnv}`)
	if (allProxy) proxySettings.push(`ALL_PROXY: ${allProxy}`)

	// Check if running with proxy PAC file
	const args = process.argv.join(" ")
	const hasPacFile = args.includes("--proxy-pac-url")
	if (hasPacFile) {
		const pacMatch = args.match(/--proxy-pac-url[= ]([^ ]+)/)
		if (pacMatch) {
			proxySettings.push(`PAC file: ${pacMatch[1]}`)
		}
	}

	const hasProxyConfig = proxySettings.length > 0
	const hasIssue = hasProxyConfig && !electronFetchEnabled

	return {
		hasProxyConfig,
		electronFetchEnabled,
		hasIssue,
		proxySettings,
	}
}

/**
 * Formats a helpful error message when proxy configuration issues are detected
 */
export function formatProxyErrorMessage(
	error: any,
	proxyInfo?: ReturnType<typeof detectProxyConfigurationIssue>,
): string {
	const baseError = error?.message || "Connection error"

	if (!proxyInfo) {
		proxyInfo = detectProxyConfigurationIssue()
	}

	if (proxyInfo.hasIssue) {
		return `${baseError}

⚠️ **Proxy Configuration Issue Detected**

You have proxy settings configured but \`http.electronFetch\` is disabled (default). This can cause connection errors with API providers.

**Detected proxy settings:**
${proxyInfo.proxySettings.map((s) => `• ${s}`).join("\n")}

**Solution:**
1. Open VSCode Settings (Cmd/Ctrl + ,)
2. Search for "http.electronFetch"
3. Enable the setting (check the box)
4. Restart VSCode and try again

**Alternative solutions:**
• Use a different API provider that works with your proxy setup
• Configure the extension to use axios-based providers when available
• Temporarily disable proxy settings if not needed

For more information, see: https://github.com/microsoft/vscode/issues/12588`
	}

	// Check for other common connection errors
	if (baseError.includes("ECONNREFUSED")) {
		return `${baseError}

The connection was refused. Please check:
• Is the API endpoint URL correct?
• Is the service running and accessible?
• Are there any firewall or network restrictions?`
	}

	if (baseError.includes("ETIMEDOUT") || baseError.includes("ESOCKETTIMEDOUT")) {
		return `${baseError}

The connection timed out. Please check:
• Is the API endpoint accessible from your network?
• Are you behind a corporate firewall or VPN?
• Is the service experiencing high load?`
	}

	if (baseError.includes("ENOTFOUND")) {
		return `${baseError}

The hostname could not be resolved. Please check:
• Is the API endpoint URL spelled correctly?
• Do you have internet connectivity?
• Are DNS settings configured correctly?`
	}

	return baseError
}

/**
 * Shows a warning notification if proxy configuration issues are detected
 */
export async function showProxyConfigurationWarning(): Promise<void> {
	const proxyInfo = detectProxyConfigurationIssue()

	if (proxyInfo.hasIssue) {
		const message = "Proxy detected but http.electronFetch is disabled. This may cause connection errors."
		const action = await vscode.window.showWarningMessage(message, "Enable electronFetch", "Learn More", "Dismiss")

		if (action === "Enable electronFetch") {
			// Open settings and navigate to the http.electronFetch setting
			await vscode.commands.executeCommand("workbench.action.openSettings", "http.electronFetch")
		} else if (action === "Learn More") {
			// Open the GitHub issue for more information
			await vscode.env.openExternal(vscode.Uri.parse("https://github.com/microsoft/vscode/issues/12588"))
		}
	}
}
