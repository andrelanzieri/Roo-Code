import path from "path"
import { fileExistsAtPath } from "../../utils/fs"
import fs from "fs/promises"
import fsSync from "fs"
import ignore, { Ignore } from "ignore"
import * as vscode from "vscode"

export const LOCK_TEXT_SYMBOL = "\u{1F512}"

/**
 * Controls LLM access to files by enforcing ignore patterns.
 * Designed to be instantiated once in Cline.ts and passed to file manipulation services.
 * Uses the 'ignore' library to support standard .gitignore syntax in .rooignore files.
 */
export class RooIgnoreController {
	private cwd: string
	private ignoreInstance: Ignore
	private disposables: vscode.Disposable[] = []
	rooIgnoreContent: string | undefined
	private gitIgnoreContent: string | undefined
	private usingGitIgnoreFallback: boolean = false

	constructor(cwd: string) {
		this.cwd = cwd
		this.ignoreInstance = ignore()
		this.rooIgnoreContent = undefined
		this.gitIgnoreContent = undefined
		// Set up file watcher for .rooignore and .gitignore
		this.setupFileWatcher()
	}

	/**
	 * Initialize the controller by loading custom patterns
	 * Must be called after construction and before using the controller
	 */
	async initialize(): Promise<void> {
		await this.loadIgnorePatterns()
	}

	/**
	 * Set up the file watcher for .rooignore and .gitignore changes
	 */
	private setupFileWatcher(): void {
		const rooignorePattern = new vscode.RelativePattern(this.cwd, ".rooignore")
		const rooignoreWatcher = vscode.workspace.createFileSystemWatcher(rooignorePattern)

		const gitignorePattern = new vscode.RelativePattern(this.cwd, ".gitignore")
		const gitignoreWatcher = vscode.workspace.createFileSystemWatcher(gitignorePattern)

		// Watch for .rooignore changes and updates
		this.disposables.push(
			rooignoreWatcher.onDidChange(() => {
				this.loadIgnorePatterns()
			}),
			rooignoreWatcher.onDidCreate(() => {
				this.loadIgnorePatterns()
			}),
			rooignoreWatcher.onDidDelete(() => {
				this.loadIgnorePatterns()
			}),
		)

		// Watch for .gitignore changes and updates
		this.disposables.push(
			gitignoreWatcher.onDidChange(() => {
				this.loadIgnorePatterns()
			}),
			gitignoreWatcher.onDidCreate(() => {
				this.loadIgnorePatterns()
			}),
			gitignoreWatcher.onDidDelete(() => {
				this.loadIgnorePatterns()
			}),
		)

		// Add fileWatchers themselves to disposables
		this.disposables.push(rooignoreWatcher, gitignoreWatcher)
	}

	/**
	 * Load ignore patterns from .rooignore and .gitignore files
	 * .rooignore takes precedence, but .gitignore is used as fallback
	 */
	private async loadIgnorePatterns(): Promise<void> {
		try {
			// Reset ignore instance to prevent duplicate patterns
			this.ignoreInstance = ignore()
			this.usingGitIgnoreFallback = false

			const rooIgnorePath = path.join(this.cwd, ".rooignore")
			const gitIgnorePath = path.join(this.cwd, ".gitignore")

			// Check for .rooignore first
			if (await fileExistsAtPath(rooIgnorePath)) {
				const content = await fs.readFile(rooIgnorePath, "utf8")
				this.rooIgnoreContent = content
				this.ignoreInstance.add(content)
				this.ignoreInstance.add(".rooignore")
			} else {
				this.rooIgnoreContent = undefined

				// Fallback to .gitignore if .rooignore doesn't exist
				if (await fileExistsAtPath(gitIgnorePath)) {
					const content = await fs.readFile(gitIgnorePath, "utf8")
					this.gitIgnoreContent = content
					this.ignoreInstance.add(content)
					this.ignoreInstance.add(".gitignore")
					this.usingGitIgnoreFallback = true
				} else {
					this.gitIgnoreContent = undefined
				}
			}
		} catch (error) {
			// Should never happen: reading file failed even though it exists
			console.error("Unexpected error loading ignore patterns:", error)
		}
	}

	/**
	 * Check if a file should be accessible to the LLM
	 * Automatically resolves symlinks
	 * @param filePath - Path to check (relative to cwd)
	 * @returns true if file is accessible, false if ignored
	 */
	validateAccess(filePath: string): boolean {
		// Always allow access if no ignore patterns are loaded
		if (!this.rooIgnoreContent && !this.usingGitIgnoreFallback) {
			return true
		}
		try {
			const absolutePath = path.resolve(this.cwd, filePath)

			// Follow symlinks to get the real path
			let realPath: string
			try {
				realPath = fsSync.realpathSync(absolutePath)
			} catch {
				// If realpath fails (file doesn't exist, broken symlink, etc.),
				// use the original path
				realPath = absolutePath
			}

			// Convert real path to relative for .rooignore checking
			const relativePath = path.relative(this.cwd, realPath).toPosix()

			// Check if the real path is ignored
			return !this.ignoreInstance.ignores(relativePath)
		} catch (error) {
			// Allow access to files outside cwd or on errors (backward compatibility)
			return true
		}
	}

	/**
	 * Check if a terminal command should be allowed to execute based on file access patterns
	 * @param command - Terminal command to validate
	 * @returns path of file that is being accessed if it is being accessed, undefined if command is allowed
	 */
	validateCommand(command: string): string | undefined {
		// Always allow if no ignore patterns are loaded
		if (!this.rooIgnoreContent && !this.usingGitIgnoreFallback) {
			return undefined
		}

		// Split command into parts and get the base command
		const parts = command.trim().split(/\s+/)
		const baseCommand = parts[0].toLowerCase()

		// Commands that read file contents
		const fileReadingCommands = [
			// Unix commands
			"cat",
			"less",
			"more",
			"head",
			"tail",
			"grep",
			"awk",
			"sed",
			// PowerShell commands and aliases
			"get-content",
			"gc",
			"type",
			"select-string",
			"sls",
		]

		if (fileReadingCommands.includes(baseCommand)) {
			// Check each argument that could be a file path
			for (let i = 1; i < parts.length; i++) {
				const arg = parts[i]
				// Skip command flags/options (both Unix and PowerShell style)
				if (arg.startsWith("-") || arg.startsWith("/")) {
					continue
				}
				// Ignore PowerShell parameter names
				if (arg.includes(":")) {
					continue
				}
				// Validate file access
				if (!this.validateAccess(arg)) {
					return arg
				}
			}
		}

		return undefined
	}

	/**
	 * Filter an array of paths, removing those that should be ignored
	 * @param paths - Array of paths to filter (relative to cwd)
	 * @returns Array of allowed paths
	 */
	filterPaths(paths: string[]): string[] {
		try {
			return paths
				.map((p) => ({
					path: p,
					allowed: this.validateAccess(p),
				}))
				.filter((x) => x.allowed)
				.map((x) => x.path)
		} catch (error) {
			console.error("Error filtering paths:", error)
			return [] // Fail closed for security
		}
	}

	/**
	 * Clean up resources when the controller is no longer needed
	 */
	dispose(): void {
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
	}

	/**
	 * Get formatted instructions about the ignore file for the LLM
	 * @returns Formatted instructions or undefined if no ignore patterns exist
	 */
	getInstructions(): string | undefined {
		if (this.rooIgnoreContent) {
			return `# .rooignore\n\n(The following is provided by a root-level .rooignore file where the user has specified files and directories that should not be accessed. When using list_files, you'll notice a ${LOCK_TEXT_SYMBOL} next to files that are blocked. Attempting to access the file's contents e.g. through read_file will result in an error.)\n\n${this.rooIgnoreContent}\n.rooignore`
		} else if (this.usingGitIgnoreFallback && this.gitIgnoreContent) {
			return `# .gitignore (fallback)\n\n(The following is provided by a root-level .gitignore file that is being used as fallback ignore patterns since no .rooignore file exists. When using list_files, you'll notice a ${LOCK_TEXT_SYMBOL} next to files that are blocked. Attempting to access the file's contents e.g. through read_file will result in an error.)\n\n${this.gitIgnoreContent}\n.gitignore`
		}
		return undefined
	}

	/**
	 * Check if the controller is using .gitignore as fallback
	 * @returns true if using .gitignore patterns because .rooignore doesn't exist
	 */
	isUsingGitIgnoreFallback(): boolean {
		return this.usingGitIgnoreFallback
	}
}
