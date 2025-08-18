import * as fs from "fs"
import * as os from "os"

/**
 * Detects if the current environment is running inside WSL (Windows Subsystem for Linux)
 * @returns true if running in WSL, false otherwise
 */
export function isWSL(): boolean {
	// WSL detection based on multiple indicators

	// 1. Check for WSL environment variable (WSL 2)
	if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
		return true
	}

	// 2. Check for /proc/version containing Microsoft or WSL
	try {
		const procVersion = fs.readFileSync("/proc/version", "utf8")
		if (procVersion.toLowerCase().includes("microsoft") || procVersion.toLowerCase().includes("wsl")) {
			return true
		}
	} catch {
		// File doesn't exist or can't be read, not WSL
	}

	// 3. Check for /proc/sys/fs/binfmt_misc/WSLInterop (WSL 2)
	try {
		fs.accessSync("/proc/sys/fs/binfmt_misc/WSLInterop", fs.constants.F_OK)
		return true
	} catch {
		// File doesn't exist, might not be WSL 2
	}

	// 4. Check if running on Linux but with Windows-style paths in environment
	if (process.platform === "linux") {
		// Check for Windows paths in PATH environment variable
		const pathEnv = process.env.PATH || ""
		if (pathEnv.includes("/mnt/c/") || pathEnv.includes("\\")) {
			return true
		}

		// Check for WSLENV variable (used for sharing environment variables between Windows and WSL)
		if (process.env.WSLENV) {
			return true
		}
	}

	return false
}

/**
 * Gets the Windows user home directory from within WSL
 * @returns The Windows home directory path or null if not in WSL or cannot determine
 */
export function getWindowsHomeFromWSL(): string | null {
	if (!isWSL()) {
		return null
	}

	// Try to get Windows username from environment
	const windowsUsername = process.env.WSL_USER_NAME || process.env.USER || os.userInfo().username

	// Common Windows home directory patterns in WSL
	const possiblePaths = [
		`/mnt/c/Users/${windowsUsername}`,
		`/mnt/c/users/${windowsUsername}`,
		`/mnt/d/Users/${windowsUsername}`,
		`/mnt/d/users/${windowsUsername}`,
	]

	// Check which path exists
	for (const path of possiblePaths) {
		try {
			fs.accessSync(path, fs.constants.F_OK)
			return path
		} catch {
			// Path doesn't exist, try next
		}
	}

	// Fallback: try to read from USERPROFILE if it's set (might be shared from Windows)
	if (process.env.USERPROFILE) {
		// Convert Windows path to WSL path (C:\Users\username -> /mnt/c/Users/username)
		const windowsPath = process.env.USERPROFILE
		const wslPath = windowsPath
			.replace(/^([A-Z]):/i, (_, drive) => `/mnt/${drive.toLowerCase()}`)
			.replace(/\\/g, "/")

		try {
			fs.accessSync(wslPath, fs.constants.F_OK)
			return wslPath
		} catch {
			// Path doesn't exist
		}
	}

	return null
}
