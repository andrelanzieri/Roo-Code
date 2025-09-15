import * as vscode from "vscode"
import { exec } from "child_process"
import { promisify } from "util"
import * as fs from "fs/promises"
import * as path from "path"

const execAsync = promisify(exec)

/**
 * Detects the current environment and its characteristics
 */
export interface EnvironmentInfo {
	isCodespaces: boolean
	isContainer: boolean
	isLinux: boolean
	hasDocker: boolean
	hasSystemChrome: boolean
	missingDependencies: string[]
}

/**
 * Chrome/Chromium dependencies required for headless operation
 */
const CHROME_DEPENDENCIES = [
	"libatk-1.0.so.0",
	"libatk-bridge-2.0.so.0",
	"libcups.so.2",
	"libdrm.so.2",
	"libxkbcommon.so.0",
	"libxcomposite.so.1",
	"libxdamage.so.1",
	"libxfixes.so.3",
	"libxrandr.so.2",
	"libgbm.so.1",
	"libasound.so.2",
	"libatspi.so.0",
	"libgtk-3.so.0",
	"libpango-1.0.so.0",
	"libcairo.so.2",
	"libxshmfence.so.1",
	"libnss3.so",
	"libnssutil3.so",
	"libnspr4.so",
]

/**
 * Package names for installing Chrome dependencies
 */
const DEPENDENCY_PACKAGES = [
	"libatk1.0-0",
	"libatk-bridge2.0-0",
	"libcups2",
	"libdrm2",
	"libxkbcommon0",
	"libxcomposite1",
	"libxdamage1",
	"libxfixes3",
	"libxrandr2",
	"libgbm1",
	"libasound2",
	"libatspi2.0-0",
	"libgtk-3-0",
	"libpango-1.0-0",
	"libcairo2",
	"libxshmfence1",
	"libnss3",
	"libnssutil3",
	"libnspr4",
	"libx11-xcb1",
	"libxcb-dri3-0",
]

/**
 * Detects the current environment
 */
export async function detectEnvironment(): Promise<EnvironmentInfo> {
	const isCodespaces = process.env.CODESPACES === "true"
	const isContainer = await checkIfContainer()
	const isLinux = process.platform === "linux"
	const hasDocker = await checkDockerAvailable()
	const hasSystemChrome = await checkSystemChrome()
	const missingDependencies = isLinux ? await checkMissingDependencies() : []

	return {
		isCodespaces,
		isContainer,
		isLinux,
		hasDocker,
		hasSystemChrome,
		missingDependencies,
	}
}

/**
 * Checks if running inside a container
 */
async function checkIfContainer(): Promise<boolean> {
	try {
		// Check for .dockerenv file
		await fs.access("/.dockerenv")
		return true
	} catch {
		// Check for container indicators in cgroup
		try {
			const cgroup = await fs.readFile("/proc/1/cgroup", "utf-8")
			return cgroup.includes("docker") || cgroup.includes("containerd") || cgroup.includes("kubepods")
		} catch {
			return false
		}
	}
}

/**
 * Checks if Docker is available
 */
async function checkDockerAvailable(): Promise<boolean> {
	try {
		const { stdout } = await execAsync("docker --version")
		return stdout.includes("Docker")
	} catch {
		return false
	}
}

/**
 * Checks if system Chrome/Chromium is available
 */
async function checkSystemChrome(): Promise<boolean> {
	const chromePaths = [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/snap/bin/chromium",
	]

	for (const chromePath of chromePaths) {
		try {
			await fs.access(chromePath)
			return true
		} catch {
			// Continue checking other paths
		}
	}

	// Also check via which command
	try {
		await execAsync("which google-chrome || which chromium || which chromium-browser")
		return true
	} catch {
		return false
	}
}

/**
 * Checks for missing Chrome dependencies
 */
async function checkMissingDependencies(): Promise<string[]> {
	const missing: string[] = []

	for (const dep of CHROME_DEPENDENCIES) {
		try {
			// Try to find the library using ldconfig
			const { stdout } = await execAsync(`ldconfig -p | grep ${dep}`)
			if (!stdout) {
				missing.push(dep)
			}
		} catch {
			missing.push(dep)
		}
	}

	return missing
}

/**
 * Attempts to install missing Chrome dependencies
 */
export async function installChromeDependencies(context: vscode.ExtensionContext): Promise<boolean> {
	const env = await detectEnvironment()

	if (!env.isLinux || env.missingDependencies.length === 0) {
		return true
	}

	// Check if we have sudo access
	try {
		await execAsync("sudo -n true")
	} catch {
		vscode.window.showErrorMessage(
			"Chrome dependencies are missing but sudo access is required to install them. " +
				"Please run: sudo apt-get update && sudo apt-get install -y " +
				DEPENDENCY_PACKAGES.join(" "),
		)
		return false
	}

	// Show progress notification
	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Installing Chrome dependencies...",
			cancellable: false,
		},
		async (progress) => {
			try {
				progress.report({ message: "Updating package lists..." })
				await execAsync("sudo apt-get update")

				progress.report({ message: "Installing dependencies..." })
				const packages = DEPENDENCY_PACKAGES.join(" ")
				await execAsync(`sudo apt-get install -y ${packages}`)

				// Install Chrome if not present
				if (!env.hasSystemChrome) {
					progress.report({ message: "Installing Google Chrome..." })
					await installChrome()
				}

				vscode.window.showInformationMessage("Chrome dependencies installed successfully!")
				return true
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to install Chrome dependencies: ${error.message}. ` +
						"Please install them manually with: sudo apt-get install -y " +
						DEPENDENCY_PACKAGES.join(" "),
				)
				return false
			}
		},
	)
}

/**
 * Installs Google Chrome
 */
async function installChrome(): Promise<void> {
	const commands = [
		"wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -",
		"sudo sh -c 'echo \"deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main\" >> /etc/apt/sources.list.d/google.list'",
		"sudo apt-get update",
		"sudo apt-get install -y google-chrome-stable",
	]

	for (const cmd of commands) {
		await execAsync(cmd)
	}
}

/**
 * Gets the path to system Chrome/Chromium if available
 */
export async function getSystemChromePath(): Promise<string | null> {
	const chromePaths = [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/snap/bin/chromium",
	]

	for (const chromePath of chromePaths) {
		try {
			await fs.access(chromePath)
			return chromePath
		} catch {
			// Continue checking other paths
		}
	}

	return null
}

/**
 * Configuration for Docker-based browser
 */
export interface DockerBrowserConfig {
	enabled: boolean
	image: string
	autoStart: boolean
}

/**
 * Gets Docker browser configuration from settings
 */
export function getDockerBrowserConfig(context: vscode.ExtensionContext): DockerBrowserConfig {
	const config = vscode.workspace.getConfiguration("roo-code")

	return {
		enabled: config.get<boolean>("browserDocker.enabled", false),
		image: config.get<string>("browserDocker.image", "browserless/chrome:latest"),
		autoStart: config.get<boolean>("browserDocker.autoStart", true),
	}
}

/**
 * Starts a Docker container for browser operations
 */
export async function startDockerBrowser(config: DockerBrowserConfig): Promise<string | null> {
	try {
		// Check if container already exists
		const { stdout: existingContainer } = await execAsync(
			"docker ps -a --filter name=roo-browser --format '{{.Names}}'",
		)

		if (existingContainer.includes("roo-browser")) {
			// Start existing container
			await execAsync("docker start roo-browser")
		} else {
			// Create and start new container
			await execAsync(`docker run -d --name roo-browser -p 3000:3000 --rm ${config.image}`)
		}

		// Wait for container to be ready
		await new Promise((resolve) => setTimeout(resolve, 3000))

		// Return the WebSocket endpoint
		return "ws://localhost:3000"
	} catch (error) {
		console.error("Failed to start Docker browser:", error)
		return null
	}
}

/**
 * Stops the Docker browser container
 */
export async function stopDockerBrowser(): Promise<void> {
	try {
		await execAsync("docker stop roo-browser")
	} catch {
		// Container might not be running
	}
}
