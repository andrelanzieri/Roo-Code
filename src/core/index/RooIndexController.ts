import path from "path"
import { fileExistsAtPath } from "../../utils/fs"
import fs from "fs/promises"
import ignore, { Ignore } from "ignore"
import * as vscode from "vscode"

/**
 * Controls code indexer file inclusion by providing override patterns for gitignored files.
 * Uses the 'ignore' library to support standard .gitignore syntax in .rooindex files.
 *
 * The .rooindex file allows developers to specify patterns for files that should be
 * indexed even if they are gitignored. This is useful for:
 * - Generated code (TypeScript definitions, API clients)
 * - Meta-repository patterns with nested repositories
 * - Monorepos with selective version control
 * - Projects with generated documentation or configuration
 */
export class RooIndexController {
	private cwd: string
	private includeInstance: Ignore
	private disposables: vscode.Disposable[] = []
	rooIndexContent: string | undefined

	constructor(cwd: string) {
		this.cwd = cwd
		this.includeInstance = ignore()
		this.rooIndexContent = undefined
		// Set up file watcher for .rooindex
		this.setupFileWatcher()
	}

	/**
	 * Initialize the controller by loading custom patterns
	 * Must be called after construction and before using the controller
	 */
	async initialize(): Promise<void> {
		await this.loadRooIndex()
	}

	/**
	 * Set up the file watcher for .rooindex changes
	 */
	private setupFileWatcher(): void {
		const rooindexPattern = new vscode.RelativePattern(this.cwd, ".rooindex")
		const fileWatcher = vscode.workspace.createFileSystemWatcher(rooindexPattern)

		// Watch for changes and updates
		this.disposables.push(
			fileWatcher.onDidChange(() => {
				this.loadRooIndex()
			}),
			fileWatcher.onDidCreate(() => {
				this.loadRooIndex()
			}),
			fileWatcher.onDidDelete(() => {
				this.loadRooIndex()
			}),
		)

		// Add fileWatcher itself to disposables
		this.disposables.push(fileWatcher)
	}

	/**
	 * Load custom patterns from .rooindex if it exists
	 */
	private async loadRooIndex(): Promise<void> {
		try {
			// Reset include instance to prevent duplicate patterns
			this.includeInstance = ignore()
			const indexPath = path.join(this.cwd, ".rooindex")
			if (await fileExistsAtPath(indexPath)) {
				const content = await fs.readFile(indexPath, "utf8")
				this.rooIndexContent = content
				// Add patterns to the include instance
				// Note: We're using ignore library in reverse - patterns match what to INCLUDE
				this.includeInstance.add(content)
			} else {
				this.rooIndexContent = undefined
			}
		} catch (error) {
			// Should never happen: reading file failed even though it exists
			console.error("Unexpected error loading .rooindex:", error)
		}
	}

	/**
	 * Check if a file should be included for indexing based on .rooindex patterns
	 * @param filePath - Path to check (relative to cwd or absolute)
	 * @returns true if file matches an inclusion pattern, false otherwise
	 */
	shouldInclude(filePath: string): boolean {
		// If .rooindex does not exist, no overrides
		if (!this.rooIndexContent) {
			return false
		}
		try {
			// Convert to relative path for pattern matching
			let relativePath: string
			if (path.isAbsolute(filePath)) {
				relativePath = path.relative(this.cwd, filePath)
			} else {
				relativePath = filePath
			}

			// Normalize path separators for cross-platform compatibility
			relativePath = relativePath.replace(/\\/g, "/")

			// Check if the path matches any include pattern
			// We're using the ignore library to match patterns, but we want inclusion behavior
			// The library returns true if a path should be ignored, but we're using it for inclusion
			// So if ignores() returns true, it means the path matches our inclusion pattern
			return this.includeInstance.ignores(relativePath)
		} catch (error) {
			// On error, don't include the file
			return false
		}
	}

	/**
	 * Filter an array of paths to include only those that match .rooindex patterns
	 * @param paths - Array of paths to filter
	 * @returns Array of paths that match inclusion patterns
	 */
	filterForInclusion(paths: string[]): string[] {
		if (!this.rooIndexContent) {
			return []
		}

		try {
			return paths.filter((p) => this.shouldInclude(p))
		} catch (error) {
			console.error("Error filtering paths for inclusion:", error)
			return []
		}
	}

	/**
	 * Check if a file that would normally be gitignored should be included for indexing
	 * @param filePath - Path to check
	 * @param isGitignored - Whether the file is gitignored
	 * @returns true if the file should be included despite being gitignored
	 */
	shouldOverrideGitignore(filePath: string, isGitignored: boolean): boolean {
		// If not gitignored, no need to override
		if (!isGitignored) {
			return false
		}

		// Check if .rooindex says to include this gitignored file
		return this.shouldInclude(filePath)
	}

	/**
	 * Clean up resources when the controller is no longer needed
	 */
	dispose(): void {
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
	}

	/**
	 * Get formatted instructions about the .rooindex file
	 * @returns Formatted instructions or undefined if .rooindex doesn't exist
	 */
	getInstructions(): string | undefined {
		if (!this.rooIndexContent) {
			return undefined
		}

		return `# .rooindex\n\n(The following patterns from .rooindex specify files that should be indexed even if they are gitignored. This allows the code indexer to access generated code, nested repositories, and other files excluded from version control but valuable for AI context.)\n\n${this.rooIndexContent}`
	}
}
