/**
 * Security module for Jupyter notebook handling
 * Provides validation, sanitization, and security controls for notebook operations
 */

import { JupyterCell, JupyterNotebook } from "./jupyter-notebook-handler"

export interface SecurityConfig {
	/** Allow execution of code cells (default: false) */
	allowCodeExecution?: boolean
	/** Enable read-only mode for untrusted notebooks (default: true) */
	readOnlyMode?: boolean
	/** Maximum allowed cell size in characters (default: 1MB) */
	maxCellSize?: number
	/** Maximum number of cells allowed (default: 1000) */
	maxCellCount?: number
	/** Allow potentially dangerous imports (default: false) */
	allowDangerousImports?: boolean
	/** List of blocked patterns in code cells */
	blockedPatterns?: RegExp[]
	/** List of allowed file extensions for outputs */
	allowedOutputTypes?: string[]
	/** Enable security warnings (default: true) */
	enableWarnings?: boolean
	/** Trusted notebook sources (file paths or patterns) */
	trustedSources?: string[]
}

export interface SecurityValidationResult {
	isValid: boolean
	errors: string[]
	warnings: string[]
	sanitized?: JupyterNotebook
}

export interface CellSecurityInfo {
	cellIndex: number
	cellType: string
	risks: SecurityRisk[]
	isSafe: boolean
}

export interface SecurityRisk {
	type: "code_execution" | "import" | "file_access" | "network" | "system_command" | "eval" | "size_limit"
	severity: "low" | "medium" | "high" | "critical"
	description: string
	pattern?: string
}

const DEFAULT_CONFIG: Required<SecurityConfig> = {
	allowCodeExecution: false,
	readOnlyMode: true,
	maxCellSize: 1024 * 1024, // 1MB
	maxCellCount: 1000,
	allowDangerousImports: false,
	blockedPatterns: [
		// System commands and shell execution
		/\b(exec|eval|compile|__import__|open|subprocess|os\.system|os\.popen|commands\.)/gi,
		// File system operations
		/\b(shutil\.|pathlib\.|glob\.|tempfile\.|zipfile\.|tarfile\.)/gi,
		// Network operations
		/\b(urllib\.|requests\.|socket\.|http\.|ftplib\.|telnetlib\.|smtplib\.)/gi,
		// Dangerous built-ins
		/\b(globals|locals|vars|dir|getattr|setattr|delattr|hasattr)\s*\(/gi,
		// Code injection patterns
		/\b(pickle\.|marshal\.|shelve\.|dill\.)/gi,
		// Process and thread manipulation
		/\b(multiprocessing\.|threading\.|concurrent\.|asyncio\.)/gi,
	],
	allowedOutputTypes: ["text/plain", "text/html", "image/png", "image/jpeg", "image/svg+xml"],
	enableWarnings: true,
	trustedSources: [],
}

const DANGEROUS_IMPORTS = [
	"subprocess",
	"os",
	"sys",
	"socket",
	"urllib",
	"requests",
	"pickle",
	"marshal",
	"shelve",
	"dill",
	"multiprocessing",
	"threading",
	"ctypes",
	"pty",
	"fcntl",
	"termios",
	"tty",
	"pwd",
	"grp",
	"resource",
	"signal",
	"syslog",
	"tempfile",
	"shutil",
	"glob",
	"pathlib",
	"zipfile",
	"tarfile",
	"gzip",
	"bz2",
	"lzma",
	"sqlite3",
	"psycopg2",
	"pymongo",
	"redis",
	"paramiko",
	"fabric",
	"ansible",
	"docker",
	"kubernetes",
]

export class JupyterNotebookSecurity {
	private config: Required<SecurityConfig>

	constructor(config?: SecurityConfig) {
		this.config = { ...DEFAULT_CONFIG, ...config }
	}

	/**
	 * Validate a Jupyter notebook for security risks
	 */
	public validateNotebook(notebook: JupyterNotebook, sourcePath?: string): SecurityValidationResult {
		const errors: string[] = []
		const warnings: string[] = []

		// Check if source is trusted
		if (sourcePath && this.isSourceTrusted(sourcePath)) {
			return {
				isValid: true,
				errors: [],
				warnings: ["Notebook from trusted source - security checks bypassed"],
			}
		}

		// Check cell count
		if (notebook.cells.length > this.config.maxCellCount) {
			errors.push(`Notebook exceeds maximum cell count (${notebook.cells.length} > ${this.config.maxCellCount})`)
		}

		// Validate each cell
		notebook.cells.forEach((cell, index) => {
			const cellValidation = this.validateCell(cell, index)
			errors.push(...cellValidation.errors)
			warnings.push(...cellValidation.warnings)
		})

		// Check for suspicious metadata
		if (notebook.metadata) {
			const metadataWarnings = this.validateMetadata(notebook.metadata)
			warnings.push(...metadataWarnings)
		}

		const isValid = errors.length === 0

		// Sanitize if needed
		let sanitized: JupyterNotebook | undefined
		if (!isValid && this.config.readOnlyMode) {
			sanitized = this.sanitizeNotebook(notebook)
		}

		return {
			isValid,
			errors,
			warnings,
			sanitized,
		}
	}

	/**
	 * Validate a single cell for security risks
	 */
	public validateCell(cell: JupyterCell, index: number): { errors: string[]; warnings: string[] } {
		const errors: string[] = []
		const warnings: string[] = []

		// Get cell content as string
		const content = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""

		// Check cell size
		if (content.length > this.config.maxCellSize) {
			errors.push(
				`Cell ${index} exceeds maximum size (${content.length} > ${this.config.maxCellSize} characters)`,
			)
		}

		// Check code cells for dangerous patterns
		if (cell.cell_type === "code") {
			const codeRisks = this.analyzeCodeCell(content)

			codeRisks.forEach((risk) => {
				const message = `Cell ${index}: ${risk.description}`
				if (risk.severity === "critical" || risk.severity === "high") {
					errors.push(message)
				} else {
					warnings.push(message)
				}
			})

			// Check outputs for suspicious content
			if (cell.outputs && Array.isArray(cell.outputs)) {
				const outputWarnings = this.validateOutputs(cell.outputs, index)
				warnings.push(...outputWarnings)
			}
		}

		// Check for embedded scripts in markdown cells
		if (cell.cell_type === "markdown") {
			const markdownRisks = this.analyzeMarkdownCell(content)
			markdownRisks.forEach((risk) => {
				warnings.push(`Cell ${index}: ${risk.description}`)
			})
		}

		return { errors, warnings }
	}

	/**
	 * Analyze a code cell for security risks
	 */
	public analyzeCodeCell(content: string): SecurityRisk[] {
		const risks: SecurityRisk[] = []

		// Check for blocked patterns
		this.config.blockedPatterns.forEach((pattern) => {
			if (pattern.test(content)) {
				risks.push({
					type: "code_execution",
					severity: "high",
					description: `Potentially dangerous code pattern detected: ${pattern.source}`,
					pattern: pattern.source,
				})
			}
		})

		// Check for dangerous imports
		if (!this.config.allowDangerousImports) {
			const importRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g
			let match
			while ((match = importRegex.exec(content)) !== null) {
				const module = (match[1] || match[2]).split(".")[0].replace(",", "")
				if (DANGEROUS_IMPORTS.includes(module)) {
					risks.push({
						type: "import",
						severity: "high",
						description: `Dangerous import detected: ${module}`,
						pattern: module,
					})
				}
			}
		}

		// Check for eval/exec usage
		if (/\b(eval|exec|compile)\s*\(/.test(content)) {
			risks.push({
				type: "eval",
				severity: "critical",
				description: "Dynamic code execution detected (eval/exec/compile)",
			})
		}

		// Check for file system access
		if (/\b(open|read|write)\s*\(/.test(content)) {
			risks.push({
				type: "file_access",
				severity: "medium",
				description: "File system access detected",
			})
		}

		// Check for network operations
		if (/\b(urlopen|urlretrieve|get|post|put|delete)\s*\(/.test(content)) {
			risks.push({
				type: "network",
				severity: "medium",
				description: "Network operation detected",
			})
		}

		// Check for system commands
		if (/!\s*[a-zA-Z]/.test(content) || /%\s*system/.test(content)) {
			risks.push({
				type: "system_command",
				severity: "critical",
				description: "System command execution detected",
			})
		}

		return risks
	}

	/**
	 * Analyze a markdown cell for security risks
	 */
	public analyzeMarkdownCell(content: string): SecurityRisk[] {
		const risks: SecurityRisk[] = []

		// Check for embedded JavaScript
		if (/<script[\s>]/i.test(content)) {
			risks.push({
				type: "code_execution",
				severity: "high",
				description: "Embedded JavaScript detected in markdown",
			})
		}

		// Check for iframes
		if (/<iframe[\s>]/i.test(content)) {
			risks.push({
				type: "network",
				severity: "medium",
				description: "Embedded iframe detected in markdown",
			})
		}

		// Check for data URIs that might contain scripts
		if (/data:[^,]*script/i.test(content)) {
			risks.push({
				type: "code_execution",
				severity: "high",
				description: "Data URI with potential script detected",
			})
		}

		return risks
	}

	/**
	 * Validate cell outputs for security risks
	 */
	private validateOutputs(outputs: any[], cellIndex: number): string[] {
		const warnings: string[] = []

		outputs.forEach((output, outputIndex) => {
			if (output.data) {
				Object.keys(output.data).forEach((mimeType) => {
					if (!this.config.allowedOutputTypes.includes(mimeType)) {
						warnings.push(
							`Cell ${cellIndex}, Output ${outputIndex}: Unrecognized output type '${mimeType}'`,
						)
					}

					// Check for suspicious content in HTML outputs
					if (mimeType === "text/html") {
						const htmlContent = Array.isArray(output.data[mimeType])
							? output.data[mimeType].join("")
							: output.data[mimeType]

						if (/<script[\s>]/i.test(htmlContent)) {
							warnings.push(
								`Cell ${cellIndex}, Output ${outputIndex}: JavaScript detected in HTML output`,
							)
						}
					}
				})
			}
		})

		return warnings
	}

	/**
	 * Validate notebook metadata
	 */
	private validateMetadata(metadata: Record<string, any>): string[] {
		const warnings: string[] = []

		// Check for suspicious kernel specifications
		if (metadata.kernelspec?.language && metadata.kernelspec.language !== "python") {
			warnings.push(`Non-Python kernel detected: ${metadata.kernelspec.language}`)
		}

		// Check for custom metadata that might contain code
		const suspiciousKeys = ["widgets", "extensions", "plugins", "hooks"]
		Object.keys(metadata).forEach((key) => {
			if (suspiciousKeys.includes(key.toLowerCase())) {
				warnings.push(`Potentially suspicious metadata key detected: ${key}`)
			}
		})

		return warnings
	}

	/**
	 * Sanitize a notebook by removing dangerous content
	 */
	public sanitizeNotebook(notebook: JupyterNotebook): JupyterNotebook {
		const sanitized: JupyterNotebook = {
			...notebook,
			cells: notebook.cells.map((cell) => this.sanitizeCell(cell)),
		}

		// Remove suspicious metadata
		if (sanitized.metadata) {
			const cleanMetadata = { ...sanitized.metadata }
			delete cleanMetadata.widgets
			delete cleanMetadata.extensions
			delete cleanMetadata.plugins
			delete cleanMetadata.hooks
			sanitized.metadata = cleanMetadata
		}

		return sanitized
	}

	/**
	 * Sanitize a single cell
	 */
	private sanitizeCell(cell: JupyterCell): JupyterCell {
		const sanitized = { ...cell }

		if (cell.cell_type === "code") {
			// Clear outputs for code cells with risks
			const content = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""
			const risks = this.analyzeCodeCell(content)

			if (risks.some((r) => r.severity === "high" || r.severity === "critical")) {
				sanitized.outputs = []
				sanitized.execution_count = null

				// Add warning comment to the cell
				const warning =
					"# ⚠️ SECURITY WARNING: This cell contains potentially dangerous code and has been disabled\n"
				if (Array.isArray(sanitized.source)) {
					sanitized.source = [warning, ...sanitized.source]
				} else {
					sanitized.source = warning + (sanitized.source || "")
				}
			}
		}

		if (cell.cell_type === "markdown") {
			// Sanitize markdown content
			let content = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""

			// Remove script tags
			content = content.replace(/<script[\s\S]*?<\/script>/gi, "<!-- Script removed for security -->")

			// Remove iframes
			content = content.replace(/<iframe[\s\S]*?<\/iframe>/gi, "<!-- Iframe removed for security -->")

			// Remove dangerous data URIs
			content = content.replace(/data:[^,]*script[^"']*/gi, "data:text/plain,removed")

			// Convert back to appropriate format
			if (Array.isArray(cell.source)) {
				sanitized.source = content
					.split("\n")
					.map((line, idx, arr) => (idx === arr.length - 1 ? line : line + "\n"))
			} else {
				sanitized.source = content
			}
		}

		return sanitized
	}

	/**
	 * Check if a source path is trusted
	 */
	private isSourceTrusted(sourcePath: string): boolean {
		return this.config.trustedSources.some((trusted) => {
			if (trusted.includes("*")) {
				// Simple glob pattern matching
				const pattern = new RegExp("^" + trusted.replace(/\*/g, ".*") + "$")
				return pattern.test(sourcePath)
			}
			return sourcePath === trusted || sourcePath.startsWith(trusted)
		})
	}

	/**
	 * Get security analysis for all cells
	 */
	public analyzeNotebookSecurity(notebook: JupyterNotebook): CellSecurityInfo[] {
		return notebook.cells.map((cell, index) => {
			const content = Array.isArray(cell.source) ? cell.source.join("") : cell.source || ""
			const risks =
				cell.cell_type === "code"
					? this.analyzeCodeCell(content)
					: cell.cell_type === "markdown"
						? this.analyzeMarkdownCell(content)
						: []

			return {
				cellIndex: index,
				cellType: cell.cell_type,
				risks,
				isSafe: risks.length === 0 || risks.every((r) => r.severity === "low"),
			}
		})
	}

	/**
	 * Check if notebook operations should be allowed
	 */
	public shouldAllowOperation(
		operation: "read" | "write" | "execute",
		notebook: JupyterNotebook,
		sourcePath?: string,
	): boolean {
		// Always allow read operations
		if (operation === "read") {
			return true
		}

		// Check if source is trusted
		const isTrusted = sourcePath && this.isSourceTrusted(sourcePath)

		// For write operations
		if (operation === "write") {
			// Allow writes for trusted sources
			if (isTrusted) {
				return true
			}
			// In read-only mode, deny write operations for untrusted sources
			if (this.config.readOnlyMode) {
				const validation = this.validateNotebook(notebook, sourcePath)
				return validation.isValid
			}
			// Otherwise allow writes
			return true
		}

		// Never allow execution unless explicitly enabled
		if (operation === "execute") {
			if (!this.config.allowCodeExecution) {
				return false
			}
			// Even for trusted sources, validate if execution is safe
			const validation = this.validateNotebook(notebook, sourcePath)
			return validation.isValid && validation.errors.length === 0
		}

		return false
	}

	/**
	 * Get security recommendations for a notebook
	 */
	public getSecurityRecommendations(notebook: JupyterNotebook): string[] {
		const recommendations: string[] = []
		const analysis = this.analyzeNotebookSecurity(notebook)

		const hasHighRisk = analysis.some((info) =>
			info.risks.some((r) => r.severity === "high" || r.severity === "critical"),
		)

		if (hasHighRisk) {
			recommendations.push(
				"⚠️ This notebook contains high-risk code patterns. Review carefully before execution.",
			)
			recommendations.push("Consider running in an isolated environment or container.")
		}

		const importRisks = analysis.flatMap((info) => info.risks.filter((r) => r.type === "import"))
		if (importRisks.length > 0) {
			recommendations.push("Review imported modules for potential security risks.")
		}

		const networkRisks = analysis.flatMap((info) => info.risks.filter((r) => r.type === "network"))
		if (networkRisks.length > 0) {
			recommendations.push("This notebook performs network operations. Ensure network access is intended.")
		}

		const fileRisks = analysis.flatMap((info) => info.risks.filter((r) => r.type === "file_access"))
		if (fileRisks.length > 0) {
			recommendations.push("This notebook accesses the file system. Verify file paths and permissions.")
		}

		if (recommendations.length === 0 && analysis.every((info) => info.isSafe)) {
			recommendations.push("✅ No significant security risks detected.")
		}

		return recommendations
	}

	/**
	 * Update security configuration
	 */
	public updateConfig(config: Partial<SecurityConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * Get current security configuration
	 */
	public getConfig(): Required<SecurityConfig> {
		return { ...this.config }
	}
}

/**
 * Create a default security instance
 */
export function createDefaultSecurity(config?: SecurityConfig): JupyterNotebookSecurity {
	return new JupyterNotebookSecurity(config)
}

/**
 * Security utility functions
 */
export const SecurityUtils = {
	/**
	 * Check if a string contains potential code injection
	 */
	hasCodeInjection(content: string): boolean {
		const patterns = [
			/\b(eval|exec|compile|__import__)\s*\(/,
			/<script[\s>]/i,
			/javascript:/i,
			/on\w+\s*=/i, // Event handlers
		]
		return patterns.some((pattern) => pattern.test(content))
	},

	/**
	 * Get risk level from severity
	 */
	getRiskLevel(severity: SecurityRisk["severity"]): number {
		const levels = { low: 1, medium: 2, high: 3, critical: 4 }
		return levels[severity] || 0
	},

	/**
	 * Format security report
	 */
	formatSecurityReport(validation: SecurityValidationResult): string {
		const lines: string[] = []

		lines.push("=== Jupyter Notebook Security Report ===")
		lines.push(`Status: ${validation.isValid ? "✅ VALID" : "❌ INVALID"}`)
		lines.push("")

		if (validation.errors.length > 0) {
			lines.push("ERRORS:")
			validation.errors.forEach((error) => lines.push(`  ❌ ${error}`))
			lines.push("")
		}

		if (validation.warnings.length > 0) {
			lines.push("WARNINGS:")
			validation.warnings.forEach((warning) => lines.push(`  ⚠️ ${warning}`))
			lines.push("")
		}

		if (validation.isValid && validation.errors.length === 0 && validation.warnings.length === 0) {
			lines.push("No security issues detected.")
		}

		return lines.join("\n")
	},
}
