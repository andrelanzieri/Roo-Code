import * as fs from "fs/promises"
import * as path from "path"
import { addLineNumbers } from "./extract-text"
import { JupyterNotebookSecurity, SecurityValidationResult, JupyterSecurityConfig } from "./jupyter-notebook-security"

export interface JupyterCell {
	cell_type: "code" | "markdown" | "raw"
	source: string | string[]
	metadata?: Record<string, any>
	outputs?: any[]
	execution_count?: number | null
}

export interface JupyterNotebook {
	cells: JupyterCell[]
	metadata?: Record<string, any>
	nbformat?: number
	nbformat_minor?: number
}

export interface CellReference {
	index: number
	type: "code" | "markdown" | "raw"
	content: string
	lineStart: number
	lineEnd: number
}

export class JupyterNotebookHandler {
	private notebook: JupyterNotebook
	private filePath: string
	private cellReferences: CellReference[] = []
	private security: JupyterNotebookSecurity
	private securityValidation?: SecurityValidationResult

	constructor(filePath: string, notebookContent?: string, securityConfig?: JupyterSecurityConfig) {
		this.filePath = filePath
		this.security = new JupyterNotebookSecurity(securityConfig)

		if (notebookContent) {
			this.notebook = JSON.parse(notebookContent)
			this.buildCellReferences()
			// Validate security on load
			this.securityValidation = this.security.validateNotebook(this.notebook, filePath)
			// Use sanitized notebook if available and not in YOLO mode
			if (this.securityValidation.sanitizedNotebook && !this.security.isYoloModeEnabled()) {
				this.notebook = this.securityValidation.sanitizedNotebook
				this.buildCellReferences()
			}
		} else {
			this.notebook = { cells: [] }
		}
	}

	/**
	 * Load a Jupyter notebook from file
	 */
	static async fromFile(filePath: string, securityConfig?: JupyterSecurityConfig): Promise<JupyterNotebookHandler> {
		const content = await fs.readFile(filePath, "utf8")
		return new JupyterNotebookHandler(filePath, content, securityConfig)
	}

	/**
	 * Build cell references with line number mappings
	 */
	private buildCellReferences(): void {
		this.cellReferences = []
		let currentLine = 1

		this.notebook.cells.forEach((cell, index) => {
			const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""
			const lines = source.split("\n")
			const lineCount = lines.length

			this.cellReferences.push({
				index,
				type: cell.cell_type,
				content: source,
				lineStart: currentLine,
				lineEnd: currentLine + lineCount - 1,
			})

			currentLine += lineCount + 1 // Add 1 for cell separator
		})
	}

	/**
	 * Get cell at a specific line number
	 */
	getCellAtLine(lineNumber: number): CellReference | undefined {
		return this.cellReferences.find((ref) => lineNumber >= ref.lineStart && lineNumber <= ref.lineEnd)
	}

	/**
	 * Get cell by index
	 */
	getCellByIndex(index: number): JupyterCell | undefined {
		return this.notebook.cells[index]
	}

	/**
	 * Extract text with cell markers for better readability
	 */
	extractTextWithCellMarkers(): string {
		let result = ""
		let lineNumber = 1

		this.notebook.cells.forEach((cell, index) => {
			const cellType = cell.cell_type
			const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""

			// Add cell header
			result += `# %%% Cell ${index + 1} [${cellType}]\n`

			// Add cell content with line numbers
			const lines = source.split("\n")
			lines.forEach((line) => {
				result += `${String(lineNumber).padStart(4, " ")} | ${line}\n`
				lineNumber++
			})

			// Add cell separator
			result += "\n"
			lineNumber++ // Account for the separator line
		})

		return result
	}

	/**
	 * Extract text from specific cells
	 */
	extractCellsText(cellIndices?: number[]): string {
		let result = ""
		const cellsToExtract = cellIndices
			? this.notebook.cells.filter((_, index) => cellIndices.includes(index))
			: this.notebook.cells

		cellsToExtract.forEach((cell, idx) => {
			const actualIndex = cellIndices ? cellIndices[idx] : idx
			const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""

			result += `# Cell ${actualIndex + 1} [${cell.cell_type}]\n`
			result += source
			result += "\n\n"
		})

		return result
	}

	/**
	 * Update a specific cell's content
	 */
	updateCell(cellIndex: number, newContent: string): boolean {
		// Check if read-only mode is enforced
		if (this.isReadOnly()) {
			console.warn("Cannot update cell: Notebook is in read-only mode due to security restrictions")
			return false
		}

		if (cellIndex < 0 || cellIndex >= this.notebook.cells.length) {
			return false
		}

		const cell = this.notebook.cells[cellIndex]
		// Preserve the original format (array vs string)
		if (Array.isArray(cell.source)) {
			// Split content and ensure each line ends with \n except the last
			const lines = newContent.split("\n")
			cell.source = lines.map((line, idx) => (idx === lines.length - 1 && line === "" ? line : line + "\n"))
			// Remove trailing empty string if it exists
			if (cell.source[cell.source.length - 1] === "") {
				cell.source.pop()
			}
		} else {
			cell.source = newContent
		}

		// Rebuild references after update
		this.buildCellReferences()
		return true
	}

	/**
	 * Insert a new cell
	 */
	insertCell(index: number, cellType: "code" | "markdown" | "raw", content: string): boolean {
		// Check if read-only mode is enforced
		if (this.isReadOnly()) {
			console.warn("Cannot insert cell: Notebook is in read-only mode due to security restrictions")
			return false
		}

		if (index < 0 || index > this.notebook.cells.length) {
			return false
		}

		const newCell: JupyterCell = {
			cell_type: cellType,
			source: content
				.split("\n")
				.map((line, idx, arr) => (idx === arr.length - 1 && line === "" ? line : line + "\n")),
			metadata: {},
		}

		if (cellType === "code") {
			newCell.outputs = []
			newCell.execution_count = null
		}

		this.notebook.cells.splice(index, 0, newCell)
		this.buildCellReferences()
		return true
	}

	/**
	 * Delete a cell
	 */
	deleteCell(index: number): boolean {
		// Check if read-only mode is enforced
		if (this.isReadOnly()) {
			console.warn("Cannot delete cell: Notebook is in read-only mode due to security restrictions")
			return false
		}

		if (index < 0 || index >= this.notebook.cells.length) {
			return false
		}

		this.notebook.cells.splice(index, 1)
		this.buildCellReferences()
		return true
	}

	/**
	 * Apply a diff to a specific cell
	 */
	applyCellDiff(cellIndex: number, searchContent: string, replaceContent: string): boolean {
		const cell = this.getCellByIndex(cellIndex)
		if (!cell) {
			return false
		}

		const currentContent = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""

		// Simple exact match replacement for now
		if (currentContent.includes(searchContent)) {
			const newContent = currentContent.replace(searchContent, replaceContent)
			return this.updateCell(cellIndex, newContent)
		}

		return false
	}

	/**
	 * Save the notebook back to file
	 */
	async save(): Promise<void> {
		// Check if read-only mode is enforced
		if (this.isReadOnly()) {
			throw new Error("Cannot save notebook: Notebook is in read-only mode due to security restrictions")
		}

		const content = JSON.stringify(this.notebook, null, 2)
		await fs.writeFile(this.filePath, content, "utf8")
	}

	/**
	 * Get the notebook as JSON string
	 */
	toJSON(): string {
		return JSON.stringify(this.notebook, null, 2)
	}

	/**
	 * Get cell count
	 */
	getCellCount(): number {
		return this.notebook.cells.length
	}

	/**
	 * Get all cells of a specific type
	 */
	getCellsByType(cellType: "code" | "markdown" | "raw"): Array<{ index: number; cell: JupyterCell }> {
		return this.notebook.cells
			.map((cell, index) => ({ index, cell }))
			.filter(({ cell }) => cell.cell_type === cellType)
	}

	/**
	 * Search for content in cells
	 */
	searchInCells(searchTerm: string): Array<{ cellIndex: number; matches: string[] }> {
		const results: Array<{ cellIndex: number; matches: string[] }> = []

		this.notebook.cells.forEach((cell, index) => {
			const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""
			const lines = source.split("\n")
			const matches = lines.filter((line) => line.includes(searchTerm))

			if (matches.length > 0) {
				results.push({ cellIndex: index, matches })
			}
		})

		return results
	}

	/**
	 * Create a checkpoint-friendly representation
	 */
	getCheckpointRepresentation(): string {
		return this.extractTextWithCellMarkers()
	}

	/**
	 * Restore from checkpoint representation
	 */
	static fromCheckpointRepresentation(checkpointContent: string, originalNotebook: JupyterNotebook): JupyterNotebook {
		// Parse the checkpoint content and reconstruct cells
		const lines = checkpointContent.split("\n")
		const cells: JupyterCell[] = []
		let currentCell: JupyterCell | null = null
		let currentContent: string[] = []

		for (const line of lines) {
			// Check for cell marker
			const cellMarkerMatch = line.match(/^# %%% Cell (\d+) \[(code|markdown|raw)\]$/)
			if (cellMarkerMatch) {
				// Save previous cell if exists
				if (currentCell) {
					currentCell.source = currentContent.join("\n")
					cells.push(currentCell)
				}

				// Start new cell
				const cellIndex = parseInt(cellMarkerMatch[1]) - 1
				const cellType = cellMarkerMatch[2] as "code" | "markdown" | "raw"

				// Try to preserve metadata from original
				const originalCell = originalNotebook.cells[cellIndex]
				currentCell = {
					cell_type: cellType,
					source: "",
					metadata: originalCell?.metadata || {},
				}

				if (cellType === "code") {
					currentCell.outputs = originalCell?.outputs || []
					currentCell.execution_count = originalCell?.execution_count || null
				}

				currentContent = []
			} else if (line.match(/^\s*\d+\s*\|/)) {
				// Extract content from numbered line
				const content = line.replace(/^\s*\d+\s*\|\s?/, "")
				currentContent.push(content)
			}
		}

		// Save last cell
		if (currentCell) {
			currentCell.source = currentContent.join("\n")
			cells.push(currentCell)
		}

		return {
			...originalNotebook,
			cells,
		}
	}

	/**
	 * Get security validation results
	 */
	getSecurityValidation(): SecurityValidationResult | undefined {
		return this.securityValidation
	}

	/**
	 * Check if notebook is in read-only mode
	 */
	isReadOnly(): boolean {
		return this.securityValidation?.requiresReadOnly === true && !this.security.isYoloModeEnabled()
	}

	/**
	 * Check if notebook has security risks
	 */
	hasSecurityRisks(): boolean {
		return (this.securityValidation?.risks.length ?? 0) > 0
	}

	/**
	 * Get security risks
	 */
	getSecurityRisks() {
		return this.securityValidation?.risks || []
	}

	/**
	 * Enable or disable YOLO Mode
	 */
	setYoloMode(enabled: boolean): void {
		this.security.updateConfig({ yoloMode: enabled })
		// Re-validate with new settings
		this.securityValidation = this.security.validateNotebook(this.notebook, this.filePath)
	}
}
