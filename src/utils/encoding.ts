/**
 * Supported encodings for reading/writing text files.
 *
 * Note: VS Code and Node accept both "utf8" and "utf-8" at runtime. We allow both and normalize
 * when passing to Node's fs APIs.
 */
export type FileEncoding = "utf-8" | "utf8" | "ascii" | "latin1" | "utf16le" | "ucs2" | "base64" | "hex" | "binary"

/**
 * Minimal, dependency-free encoding type compatible with Node's fs encoding strings.
 * (We avoid referencing the global `BufferEncoding` type to keep this file usable even when
 * Node/VS Code type packages aren't included in the current TS config.)
 */
export type BufferEncodingLike = "utf8" | "ascii" | "latin1" | "utf16le" | "ucs2" | "base64" | "hex" | "binary"

// `require` is provided by Node in the VS Code extension runtime, but may not be present in TS type libs here.
// We declare it locally to avoid depending on Node type packages.
declare const require: (id: string) => any

const DEFAULT_FILE_ENCODING: FileEncoding = "utf-8"

const FILE_ENCODING_TO_BUFFER_ENCODING: Record<FileEncoding, BufferEncodingLike> = {
	"utf-8": "utf8",
	utf8: "utf8",
	ascii: "ascii",
	latin1: "latin1",
	utf16le: "utf16le",
	ucs2: "ucs2",
	base64: "base64",
	hex: "hex",
	binary: "binary",
}

function getVscodeConfigurationValue<T>(section: string, key: string, defaultValue: T): T {
	try {
		const vscode = require("vscode") as any
		const config = vscode?.workspace?.getConfiguration?.(section)
		const value = config?.get?.(key, defaultValue)
		return (value ?? defaultValue) as T
	} catch {
		return defaultValue
	}
}

export class Encoding {
	/**
	 * Gets the configured file encoding from VSCode settings.
	 * Falls back to "utf-8" if not configured.
	 */
	static getFileEncoding(): FileEncoding {
		return getVscodeConfigurationValue<FileEncoding>("roo-cline", "fileEncoding", DEFAULT_FILE_ENCODING)
	}

	/**
	 * Gets the file encoding for use with Node.js `fs` methods.
	 */
	static getFileEncodingAsBufferEncoding(): BufferEncodingLike {
		return FILE_ENCODING_TO_BUFFER_ENCODING[Encoding.getFileEncoding()] ?? "utf8"
	}
}

/**
 * Gets the configured file encoding from VSCode settings.
 * Falls back to "utf-8" if not configured.
 *
 * @returns The configured file encoding
 */
export function getFileEncoding(): FileEncoding {
	return Encoding.getFileEncoding()
}

/**
 * Gets the file encoding as BufferEncoding for use with Node.js fs methods.
 *
 * @returns The configured file encoding as BufferEncoding
 */
export function getFileEncodingAsBufferEncoding(): BufferEncodingLike {
	return Encoding.getFileEncodingAsBufferEncoding()
}
