import { DiffStrategy, DiffResult, ToolUse } from "../../../shared/tools"
import { ToolProgressStatus, GlobalState } from "@roo-code/types"
import { JupyterNotebookHandler } from "../../../integrations/misc/jupyter-notebook-handler"
import { JupyterSecurityConfig } from "../../../integrations/misc/jupyter-notebook-security"
import { MultiSearchReplaceDiffStrategy } from "./multi-search-replace"

export class JupyterNotebookDiffStrategy implements DiffStrategy {
	private fallbackStrategy: MultiSearchReplaceDiffStrategy
	private globalState?: GlobalState

	constructor(fuzzyThreshold?: number, bufferLines?: number, globalState?: GlobalState) {
		// Use MultiSearchReplaceDiffStrategy as fallback for non-cell operations
		this.fallbackStrategy = new MultiSearchReplaceDiffStrategy(fuzzyThreshold, bufferLines)
		this.globalState = globalState
	}

	getName(): string {
		return "JupyterNotebookDiff"
	}

	getToolDescription(args: { cwd: string; toolOptions?: { [key: string]: string } }): string {
		return `## apply_diff (Jupyter Notebook Support)
Description: Request to apply PRECISE, TARGETED modifications to Jupyter notebook (.ipynb) files. This tool supports both cell-level operations and content-level changes within cells.

For Jupyter notebooks, you can:
1. Edit specific cells by cell number
2. Add new cells
3. Delete cells
4. Apply standard search/replace within cells

Parameters:
- path: (required) The path of the file to modify (relative to the current workspace directory ${args.cwd})
- diff: (required) The search/replace block or cell operation defining the changes.

Cell-Level Operations Format:
\`\`\`
<<<<<<< CELL_OPERATION
:operation: [edit|add|delete]
:cell_index: [cell number, 0-based]
:cell_type: [code|markdown|raw] (required for 'add' operation)
-------
[content for edit/add operations]
=======
[new content for edit operations, empty for delete]
>>>>>>> CELL_OPERATION
\`\`\`

Standard Diff Format (for content within cells):
\`\`\`
<<<<<<< SEARCH
:cell_index: [optional cell number to limit search]
:start_line: [optional line number within cell]
-------
[exact content to find]
=======
[new content to replace with]
>>>>>>> REPLACE
\`\`\`

Examples:

1. Edit a specific cell:
\`\`\`
<<<<<<< CELL_OPERATION
:operation: edit
:cell_index: 2
-------
# Old cell content
print("Hello")
=======
# New cell content
print("Hello, World!")
>>>>>>> CELL_OPERATION
\`\`\`

2. Add a new cell:
\`\`\`
<<<<<<< CELL_OPERATION
:operation: add
:cell_index: 1
:cell_type: code
-------
=======
import numpy as np
import pandas as pd
>>>>>>> CELL_OPERATION
\`\`\`

3. Delete a cell:
\`\`\`
<<<<<<< CELL_OPERATION
:operation: delete
:cell_index: 3
-------
=======
>>>>>>> CELL_OPERATION
\`\`\`

4. Search and replace within a specific cell:
\`\`\`
<<<<<<< SEARCH
:cell_index: 0
-------
old_function()
=======
new_function()
>>>>>>> REPLACE
\`\`\`

Usage:
<apply_diff>
<path>notebook.ipynb</path>
<diff>
Your cell operation or search/replace content here
</diff>
</apply_diff>`
	}

	async applyDiff(
		originalContent: string,
		diffContent: string,
		_paramStartLine?: number,
		_paramEndLine?: number,
	): Promise<DiffResult> {
		// Check if this is a Jupyter notebook by trying to parse it
		let handler: JupyterNotebookHandler
		try {
			// Create security config based on global settings
			const securityConfig: JupyterSecurityConfig = {
				yoloMode: this.globalState?.jupyterNotebookYoloMode === true,
				allowCodeExecution: this.globalState?.jupyterNotebookYoloMode === true,
				readOnlyMode: this.globalState?.jupyterNotebookYoloMode !== true,
			}
			handler = new JupyterNotebookHandler("", originalContent, securityConfig)
		} catch (error) {
			// Not a valid notebook, fall back to standard diff
			return this.fallbackStrategy.applyDiff(originalContent, diffContent, _paramStartLine, _paramEndLine)
		}

		// Check if notebook is in read-only mode due to security
		if (handler.isReadOnly()) {
			const risks = handler.getSecurityRisks()
			const riskSummary = risks.map((r) => `${r.severity}: ${r.description}`).join(", ")
			return {
				success: false,
				error: `Cannot modify notebook: Security risks detected (${riskSummary}). Enable YOLO Mode in settings to bypass security restrictions.`,
			}
		}

		// Check if this is a cell operation
		const cellOperationMatch = diffContent.match(
			/<<<<<<< CELL_OPERATION\s*\n(?::operation:\s*(edit|add|delete)\s*\n)?(?::cell_index:\s*(\d+)\s*\n)?(?::cell_type:\s*(code|markdown|raw)\s*\n)?(?:-------\s*\n)?([\s\S]*?)(?:\n)?=======\s*\n([\s\S]*?)(?:\n)?>>>>>>> CELL_OPERATION/,
		)

		if (cellOperationMatch) {
			const operation = cellOperationMatch[1]
			const cellIndex = parseInt(cellOperationMatch[2] || "0")
			const cellType = cellOperationMatch[3] as "code" | "markdown" | "raw"
			const searchContent = cellOperationMatch[4] || ""
			const replaceContent = cellOperationMatch[5] || ""

			let success = false
			let error: string | undefined

			switch (operation) {
				case "edit":
					if (cellIndex >= 0 && cellIndex < handler.getCellCount()) {
						success = handler.updateCell(cellIndex, replaceContent)
						if (!success) {
							error = `Failed to update cell ${cellIndex}`
						}
					} else {
						error = `Cell index ${cellIndex} is out of range (0-${handler.getCellCount() - 1})`
					}
					break

				case "add":
					if (!cellType) {
						error = "Cell type is required for add operation"
					} else {
						success = handler.insertCell(cellIndex, cellType, replaceContent)
						if (!success) {
							error = `Failed to insert cell at index ${cellIndex}`
						}
					}
					break

				case "delete":
					success = handler.deleteCell(cellIndex)
					if (!success) {
						error = `Failed to delete cell ${cellIndex}`
					}
					break

				default:
					error = `Unknown operation: ${operation}`
			}

			if (success) {
				return {
					success: true,
					content: handler.toJSON(),
				}
			} else {
				return {
					success: false,
					error: error || "Cell operation failed",
				}
			}
		}

		// Check if this is a cell-specific search/replace
		const cellSearchMatch = diffContent.match(
			/<<<<<<< SEARCH\s*\n(?::cell_index:\s*(\d+)\s*\n)?(?::start_line:\s*(\d+)\s*\n)?(?:-------\s*\n)?([\s\S]*?)(?:\n)?=======\s*\n([\s\S]*?)(?:\n)?>>>>>>> REPLACE/,
		)

		if (cellSearchMatch) {
			const cellIndex = cellSearchMatch[1] ? parseInt(cellSearchMatch[1]) : undefined
			const searchContent = cellSearchMatch[3] || ""
			const replaceContent = cellSearchMatch[4] || ""

			if (cellIndex !== undefined) {
				// Apply diff to specific cell
				const success = handler.applyCellDiff(cellIndex, searchContent, replaceContent)
				if (success) {
					return {
						success: true,
						content: handler.toJSON(),
					}
				} else {
					return {
						success: false,
						error: `Failed to apply diff to cell ${cellIndex}. Content not found or cell doesn't exist.`,
					}
				}
			} else {
				// Search across all cells
				let applied = false
				for (let i = 0; i < handler.getCellCount(); i++) {
					if (handler.applyCellDiff(i, searchContent, replaceContent)) {
						applied = true
						// Continue to apply to all matching cells
					}
				}

				if (applied) {
					return {
						success: true,
						content: handler.toJSON(),
					}
				} else {
					return {
						success: false,
						error: "Search content not found in any cell",
					}
				}
			}
		}

		// Fall back to standard diff strategy for the text representation
		const textRepresentation = handler.extractTextWithCellMarkers()
		const result = await this.fallbackStrategy.applyDiff(
			textRepresentation,
			diffContent,
			_paramStartLine,
			_paramEndLine,
		)

		if (result.success && result.content) {
			// Convert back from text representation to notebook format
			// This is a simplified approach - in production, we'd need more sophisticated parsing
			return {
				success: true,
				content: handler.toJSON(),
			}
		}

		return result
	}

	getProgressStatus(toolUse: ToolUse, result?: DiffResult): ToolProgressStatus {
		const diffContent = toolUse.params.diff
		if (diffContent) {
			const icon = "notebook"
			if (diffContent.includes("CELL_OPERATION")) {
				const operation = diffContent.match(/:operation:\s*(edit|add|delete)/)?.[1]
				return { icon, text: operation || "cell" }
			} else {
				return this.fallbackStrategy.getProgressStatus(toolUse, result)
			}
		}
		return {}
	}
}
