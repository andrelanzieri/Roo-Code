import * as path from "path"
import * as fs from "fs/promises"
import * as vscode from "vscode"
import * as yaml from "yaml"
import ignore, { Ignore } from "ignore"
import { fileExistsAtPath } from "../../utils/fs"
import {
	SecurityAction,
	SecurityRule,
	SecurityConfig,
	SecurityMiddlewareConfig,
	SecurityEvaluation,
	SecurityMiddlewareOptions,
	SecurityConfigFile,
	SecurityStats,
} from "./types"

/**
 * Enhanced Security Middleware for RooCode
 * Provides granular file access control with ASK prompts and YAML configuration
 */
export class SecurityMiddleware {
	private cwd: string
	private config: SecurityMiddlewareConfig = {}
	private ignoreInstances: Map<string, Ignore> = new Map()
	private stats: SecurityStats = {
		blockedCount: 0,
		askedCount: 0,
		allowedCount: 0,
		totalEvaluations: 0,
		rulesByLevel: {
			enterprise: 0,
			global: 0,
			project: 0,
			custom: 0,
		},
	}
	private disposables: vscode.Disposable[] = []
	private onAskAction?: (evaluation: SecurityEvaluation) => Promise<boolean>
	private debug: boolean = false

	// Default file names for configuration
	private static readonly CONFIG_FILES = {
		global: ".roo-security.yaml",
		project: ".roo-security.yaml",
		custom: ".roo-security-custom.yaml",
	}

	constructor(private options: SecurityMiddlewareOptions) {
		this.cwd = options.cwd
		this.onAskAction = options.onAskAction
		this.debug = options.debug || false

		// Set up file watchers for configuration changes
		this.setupFileWatchers()
	}

	/**
	 * Initialize the security middleware by loading all configuration tiers
	 */
	async initialize(): Promise<void> {
		await this.loadConfigurations()
		this.buildIgnoreInstances()
	}

	/**
	 * Load configurations from all tiers (Enterprise → Global → Project → Custom)
	 */
	private async loadConfigurations(): Promise<void> {
		// Load enterprise configuration (if available from organization)
		// This would typically come from a cloud service or organization settings
		await this.loadEnterpriseConfig()

		// Load global configuration (~/.roo-security.yaml)
		const globalPath =
			this.options.globalConfigPath ||
			path.join(process.env.HOME || process.env.USERPROFILE || "", SecurityMiddleware.CONFIG_FILES.global)
		await this.loadConfigFromFile(globalPath, "global")

		// Load project configuration (project/.roo-security.yaml)
		const projectPath =
			this.options.projectConfigPath || path.join(this.cwd, SecurityMiddleware.CONFIG_FILES.project)
		await this.loadConfigFromFile(projectPath, "project")

		// Load custom configuration (project/.roo-security-custom.yaml)
		const customPath = this.options.customConfigPath || path.join(this.cwd, SecurityMiddleware.CONFIG_FILES.custom)
		await this.loadConfigFromFile(customPath, "custom")

		this.logDebug("Configurations loaded", this.config)
	}

	/**
	 * Load enterprise configuration from organization settings
	 */
	private async loadEnterpriseConfig(): Promise<void> {
		// This would integrate with CloudService or organization settings
		// For now, we'll leave it as a placeholder for enterprise features
		// In a real implementation, this would fetch from an API or cloud service
	}

	/**
	 * Load configuration from a YAML file
	 */
	private async loadConfigFromFile(filePath: string, level: keyof SecurityMiddlewareConfig): Promise<void> {
		try {
			if (await fileExistsAtPath(filePath)) {
				const content = await fs.readFile(filePath, "utf-8")
				const parsed = yaml.parse(content) as SecurityConfigFile

				if (parsed?.version === "1.0" && parsed?.security) {
					this.config[level] = parsed.security

					// Count rules for statistics
					const ruleCount = parsed.security.rules?.length || 0
					if (level !== "enterprise") {
						this.stats.rulesByLevel[level] = ruleCount
					}

					this.logDebug(`Loaded ${ruleCount} rules from ${level} configuration`, filePath)
				}
			}
		} catch (error) {
			console.error(`Failed to load ${level} security configuration from ${filePath}:`, error)
		}
	}

	/**
	 * Build ignore instances for efficient pattern matching
	 */
	private buildIgnoreInstances(): void {
		this.ignoreInstances.clear()

		// Build ignore instances for each configuration level
		const levels: Array<keyof SecurityMiddlewareConfig> = ["enterprise", "global", "project", "custom"]

		for (const level of levels) {
			const config = this.config[level]
			if (config?.enabled && config.rules) {
				// Process each rule individually to maintain pattern integrity
				for (const rule of config.rules) {
					// Skip regex patterns for ignore instances
					if (rule.pattern.startsWith("/") && rule.pattern.endsWith("/")) {
						continue
					}

					const key = `${level}-${rule.action.toLowerCase()}-${rule.pattern}`
					const instance = ignore()
					instance.add(rule.pattern)
					this.ignoreInstances.set(key, instance)
				}
			}
		}
	}

	/**
	 * Evaluate file access based on security rules
	 */
	async evaluateAccess(filePath: string): Promise<SecurityEvaluation> {
		this.stats.totalEvaluations++

		// Convert to relative path for pattern matching
		// Normalize the path to ensure consistent matching
		const absolutePath = path.resolve(this.cwd, filePath)
		const relativePath = path.relative(this.cwd, absolutePath)
		const normalizedPath = relativePath.replace(/\\/g, "/")

		this.logDebug("Evaluating access", { filePath, normalizedPath })

		// Evaluate rules in priority order: Custom → Project → Global → Enterprise
		const levels: Array<keyof SecurityMiddlewareConfig> = ["custom", "project", "global", "enterprise"]

		for (const level of levels) {
			const config = this.config[level]

			if (!config?.enabled) continue

			// Skip inherited rules if inheritRules is false
			if (level !== "custom" && config.inheritRules === false) {
				break
			}

			// Sort rules by priority (higher first)
			const sortedRules = [...(config.rules || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0))

			for (const rule of sortedRules) {
				if (this.matchesPattern(normalizedPath, rule.pattern)) {
					this.logDebug("Rule matched", { level, rule })

					const evaluation: SecurityEvaluation = {
						action: rule.action,
						matchedRule: rule,
						level: level as any,
						path: filePath,
						message: this.buildMessage(rule, config, filePath),
					}

					// Update statistics
					this.updateStats(rule.action)

					// Handle ASK action
					if (rule.action === "ASK" && this.onAskAction) {
						const allowed = await this.onAskAction(evaluation)
						evaluation.action = allowed ? "ALLOW" : "BLOCK"
						// Update stats for the final action
						if (allowed) {
							this.stats.allowedCount++
							this.stats.askedCount--
						} else {
							this.stats.blockedCount++
							this.stats.askedCount--
						}
					}

					this.logDebug("Access evaluation result", evaluation)
					return evaluation
				}
			}

			// Check default action for this level
			if (config.defaultAction && config.defaultAction !== "ALLOW") {
				const evaluation: SecurityEvaluation = {
					action: config.defaultAction,
					level: level as any,
					path: filePath,
					message: `Default ${config.defaultAction} action from ${level} configuration`,
				}

				this.updateStats(config.defaultAction)
				return evaluation
			}
		}

		// Default to ALLOW if no rules match
		this.stats.allowedCount++
		return {
			action: "ALLOW",
			path: filePath,
		}
	}

	/**
	 * Evaluate command execution based on security rules
	 */
	async evaluateCommand(command: string): Promise<SecurityEvaluation> {
		// Extract potential file paths from the command
		const filePaths = this.extractFilePathsFromCommand(command)

		for (const filePath of filePaths) {
			const evaluation = await this.evaluateAccess(filePath)

			// Check if the matched rule applies to commands
			if (evaluation.matchedRule && evaluation.matchedRule.applyToCommands !== false) {
				if (evaluation.action !== "ALLOW") {
					return {
						...evaluation,
						message: `Command blocked: ${evaluation.message}`,
					}
				}
			}
		}

		return {
			action: "ALLOW",
			path: command,
		}
	}

	/**
	 * Check if a path matches a pattern
	 */
	private matchesPattern(filePath: string, pattern: string): boolean {
		// Check if it's a regex pattern (starts with / and ends with /)
		if (pattern.startsWith("/") && pattern.endsWith("/")) {
			try {
				const regex = new RegExp(pattern.slice(1, -1))
				const matches = regex.test(filePath)
				this.logDebug("Regex pattern matching", { filePath, pattern, matches })
				return matches
			} catch (error) {
				this.logDebug("Invalid regex pattern", { pattern, error })
				return false
			}
		}

		// Use gitignore-style matching
		// For gitignore patterns, we need to handle them properly
		const instance = ignore()

		// Remove quotes if present in the pattern
		const cleanPattern = pattern.replace(/^["']|["']$/g, "")
		instance.add(cleanPattern)

		// Normalize the path for matching
		const normalizedPath = filePath.replace(/\\/g, "/")

		// Check if the pattern matches
		const matches = instance.ignores(normalizedPath)
		this.logDebug("Gitignore pattern matching", { filePath, pattern: cleanPattern, normalizedPath, matches })

		return matches
	}

	/**
	 * Extract file paths from a command string
	 */
	private extractFilePathsFromCommand(command: string): string[] {
		const paths: string[] = []

		// Common file-reading commands
		const fileCommands = [
			"cat",
			"less",
			"more",
			"head",
			"tail",
			"grep",
			"awk",
			"sed",
			"get-content",
			"gc",
			"type",
			"select-string",
			"sls",
		]

		const parts = command.trim().split(/\s+/)
		const baseCommand = parts[0].toLowerCase()

		if (fileCommands.includes(baseCommand)) {
			// Extract file arguments (skip flags)
			for (let i = 1; i < parts.length; i++) {
				const arg = parts[i]
				if (!arg.startsWith("-") && !arg.startsWith("/") && !arg.includes(":")) {
					paths.push(arg)
				}
			}
		}

		return paths
	}

	/**
	 * Build a message for ASK or BLOCK actions
	 */
	private buildMessage(rule: SecurityRule, config: SecurityConfig, filePath: string): string {
		if (rule.askMessage) {
			return rule.askMessage.replace("${file}", filePath)
		}

		const prefix = config.askMessagePrefix || "Security check"
		const action = rule.action === "ASK" ? "requires approval" : "is blocked"
		const description = rule.description ? `: ${rule.description}` : ""

		return `${prefix}: Access to ${filePath} ${action}${description}`
	}

	/**
	 * Update statistics
	 */
	private updateStats(action: SecurityAction): void {
		switch (action) {
			case "BLOCK":
				this.stats.blockedCount++
				break
			case "ASK":
				this.stats.askedCount++
				break
			case "ALLOW":
				this.stats.allowedCount++
				break
		}
	}

	/**
	 * Set up file watchers for configuration changes
	 */
	private setupFileWatchers(): void {
		const watchPaths = [
			this.options.globalConfigPath || path.join(process.env.HOME || "", SecurityMiddleware.CONFIG_FILES.global),
			this.options.projectConfigPath || path.join(this.cwd, SecurityMiddleware.CONFIG_FILES.project),
			this.options.customConfigPath || path.join(this.cwd, SecurityMiddleware.CONFIG_FILES.custom),
		]

		for (const watchPath of watchPaths) {
			try {
				const watcher = vscode.workspace.createFileSystemWatcher(watchPath)

				const reloadConfig = async () => {
					await this.loadConfigurations()
					this.buildIgnoreInstances()
					this.logDebug("Configuration reloaded due to file change", watchPath)
				}

				this.disposables.push(
					watcher.onDidChange(reloadConfig),
					watcher.onDidCreate(reloadConfig),
					watcher.onDidDelete(reloadConfig),
					watcher,
				)
			} catch (error) {
				// Ignore watcher creation errors
			}
		}
	}

	/**
	 * Get current statistics
	 */
	getStats(): SecurityStats {
		return { ...this.stats }
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.stats = {
			blockedCount: 0,
			askedCount: 0,
			allowedCount: 0,
			totalEvaluations: 0,
			rulesByLevel: { ...this.stats.rulesByLevel },
		}
	}

	/**
	 * Get the current configuration
	 */
	getConfig(): SecurityMiddlewareConfig {
		return { ...this.config }
	}

	/**
	 * Export configuration to YAML
	 */
	async exportConfig(level: keyof SecurityMiddlewareConfig): Promise<string> {
		const config = this.config[level]
		if (!config) {
			throw new Error(`No configuration found for level: ${level}`)
		}

		const configFile: SecurityConfigFile = {
			version: "1.0",
			security: config,
		}

		return yaml.stringify(configFile, { lineWidth: 0 })
	}

	/**
	 * Import configuration from YAML
	 */
	async importConfig(yamlContent: string, level: keyof SecurityMiddlewareConfig): Promise<void> {
		try {
			const parsed = yaml.parse(yamlContent) as SecurityConfigFile

			if (parsed?.version === "1.0" && parsed?.security) {
				this.config[level] = parsed.security
				this.buildIgnoreInstances()

				// Save to file if paths are configured
				await this.saveConfigToFile(level)
			} else {
				throw new Error("Invalid configuration format")
			}
		} catch (error) {
			throw new Error(`Failed to import configuration: ${error}`)
		}
	}

	/**
	 * Save configuration to file
	 */
	private async saveConfigToFile(level: keyof SecurityMiddlewareConfig): Promise<void> {
		let filePath: string | undefined

		switch (level) {
			case "global":
				filePath =
					this.options.globalConfigPath ||
					path.join(process.env.HOME || "", SecurityMiddleware.CONFIG_FILES.global)
				break
			case "project":
				filePath =
					this.options.projectConfigPath || path.join(this.cwd, SecurityMiddleware.CONFIG_FILES.project)
				break
			case "custom":
				filePath = this.options.customConfigPath || path.join(this.cwd, SecurityMiddleware.CONFIG_FILES.custom)
				break
		}

		if (filePath && this.config[level]) {
			const configFile: SecurityConfigFile = {
				version: "1.0",
				security: this.config[level]!,
			}

			const yamlContent = yaml.stringify(configFile, { lineWidth: 0 })
			await fs.writeFile(filePath, yamlContent, "utf-8")
		}
	}

	/**
	 * Log debug messages
	 */
	private logDebug(message: string, data?: any): void {
		if (this.debug) {
			console.log(`[SecurityMiddleware] ${message}`, data || "")
		}
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose()
		}
		this.disposables = []
		this.ignoreInstances.clear()
	}
}
