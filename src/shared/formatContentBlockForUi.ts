import { Anthropic } from "@anthropic-ai/sdk"

/**
 * UI-safe formatter for ContentBlockParam that avoids including large or sensitive payloads
 * such as full file contents, diffs, or oversized text in UI messages (ui_messages.json).
 *
 * IMPORTANT:
 * - This is ONLY for rendering content into UI messages (e.g., api_req_started.request).
 * - Do NOT use this for API conversation history or export; those need full fidelity.
 */
export function formatContentBlockForUi(block: Anthropic.Messages.ContentBlockParam): string {
	switch (block.type) {
		case "text":
			return sanitizeText(block.text ?? "")
		case "image":
			return "[Image]"
		case "tool_use":
			return summarizeToolUse(block)
		case "tool_result":
			if (typeof block.content === "string") {
				return sanitizeText(block.content)
			} else if (Array.isArray(block.content)) {
				// Recursively sanitize nested blocks
				return block.content.map(formatContentBlockForUi).join("\n")
			} else {
				return "[Tool Result]"
			}
		default:
			return `[${block.type}]`
	}
}

/**
 * Summarize tool_use without dumping large params (like diff/content).
 */
function summarizeToolUse(block: Anthropic.Messages.ToolUseBlockParam): string {
	const name = block.name
	// Try to extract relevant lightweight params for display
	try {
		const params = (block as any)?.input ?? (block as any)?.params ?? {}
		// Prefer path if present
		const directPath = params?.path as string | undefined

		// For XML args (e.g., read_file, apply_diff multi-file), collect a small summary of paths
		const xmlArgs = typeof params?.args === "string" ? params.args : undefined
		const pathsFromXml = xmlArgs ? extractPathsFromXml(xmlArgs) : []

		if (name === "read_file") {
			const paths = directPath ? [directPath] : pathsFromXml
			if (paths.length === 0) return `[Tool Use: ${name}]`
			if (paths.length === 1) return `[Tool Use: ${name}] ${paths[0]}`
			return `[Tool Use: ${name}] ${paths[0]} (+${paths.length - 1} more)`
		}

		if (
			name === "apply_diff" ||
			name === "insert_content" ||
			name === "search_and_replace" ||
			name === "write_to_file"
		) {
			const paths = directPath ? [directPath] : pathsFromXml
			if (paths.length === 0) return `[Tool Use: ${name}]`
			if (paths.length === 1) return `[Tool Use: ${name}] ${paths[0]}`
			return `[Tool Use: ${name}] ${paths[0]} (+${paths.length - 1} more)`
		}

		if (name === "search_files") {
			const regex = params?.regex ? ` regex="${String(params.regex)}"` : ""
			const fp = params?.file_pattern ? ` file_pattern="${String(params.file_pattern)}"` : ""
			const p = params?.path ? ` ${String(params.path)}` : ""
			return `[Tool Use: ${name}]${p}${regex}${fp}`
		}

		// Default: show name only
		return `[Tool Use: ${name}]`
	} catch {
		return `[Tool Use: ${block.name}]`
	}
}

/**
 * Sanitize a text chunk for UI:
 * - Collapse <files> XML to a per-file summary (hide <content> bodies)
 * - Truncate very long text
 * - Redact obvious diff blobs
 */
function sanitizeText(text: string): string {
	if (!text) return ""

	// If this looks like a files XML, summarize paths/errors/notices and drop content bodies
	if (text.includes("<files") || text.includes("<files")) {
		return summarizeFilesXml(text)
	}

	// If this contains diff markers, replace with a short placeholder
	if (looksLikeDiff(text)) {
		return "[diff content omitted]"
	}

	// Generic truncation to keep UI light-weight
	const MAX = 2000
	if (text.length > MAX) {
		const omitted = text.length - MAX
		return `${text.slice(0, MAX)}\n[omitted ${omitted} chars]`
	}

	return text
}

function looksLikeDiff(s: string): boolean {
	return (
		s.includes("<<<<<<< SEARCH") ||
		s.includes(">>>>>>> REPLACE") ||
		s.includes("<<<<<<< SEARCH") ||
		s.includes(">>>>>>> REPLACE") ||
		/^diff --git/m.test(s)
	)
}

/**
 * Summarize a <files> XML payload by listing file paths and high-level status,
 * but never including <content> bodies.
 */
function summarizeFilesXml(xmlLike: string): string {
	// Support both escaped and unescaped tags
	const decode = (s: string) => s.replace(/</g, "<").replace(/>/g, ">").replace(/&/g, "&")

	const raw = decode(xmlLike)
	const fileRegex = /<file>([\s\S]*?)<\/file>/g
	const items: string[] = []
	let match: RegExpExecArray | null

	while ((match = fileRegex.exec(raw)) !== null) {
		const fileBlock = match[1]
		const path = matchOne(fileBlock, /<path>([\s\S]*?)<\/path>/)
		const error = matchOne(fileBlock, /<error>([\s\S]*?)<\/error>/)
		const notice = matchOne(fileBlock, /<notice>([\s\S]*?)<\/notice>/)
		const binary = matchOne(fileBlock, /<binary_file(?:[^>]*)>([\s\S]*?)<\/binary_file>/)

		let line = path ? `- ${path}` : "- [unknown path]"
		if (error) line += ` [error: ${singleLine(error)}]`
		if (!error && binary) line += " [binary file]"
		if (!error && !binary && notice) line += ` [${singleLine(notice)}]`

		items.push(line)
	}

	if (items.length === 0) {
		return "[files omitted]"
	}

	const MAX_ITEMS = 20
	let output = items.slice(0, MAX_ITEMS).join("\n")
	if (items.length > MAX_ITEMS) {
		output += `\n[+${items.length - MAX_ITEMS} more files]`
	}
	return output
}

function extractPathsFromXml(xml: string): string[] {
	const decode = (s: string) => s.replace(/</g, "<").replace(/>/g, ">").replace(/&/g, "&")
	const raw = decode(xml)
	const pathRegex = /<path>([\s\S]*?)<\/path>/g
	const paths: string[] = []
	let m: RegExpExecArray | null
	while ((m = pathRegex.exec(raw)) !== null) {
		paths.push(m[1])
	}
	return paths
}

function matchOne(source: string, re: RegExp): string | undefined {
	const m = re.exec(source)
	return m ? m[1] : undefined
}

function singleLine(s: string): string {
	return s.replace(/\s+/g, " ").trim()
}
