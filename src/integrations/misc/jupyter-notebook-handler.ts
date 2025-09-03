import * as fs from "fs/promises"
import * as path from "path"
import { addLineNumbers } from "./extract-text"
import {
	JupyterNotebookSecurity,
	SecurityConfig,
	SecurityValidationResult,
	createDefaultSecurity,
} from "./jupyter-notebook-security"

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
	private isReadOnly: boolean = false
	private validationResult?: SecurityValidationResult

	constructor(filePath: string, notebookContent?: string, securityConfig?: SecurityConfig) {
		this.filePath = filePath
		this.security = createDefaultSecurity(securityConfig)

		if (notebookContent) {
			this.notebook = JSON.parse(notebookContent)

			// Validate notebook on load
			this.validationResult = this.security.validateNotebook(this.notebook, filePath)

			// If notebook has security issues and we're in read-only mode, use sanitized version
			if (!this.validationResult.isValid && this.security.getConfig().readOnlyMode) {
				if (this.validationResult.sanitized) {
					this.notebook = this.validationResult.sanitized
					this.isReadOnly = true
				}
			}

			// Log security warnings if enabled
			if (this.security.getConfig().enableWarnings) {
				this.logSecurityWarnings()
			}

			this.buildCellReferences()
		} else {
			this.notebook = { cells: [] }
		}
	}

	/**
	 * Load a Jupyter notebook from file
	 */
	static async fromFile(filePath: string, securityConfig?: SecurityConfig): Promise<JupyterNotebookHandler> {
		const content = await fs.readFile(filePath, "utf8")
		return new JupyterNotebookHandler(filePath, content, securityConfig)
	}

	/**
	 * Log security warnings to console
	 */
	private logSecurityWarnings(): void {
		if (!this.validationResult) return

		if (this.validationResult.errors.length > 0) {
			console.error("🔴 Jupyter Notebook Security Errors:")
			this.validationResult.errors.forEach((error) => console.error(`  - ${error}`))
		}

		if (this.validationResult.warnings.length > 0) {
			console.warn("⚠️ Jupyter Notebook Security Warnings:")
			this.validationResult.warnings.forEach((warning) => console.warn(`  - ${warning}`))
		}

		if (this.isReadOnly) {
			console.warn("📝 Notebook opened in READ-ONLY mode due to security concerns")
		}
	}

	/**
	 * Check if the notebook is in read-only mode
	 */
	public isInReadOnlyMode(): boolean {
		return this.isReadOnly
	}

	/**
	 * Get security validation result
	 */
	public getSecurityValidation(): SecurityValidationResult | undefined {
		return this.validationResult
	}

	/**
	 * Get security recommendations for the notebook
	 */
	public getSecurityRecommendations(): string[] {
		return this.security.getSecurityRecommendations(this.notebook)
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
		// Check if operation is allowed
		if (this.isReadOnly) {
			console.error("Cannot update cell: Notebook is in read-only mode")
			return false
		}

		if (!this.security.shouldAllowOperation("write", this.notebook, this.filePath)) {
			console.error("Cannot update cell: Security policy prevents write operations")
			return false
		}

		if (cellIndex < 0 || cellIndex >= this.notebook.cells.length) {
			return false
		}

		// Validate the new content for security risks
		const tempCell = { ...this.notebook.cells[cellIndex] }
		tempCell.source = newContent
		const validation = this.security.validateCell(tempCell, cellIndex)

		if (validation.errors.length > 0) {
			console.error("Cannot update cell due to security errors:", validation.errors)
			return false
		}

		if (validation.warnings.length > 0) {
			console.warn("Security warnings for cell update:", validation.warnings)
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
		// Check if operation is allowed
		if (this.isReadOnly) {
			console.error("Cannot insert cell: Notebook is in read-only mode")
			return false
		}

		if (!this.security.shouldAllowOperation("write", this.notebook, this.filePath)) {
			console.error("Cannot insert cell: Security policy prevents write operations")
			return false
		}

		if (index < 0 || index > this.notebook.cells.length) {
			return false
		}

		// Check if we're exceeding max cell count
		const maxCellCount = this.security.getConfig().maxCellCount
		if (this.notebook.cells.length >= maxCellCount) {
			console.error(`Cannot insert cell: Maximum cell count (${maxCellCount}) reached`)
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

		// Validate the new cell for security risks
		const validation = this.security.validateCell(newCell, index)

		if (validation.errors.length > 0) {
			console.error("Cannot insert cell due to security errors:", validation.errors)
			return false
		}

		if (validation.warnings.length > 0) {
			console.warn("Security warnings for new cell:", validation.warnings)
		}

		this.notebook.cells.splice(index, 0, newCell)
		this.buildCellReferences()
		return true
	}

	/**
	 * Delete a cell
	 */
	deleteCell(index: number): boolean {
		// Check if operation is allowed
		if (this.isReadOnly) {
			console.error("Cannot delete cell: Notebook is in read-only mode")
			return false
		}

		if (!this.security.shouldAllowOperation("write", this.notebook, this.filePath)) {
			console.error("Cannot delete cell: Security policy prevents write operations")
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
		// Check if operation is allowed
		if (this.isReadOnly) {
			throw new Error("Cannot save: Notebook is in read-only mode")
		}

		if (!this.security.shouldAllowOperation("write", this.notebook, this.filePath)) {
			throw new Error("Cannot save: Security policy prevents write operations")
		}

		// Validate entire notebook before saving
		const validation = this.security.validateNotebook(this.notebook, this.filePath)

		if (!validation.isValid && validation.errors.length > 0) {
			throw new Error(`Cannot save notebook with security errors: ${validation.errors.join(", ")}`)
		}

		const content = JSON.stringify(this.notebook, null, 2)
		await fs.writeFile(this.filePath, content, "utf8")
	}

	/**
	 * Get a sanitized version of the notebook
	 */
	public getSanitizedNotebook(): JupyterNotebook {
		return this.security.sanitizeNotebook(this.notebook)
	}

	/**
	 * Update security configuration
	 */
	public updateSecurityConfig(config: Partial<SecurityConfig>): void {
		this.security.updateConfig(config)
		// Re-validate with new config
		this.validationResult = this.security.validateNotebook(this.notebook, this.filePath)

		if (!this.validationResult.isValid && this.security.getConfig().readOnlyMode) {
			this.isReadOnly = true
			if (this.validationResult.sanitized) {
				this.notebook = this.validationResult.sanitized
				this.buildCellReferences()
			}
		} else {
			this.isReadOnly = false
		}
	}

	/**
	 * Check if a specific operation would be allowed
	 */
	public wouldAllowOperation(operation: "read" | "write" | "execute"): boolean {
		return this.security.shouldAllowOperation(operation, this.notebook, this.filePath)
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
}
