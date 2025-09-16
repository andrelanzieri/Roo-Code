import * as vscode from "vscode"
import * as path from "path"

/**
 * Checks if a file path is outside all workspace folders
 * @param filePath The file path to check
 * @returns true if the path is outside all workspace folders, false otherwise
 */
export function isPathOutsideWorkspace(filePath: string): boolean {
	// If there are no workspace folders, consider everything outside workspace for safety
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		return true
	}

	// Normalize and resolve the path to handle .. and . components correctly
	const absolutePath = path.resolve(filePath)
	const normalizedPath = path.normalize(absolutePath)

	// Check if the path is within any workspace folder
	// This properly supports multi-root workspaces by checking against ALL folders
	for (const folder of vscode.workspace.workspaceFolders) {
		const folderPath = path.normalize(folder.uri.fsPath)

		// Path is inside a workspace if it equals the workspace path or is a subfolder
		if (normalizedPath === folderPath || normalizedPath.startsWith(folderPath + path.sep)) {
			return false // Path is inside this workspace folder
		}
	}

	// Path is not in any workspace folder
	return true
}

/**
 * Get the workspace folder that contains the given path
 * @param filePath The file path to check
 * @returns The workspace folder URI if found, undefined otherwise
 */
export function getContainingWorkspaceFolder(filePath: string): vscode.WorkspaceFolder | undefined {
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		return undefined
	}

	const absolutePath = path.resolve(filePath)
	const normalizedPath = path.normalize(absolutePath)

	// Find the workspace folder that contains this path
	return vscode.workspace.workspaceFolders.find((folder) => {
		const folderPath = path.normalize(folder.uri.fsPath)
		return normalizedPath === folderPath || normalizedPath.startsWith(folderPath + path.sep)
	})
}
