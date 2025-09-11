/**
 * Security Middleware Types
 * Defines the structure for enhanced security configuration with ASK rules and YAML support
 */

/**
 * Action types for security rules
 */
export type SecurityAction = "BLOCK" | "ASK" | "ALLOW"

/**
 * A single security rule defining file access patterns
 */
export interface SecurityRule {
	/**
	 * Glob pattern or regex for matching files/paths
	 * Supports gitignore-style patterns
	 */
	pattern: string

	/**
	 * Action to take when pattern matches
	 */
	action: SecurityAction

	/**
	 * Optional description for the rule
	 */
	description?: string

	/**
	 * Optional message to show when ASK action is triggered
	 */
	askMessage?: string

	/**
	 * Priority for rule evaluation (higher = evaluated first)
	 * Default: 0
	 */
	priority?: number

	/**
	 * Whether this rule applies to commands as well as file access
	 * Default: true
	 */
	applyToCommands?: boolean
}

/**
 * Security configuration at a specific level
 */
export interface SecurityConfig {
	/**
	 * Whether security middleware is enabled at this level
	 */
	enabled: boolean

	/**
	 * Array of security rules
	 */
	rules: SecurityRule[]

	/**
	 * Default action when no rules match
	 * Default: 'ALLOW'
	 */
	defaultAction?: SecurityAction

	/**
	 * Whether to inherit rules from parent levels
	 * Default: true
	 */
	inheritRules?: boolean

	/**
	 * Custom message prefix for ASK prompts
	 */
	askMessagePrefix?: string

	/**
	 * Metadata about the configuration
	 */
	metadata?: {
		version?: string
		author?: string
		description?: string
		lastModified?: string
	}
}

/**
 * Complete security configuration including all tiers
 */
export interface SecurityMiddlewareConfig {
	/**
	 * Global configuration (applies to all projects)
	 */
	global?: SecurityConfig

	/**
	 * Project-specific configuration
	 */
	project?: SecurityConfig

	/**
	 * Custom configuration (user overrides)
	 */
	custom?: SecurityConfig

	/**
	 * Enterprise configuration (from organization)
	 */
	enterprise?: SecurityConfig
}

/**
 * Result of evaluating security rules
 */
export interface SecurityEvaluation {
	/**
	 * The action to take
	 */
	action: SecurityAction

	/**
	 * The rule that matched (if any)
	 */
	matchedRule?: SecurityRule

	/**
	 * The configuration level where the rule was found
	 */
	level?: "enterprise" | "global" | "project" | "custom"

	/**
	 * Custom message for ASK action
	 */
	message?: string

	/**
	 * The path that was evaluated
	 */
	path: string
}

/**
 * Options for security middleware initialization
 */
export interface SecurityMiddlewareOptions {
	/**
	 * Current working directory
	 */
	cwd: string

	/**
	 * Path to global configuration file
	 */
	globalConfigPath?: string

	/**
	 * Path to project configuration file
	 */
	projectConfigPath?: string

	/**
	 * Path to custom configuration file
	 */
	customConfigPath?: string

	/**
	 * Whether to enable debug logging
	 */
	debug?: boolean

	/**
	 * Callback for ASK actions
	 */
	onAskAction?: (evaluation: SecurityEvaluation) => Promise<boolean>
}

/**
 * Interface for security configuration file (YAML format)
 */
export interface SecurityConfigFile {
	/**
	 * Version of the configuration schema
	 */
	version: "1.0"

	/**
	 * Security configuration
	 */
	security: SecurityConfig
}

/**
 * Statistics about security middleware operations
 */
export interface SecurityStats {
	/**
	 * Number of files blocked
	 */
	blockedCount: number

	/**
	 * Number of files that triggered ASK
	 */
	askedCount: number

	/**
	 * Number of files allowed
	 */
	allowedCount: number

	/**
	 * Total evaluations performed
	 */
	totalEvaluations: number

	/**
	 * Rules by configuration level
	 */
	rulesByLevel: {
		enterprise: number
		global: number
		project: number
		custom: number
	}
}
