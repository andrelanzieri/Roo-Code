import * as vscode from "vscode"

export type FileEncoding = "utf-8" | "ascii" | "latin1" | "utf16le" | "ucs2" | "base64" | "hex" | "binary"

/**
 * Gets the configured file encoding from VSCode settings.
 * Falls back to "utf-8" if not configured.
 *
 * @returns The configured file encoding
 */
export function getFileEncoding(): FileEncoding {
	const config = vscode.workspace.getConfiguration("roo-cline")
	const encoding = config.get<FileEncoding>("fileEncoding")
	return encoding || "utf-8"
}

/**
 * Gets the file encoding as BufferEncoding for use with Node.js fs methods.
 *
 * @returns The configured file encoding as BufferEncoding
 */
export function getFileEncodingAsBufferEncoding(): BufferEncoding {
	return getFileEncoding() as BufferEncoding
}
