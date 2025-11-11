import { parsePatch } from "diff"

export interface DiffLine {
	oldLineNum: number | null
	newLineNum: number | null
	type: "context" | "addition" | "deletion" | "gap"
	content: string
	hiddenCount?: number
}

/**
 * Parse a unified diff string into a flat list of renderable lines with
 * line numbers, addition/deletion/context flags, and compact "gap" separators
 * between hunks.
 */
export function parseUnifiedDiff(source: string, filePath?: string): DiffLine[] {
	if (!source) return []

	try {
		const patches = parsePatch(source)
		if (!patches || patches.length === 0) return []

		const patch = filePath
			? (patches.find((p) =>
					[p.newFileName, p.oldFileName].some(
						(n) => typeof n === "string" && (n === filePath || (n as string).endsWith("/" + filePath)),
					),
				) ?? patches[0])
			: patches[0]

		if (!patch) return []

		const lines: DiffLine[] = []
		let prevHunk: any = null
		for (const hunk of (patch as any).hunks || []) {
			// Insert a compact "hidden lines" separator between hunks
			if (prevHunk) {
				const gapNew = hunk.newStart - (prevHunk.newStart + prevHunk.newLines)
				const gapOld = hunk.oldStart - (prevHunk.oldStart + prevHunk.oldLines)
				const hidden = Math.max(gapNew, gapOld)
				if (hidden > 0) {
					lines.push({
						oldLineNum: null,
						newLineNum: null,
						type: "gap",
						content: "",
						hiddenCount: hidden,
					})
				}
			}

			let oldLine = hunk.oldStart
			let newLine = hunk.newStart

			for (const raw of hunk.lines || []) {
				const firstChar = (raw as string)[0]
				const content = (raw as string).slice(1)

				if (firstChar === "-") {
					lines.push({
						oldLineNum: oldLine,
						newLineNum: null,
						type: "deletion",
						content,
					})
					oldLine++
				} else if (firstChar === "+") {
					lines.push({
						oldLineNum: null,
						newLineNum: newLine,
						type: "addition",
						content,
					})
					newLine++
				} else {
					// Context line
					lines.push({
						oldLineNum: oldLine,
						newLineNum: newLine,
						type: "context",
						content,
					})
					oldLine++
					newLine++
				}
			}

			prevHunk = hunk
		}

		// Collapse "- line" then "+ same line" pairs into a single context line.
		// This normalizes diffs where the only change is adding a trailing newline
		// (common when appending to a file missing EOF newline). VS Code's diff
		// shows these as unchanged; our chat view should too.
		const collapseReplacePairs = (input: DiffLine[]): DiffLine[] => {
			const out: DiffLine[] = []
			for (let i = 0; i < input.length; i++) {
				const cur = input[i]
				const next = input[i + 1]
				if (
					cur &&
					next &&
					cur.type === "deletion" &&
					next.type === "addition" &&
					cur.content === next.content
				) {
					out.push({
						oldLineNum: cur.oldLineNum,
						newLineNum: next.newLineNum,
						type: "context",
						content: cur.content,
					})
					i++ // skip the paired addition
					continue
				}
				out.push(cur)
			}
			return out
		}

		return collapseReplacePairs(lines)
	} catch {
		// swallow parse errors and render nothing rather than breaking the UI
		return []
	}
}
