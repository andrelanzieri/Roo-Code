import { JupyterNotebook, JupyterCell } from "./jupyter-notebook-handler"

export interface SecurityRisk {
	severity: "critical" | "high" | "medium" | "low"
	type: string
	cellIndex?: number
	cellType?: string
	description: string
	pattern?: string
}

export interface SecurityValidationResult {
	isSecure: boolean
	risks: SecurityRisk[]
	requiresReadOnly: boolean
	sanitizedNotebook?: JupyterNotebook
}

export interface JupyterSecurityConfig {
	allowCodeExecution?: boolean
	readOnlyMode?: boolean
	maxCellSize?: number
	maxCellCount?: number
	trustedSources?: string[]
	yoloMode?: boolean // New YOLO Mode flag
}

const DEFAULT_CONFIG: JupyterSecurityConfig = {
	allowCodeExecution: false,
	readOnlyMode: false, // Only enforce read-only when risks are detected
	maxCellSize: 1024 * 1024, // 1MB
	maxCellCount: 1000,
	trustedSources: [],
	yoloMode: false,
}

// Dangerous code patterns that could execute arbitrary code
const DANGEROUS_CODE_PATTERNS = [
	// Direct code execution
	{ pattern: /\beval\s*\(/, severity: "critical" as const, type: "eval" },
	{ pattern: /\bexec\s*\(/, severity: "critical" as const, type: "exec" },
	{ pattern: /\bcompile\s*\(/, severity: "critical" as const, type: "compile" },
	{ pattern: /\b__import__\s*\(/, severity: "critical" as const, type: "__import__" },

	// System commands
	{ pattern: /^!.*/, severity: "critical" as const, type: "shell_command" },
	{ pattern: /%system\s+/, severity: "critical" as const, type: "magic_system" },
	{ pattern: /%%bash/, severity: "critical" as const, type: "magic_bash" },
	{ pattern: /%%sh/, severity: "critical" as const, type: "magic_sh" },
	{ pattern: /%%script/, severity: "critical" as const, type: "magic_script" },

	// Dangerous imports
	{ pattern: /import\s+subprocess/, severity: "high" as const, type: "subprocess_import" },
	{ pattern: /from\s+subprocess\s+import/, severity: "high" as const, type: "subprocess_import" },
	{ pattern: /import\s+os/, severity: "high" as const, type: "os_import" },
	{ pattern: /from\s+os\s+import/, severity: "high" as const, type: "os_import" },
	{ pattern: /import\s+sys/, severity: "high" as const, type: "sys_import" },
	{ pattern: /from\s+sys\s+import/, severity: "high" as const, type: "sys_import" },
	{ pattern: /import\s+socket/, severity: "high" as const, type: "socket_import" },
	{ pattern: /from\s+socket\s+import/, severity: "high" as const, type: "socket_import" },
	{ pattern: /import\s+pickle/, severity: "high" as const, type: "pickle_import" },
	{ pattern: /from\s+pickle\s+import/, severity: "high" as const, type: "pickle_import" },

	// File operations
	{ pattern: /\bopen\s*\(/, severity: "medium" as const, type: "file_open" },
	{ pattern: /\bfile\s*\(/, severity: "medium" as const, type: "file_operation" },
	{ pattern: /\.write\s*\(/, severity: "medium" as const, type: "file_write" },
	{ pattern: /\.read\s*\(/, severity: "medium" as const, type: "file_read" },

	// Network operations
	{ pattern: /requests\.(get|post|put|delete|patch)/, severity: "medium" as const, type: "network_request" },
	{ pattern: /urllib\.request/, severity: "medium" as const, type: "network_urllib" },
	{ pattern: /http\.client/, severity: "medium" as const, type: "network_http" },
]

// Dangerous patterns in markdown cells (potential XSS)
const DANGEROUS_MARKDOWN_PATTERNS = [
	{ pattern: /<script[^>]*>[\s\S]*?<\/script>/gi, severity: "high" as const, type: "script_tag" },
	{ pattern: /<iframe[^>]*>/gi, severity: "high" as const, type: "iframe_tag" },
	{ pattern: /javascript:/gi, severity: "high" as const, type: "javascript_protocol" },
	{ pattern: /on\w+\s*=/gi, severity: "medium" as const, type: "event_handler" },
]

// Dangerous output patterns
const DANGEROUS_OUTPUT_PATTERNS = [
	{ pattern: /<script[^>]*>[\s\S]*?<\/script>/gi, severity: "high" as const, type: "output_script" },
	{ pattern: /data:text\/html/gi, severity: "medium" as const, type: "html_data_uri" },
]

export class JupyterNotebookSecurity {
	private config: JupyterSecurityConfig

	constructor(config?: JupyterSecurityConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config }
	}

	/**
	 * Validate a Jupyter notebook for security risks
	 */
	validateNotebook(notebook: JupyterNotebook, filePath?: string): SecurityValidationResult {
		// If YOLO Mode is enabled, bypass all security checks
		if (this.config.yoloMode) {
			return {
				isSecure: true,
				risks: [],
				requiresReadOnly: false,
			}
		}

		const risks: SecurityRisk[] = []

		// Check if source is trusted
		if (filePath && this.config.trustedSources?.length) {
			const isTrusted = this.config.trustedSources.some((source) => filePath.includes(source))
			if (isTrusted) {
				return {
					isSecure: true,
					risks: [],
					requiresReadOnly: false,
				}
			}
		}

		// Check cell count
		if (notebook.cells.length > (this.config.maxCellCount || DEFAULT_CONFIG.maxCellCount!)) {
			risks.push({
				severity: "medium",
				type: "excessive_cells",
				description: `Notebook has ${notebook.cells.length} cells, exceeding limit of ${this.config.maxCellCount}`,
			})
		}

		// Validate each cell
		notebook.cells.forEach((cell, index) => {
			const cellRisks = this.validateCell(cell, index)
			risks.push(...cellRisks)
		})

		// Check metadata for suspicious fields
		if (notebook.metadata) {
			const metadataRisks = this.validateMetadata(notebook.metadata)
			risks.push(...metadataRisks)
		}

		// Determine security status
		const hasCriticalRisk = risks.some((r) => r.severity === "critical")
		const hasHighRisk = risks.some((r) => r.severity === "high")

		const isSecure = !hasCriticalRisk && !hasHighRisk
		// Only require read-only if explicitly configured OR if there are critical/high risks
		const requiresReadOnly = this.config.readOnlyMode === true || hasCriticalRisk || hasHighRisk

		// Optionally sanitize the notebook
		let sanitizedNotebook: JupyterNotebook | undefined
		if (!isSecure && this.config.allowCodeExecution === false) {
			sanitizedNotebook = this.sanitizeNotebook(notebook, risks)
		}

		return {
			isSecure,
			risks,
			requiresReadOnly,
			sanitizedNotebook,
		}
	}

	/**
	 * Validate a single cell for security risks
	 */
	private validateCell(cell: JupyterCell, index: number): SecurityRisk[] {
		const risks: SecurityRisk[] = []
		const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""

		// Check cell size
		const cellSize = new TextEncoder().encode(source).length
		if (cellSize > (this.config.maxCellSize || DEFAULT_CONFIG.maxCellSize!)) {
			risks.push({
				severity: "medium",
				type: "oversized_cell",
				cellIndex: index,
				cellType: cell.cell_type,
				description: `Cell ${index} exceeds size limit (${cellSize} bytes)`,
			})
		}

		// Check for dangerous patterns based on cell type
		if (cell.cell_type === "code") {
			// Check code patterns
			for (const { pattern, severity, type } of DANGEROUS_CODE_PATTERNS) {
				if (pattern.test(source)) {
					risks.push({
						severity,
						type,
						cellIndex: index,
						cellType: "code",
						description: `Dangerous code pattern detected: ${type}`,
						pattern: pattern.toString(),
					})
				}
			}

			// Check outputs for dangerous content
			if (cell.outputs && Array.isArray(cell.outputs)) {
				for (const output of cell.outputs) {
					if (output.data) {
						const outputRisks = this.validateOutputData(output.data, index)
						risks.push(...outputRisks)
					}
				}
			}
		} else if (cell.cell_type === "markdown") {
			// Check markdown patterns
			for (const { pattern, severity, type } of DANGEROUS_MARKDOWN_PATTERNS) {
				if (pattern.test(source)) {
					risks.push({
						severity,
						type,
						cellIndex: index,
						cellType: "markdown",
						description: `Dangerous markdown pattern detected: ${type}`,
						pattern: pattern.toString(),
					})
				}
			}
		}

		return risks
	}

	/**
	 * Validate output data for security risks
	 */
	private validateOutputData(data: any, cellIndex: number): SecurityRisk[] {
		const risks: SecurityRisk[] = []

		// Check HTML outputs
		if (data["text/html"]) {
			const htmlContent = Array.isArray(data["text/html"]) ? data["text/html"].join("") : data["text/html"]

			for (const { pattern, severity, type } of DANGEROUS_OUTPUT_PATTERNS) {
				if (pattern.test(htmlContent)) {
					risks.push({
						severity,
						type,
						cellIndex,
						cellType: "output",
						description: `Dangerous output pattern detected: ${type}`,
						pattern: pattern.toString(),
					})
				}
			}
		}

		// Check JavaScript outputs
		if (data["application/javascript"]) {
			risks.push({
				severity: "high",
				type: "javascript_output",
				cellIndex,
				cellType: "output",
				description: "JavaScript output detected",
			})
		}

		return risks
	}

	/**
	 * Validate notebook metadata for security risks
	 */
	private validateMetadata(metadata: Record<string, any>): SecurityRisk[] {
		const risks: SecurityRisk[] = []

		// Check for suspicious metadata fields
		const suspiciousFields = ["widgets", "extensions", "jupyter_dashboards"]
		for (const field of suspiciousFields) {
			if (metadata[field]) {
				risks.push({
					severity: "low",
					type: "suspicious_metadata",
					description: `Suspicious metadata field detected: ${field}`,
				})
			}
		}

		return risks
	}

	/**
	 * Sanitize a notebook by removing or disabling dangerous content
	 */
	private sanitizeNotebook(notebook: JupyterNotebook, risks: SecurityRisk[]): JupyterNotebook {
		const sanitized = JSON.parse(JSON.stringify(notebook)) as JupyterNotebook

		// Group risks by cell index
		const risksByCell = new Map<number, SecurityRisk[]>()
		for (const risk of risks) {
			if (risk.cellIndex !== undefined) {
				if (!risksByCell.has(risk.cellIndex)) {
					risksByCell.set(risk.cellIndex, [])
				}
				risksByCell.get(risk.cellIndex)!.push(risk)
			}
		}

		// Sanitize cells with risks
		for (const [cellIndex, cellRisks] of risksByCell) {
			const cell = sanitized.cells[cellIndex]
			if (!cell) continue

			const hasCriticalRisk = cellRisks.some((r) => r.severity === "critical")
			const hasHighRisk = cellRisks.some((r) => r.severity === "high")

			if (cell.cell_type === "code" && (hasCriticalRisk || hasHighRisk)) {
				// Disable dangerous code cells
				const riskTypes = cellRisks.map((r) => r.type).join(", ")
				const warningComment = `# ⚠️ SECURITY WARNING: This cell has been disabled due to security risks (${riskTypes})\n# To run this cell, enable YOLO Mode in settings\n\n`

				if (Array.isArray(cell.source)) {
					const originalCode = cell.source.map((line) => `# ${line}`)
					cell.source = [warningComment, "# Original code:\n", ...originalCode]
				} else {
					const originalCode = (cell.source || "")
						.split("\n")
						.map((line) => `# ${line}`)
						.join("\n")
					cell.source = warningComment + "# Original code:\n" + originalCode
				}

				// Clear outputs
				cell.outputs = []
				cell.execution_count = null
			} else if (cell.cell_type === "markdown" && (hasCriticalRisk || hasHighRisk)) {
				// Sanitize dangerous markdown
				let source = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""

				// Remove script tags
				source = source.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "[REMOVED: script tag]")
				// Remove iframes
				source = source.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "[REMOVED: iframe]")
				// Remove javascript: protocols
				source = source.replace(/javascript:/gi, "[REMOVED]:")
				// Remove event handlers
				source = source.replace(/on\w+\s*=/gi, "data-removed=")

				// Handle both array and string source formats
				if (Array.isArray(cell.source)) {
					cell.source = source
						.split("\n")
						.map((line, idx, arr) => (idx === arr.length - 1 && line === "" ? line : line + "\n"))
				} else {
					cell.source = source
				}
			}

			// Clear dangerous outputs
			if (cell.outputs && Array.isArray(cell.outputs)) {
				cell.outputs = cell.outputs.map((output) => {
					if (output && output.data) {
						const newOutput = { ...output, data: { ...output.data } }

						// Remove HTML outputs with scripts
						if (newOutput.data["text/html"]) {
							const html = Array.isArray(newOutput.data["text/html"])
								? newOutput.data["text/html"].join("")
								: newOutput.data["text/html"]

							if (/<script|<iframe|javascript:/i.test(html)) {
								delete newOutput.data["text/html"]
								// Only add text/plain if it doesn't exist
								if (!newOutput.data["text/plain"]) {
									newOutput.data["text/plain"] = ["[HTML output removed for security]"]
								}
							}
						}

						// Remove JavaScript outputs
						if (newOutput.data["application/javascript"]) {
							delete newOutput.data["application/javascript"]
							// Add or append to text/plain
							if (!newOutput.data["text/plain"]) {
								newOutput.data["text/plain"] = ["[JavaScript output removed for security]"]
							} else if (Array.isArray(newOutput.data["text/plain"])) {
								newOutput.data["text/plain"].push("[JavaScript output removed for security]")
							}
						}

						return newOutput
					}
					return output
				})
			}
		}

		// Remove suspicious metadata
		if (sanitized.metadata) {
			delete sanitized.metadata.widgets
			delete sanitized.metadata.extensions
			delete sanitized.metadata.jupyter_dashboards
		}

		return sanitized
	}

	/**
	 * Check if YOLO Mode is enabled
	 */
	isYoloModeEnabled(): boolean {
		return this.config.yoloMode === true
	}

	/**
	 * Update security configuration
	 */
	updateConfig(config: Partial<JupyterSecurityConfig>): void {
		this.config = { ...this.config, ...config }
	}
}
