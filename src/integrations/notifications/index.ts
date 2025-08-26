import { execa } from "execa"
import { platform } from "os"
import * as vscode from "vscode"
import * as path from "path"

interface NotificationOptions {
	title?: string
	subtitle?: string
	message: string
	force?: boolean // Force notification even if the window is focused
}

async function showMacOSNotification(options: NotificationOptions): Promise<void> {
	const { title = "Roo Code", subtitle = "", message } = options

	try {
		// First try terminal-notifier (native macOS tool, no compilation needed)
		await execa("terminal-notifier", [
			"-title",
			title,
			"-subtitle",
			subtitle || "",
			"-message",
			message,
			"-sound",
			"default",
			"-group",
			"com.roocode.vscode",
			"-appIcon",
			path.join(__dirname, "..", "..", "assets", "icons", "icon.png"),
		])
	} catch (terminalNotifierError) {
		// If terminal-notifier is not available, fall back to osascript
		console.log("terminal-notifier not available, falling back to osascript")

		const escape = (str: string = "") => str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'")
		const script = `display notification "${escape(message)}" with title "${escape(title)}" subtitle "${escape(subtitle)}" sound name "default"`

		try {
			await execa("osascript", ["-e", script])
		} catch (osascriptError) {
			console.error("Failed to show macOS notification:", osascriptError)
			throw new Error(`Failed to show macOS notification: ${osascriptError}`)
		}
	}
}

async function showWindowsNotification(options: NotificationOptions): Promise<void> {
	const { title = "Roo Code", subtitle = "", message } = options

	try {
		// Use node-notifier for Windows
		const notifier = await import("node-notifier")
		const iconPath = path.join(__dirname, "..", "..", "assets", "icons", "icon.png")

		// Windows notification doesn't support subtitle, so combine it with message
		const fullMessage = subtitle ? `${subtitle}\n${message}` : message

		await new Promise<void>((resolve, reject) => {
			notifier.notify(
				{
					title: title,
					message: fullMessage,
					icon: iconPath,
					sound: true,
					wait: false,
					appID: "Roo Code",
				},
				(error: Error | null) => {
					if (error) {
						reject(error)
					} else {
						resolve()
					}
				},
			)
		})
	} catch (error) {
		// Fallback to PowerShell if node-notifier fails
		console.warn("node-notifier failed, falling back to PowerShell:", error)

		const script = `
		[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
		[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

		$template = @"
		<toast>
			<visual>
				<binding template="ToastText02">
					<text id="1">${subtitle}</text>
					<text id="2">${message}</text>
				</binding>
			</visual>
		</toast>
"@

		$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
		$xml.LoadXml($template)
		$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
		[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Roo Code").Show($toast)
		`

		try {
			await execa("powershell", ["-Command", script])
		} catch (psError) {
			throw new Error(`Failed to show Windows notification: ${psError}`)
		}
	}
}

async function showLinuxNotification(options: NotificationOptions): Promise<void> {
	const { title = "Roo Code", subtitle = "", message } = options

	try {
		// Use node-notifier for Linux
		const notifier = await import("node-notifier")
		const iconPath = path.join(__dirname, "..", "..", "assets", "icons", "icon.png")

		// Combine subtitle and message for node-notifier
		const fullMessage = subtitle ? `${subtitle}\n${message}` : message

		await new Promise<void>((resolve, reject) => {
			notifier.notify(
				{
					title: title,
					message: fullMessage,
					icon: iconPath,
					sound: true,
					wait: false,
				},
				(error: Error | null) => {
					if (error) {
						reject(error)
					} else {
						resolve()
					}
				},
			)
		})
	} catch (error) {
		// Fallback to notify-send if node-notifier fails
		console.warn("node-notifier failed, falling back to notify-send:", error)

		// Combine subtitle and message if subtitle exists
		const fullMessage = subtitle ? `${subtitle}\n${message}` : message

		try {
			await execa("notify-send", [
				title,
				fullMessage,
				"-i",
				path.join(__dirname, "..", "..", "assets", "icons", "icon.png"),
			])
		} catch (notifySendError: any) {
			if (notifySendError.code === "ENOENT") {
				throw new Error(
					"notify-send is not installed. Please install libnotify-bin (apt install libnotify-bin on Debian/Ubuntu)",
				)
			}
			throw new Error(`Failed to show Linux notification: ${notifySendError}`)
		}
	}
}

export async function showSystemNotification(options: NotificationOptions): Promise<void> {
	try {
		if (vscode.window.state.focused && !options.force) {
			// If the window is focused, do not show a notification
			return
		}

		const { title = "Roo Code", message } = options

		if (!message) {
			throw new Error("Message is required")
		}

		const escape = (str: string = "") => str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
		const escapedOptions = {
			...options,
			title: escape(title),
			message: escape(message),
			subtitle: escape(options.subtitle),
		}

		switch (platform()) {
			case "darwin":
				await showMacOSNotification(escapedOptions)
				break
			case "win32":
				await showWindowsNotification(escapedOptions)
				break
			case "linux":
				await showLinuxNotification(escapedOptions)
				break
			default:
				throw new Error("Unsupported platform")
		}
	} catch (error) {
		console.error("Could not show system notification", error)
	}
}
