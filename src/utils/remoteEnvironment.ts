import * as vscode from "vscode"

/**
 * Detects if the extension is running in a remote environment
 * (Remote SSH, WSL, Dev Containers, Codespaces, etc.)
 */
export function isRemoteEnvironment(): boolean {
	// Check if we're in a remote extension host
	// vscode.env.remoteName will be defined in remote contexts
	// It will be 'ssh-remote' for SSH, 'wsl' for WSL, 'dev-container' for containers, etc.
	return typeof vscode.env.remoteName !== "undefined"
}

/**
 * Gets the type of remote environment if in one
 * @returns The remote name (e.g., 'ssh-remote', 'wsl', 'dev-container') or undefined if local
 */
export function getRemoteType(): string | undefined {
	return vscode.env.remoteName
}

/**
 * Gets a unique identifier for the remote workspace
 * This combines the remote type with workspace information to create
 * a stable identifier for the remote session
 */
export function getRemoteWorkspaceId(): string | undefined {
	if (!isRemoteEnvironment()) {
		return undefined
	}

	const remoteName = vscode.env.remoteName || "remote"
	const workspaceFolders = vscode.workspace.workspaceFolders

	if (workspaceFolders && workspaceFolders.length > 0) {
		// Use the first workspace folder's name and URI as part of the identifier
		const firstFolder = workspaceFolders[0]
		const folderName = firstFolder.name
		// Create a stable hash from the URI to avoid issues with special characters
		const uriHash = hashString(firstFolder.uri.toString())
		return `${remoteName}-${folderName}-${uriHash}`
	}

	// Fallback to just remote name if no workspace
	return remoteName
}

/**
 * Simple string hash function for creating stable identifiers
 */
function hashString(str: string): string {
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash // Convert to 32-bit integer
	}
	return Math.abs(hash).toString(36)
}

/**
 * Gets the appropriate storage base path for the current environment
 * In remote environments, this will include a remote-specific subdirectory
 * to keep remote and local chat histories separate
 */
export function getEnvironmentStoragePath(basePath: string): string {
	if (!isRemoteEnvironment()) {
		// Local environment - use the base path as-is
		return basePath
	}

	// Remote environment - add a remote-specific subdirectory
	const remoteId = getRemoteWorkspaceId()
	if (remoteId) {
		// Use path.join for proper path construction
		const path = require("path")
		return path.join(basePath, "remote", remoteId)
	}

	// Fallback to base path if we can't determine remote ID
	return basePath
}
