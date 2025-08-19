import path from "path"
import { fileExistsAtPath } from "../../utils/fs"
import fs from "fs/promises"
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

	constructor(cwd: string) {
		this.cwd = cwd
		this.ignoreInstance = ignore()
		this.rooIgnoreContent = undefined
		// Set up file watcher for .rooignore
		this.setupFileWatcher()
	}

	/**
	 * Initialize the controller by loading custom patterns
	 * Must be called after construction and before using the controller
	 */
	async initialize(): Promise<void> {
		await this.loadRooIgnore()
	}

	/**
	 * Set up the file watcher for .rooignore changes
	 */
	private setupFileWatcher(): void {
		const rooignorePattern = new vscode.RelativePattern(this.cwd, ".rooignore")
		const fileWatcher = vscode.workspace.createFileSystemWatcher(rooignorePattern)

		// Watch for changes and updates
		this.disposables.push(
			fileWatcher.onDidChange(() => {
				this.loadRooIgnore()
			}),
			fileWatcher.onDidCreate(() => {
				this.loadRooIgnore()
			}),
			fileWatcher.onDidDelete(() => {
				this.loadRooIgnore()
			}),
		)

		// Add fileWatcher itself to disposables
		this.disposables.push(fileWatcher)
	}

	/**
	 * Load custom patterns from .rooignore if it exists
	 */
	private async loadRooIgnore(): Promise<void> {
		try {
			// Reset ignore instance to prevent duplicate patterns
			this.ignoreInstance = ignore()
			const ignorePath = path.join(this.cwd, ".rooignore")
			if (await fileExistsAtPath(ignorePath)) {
				const content = await fs.readFile(ignorePath, "utf8")
				this.rooIgnoreContent = content
				this.ignoreInstance.add(content)
				this.ignoreInstance.add(".rooignore")
			} else {
				this.rooIgnoreContent = undefined
			}
		} catch (error) {
			// Should never happen: reading file failed even though it exists
			console.error("Unexpected error loading .rooignore:", error)
		}
	}

	/**
	 * Check if a file should be accessible to the LLM
	 * @param filePath - Path to check (relative to cwd)
	 * @returns true if file is accessible, false if ignored
	 */
	validateAccess(filePath: string): boolean {
		// Always allow access if .rooignore does not exist
		if (!this.rooIgnoreContent) {
			return true
		}
		try {
			// Normalize path to be relative to cwd and use forward slashes
			const absolutePath = path.resolve(this.cwd, filePath)
			const relativePath = path.relative(this.cwd, absolutePath).toPosix()

			// Ignore expects paths to be path.relative()'d
			return !this.ignoreInstance.ignores(relativePath)
		} catch (error) {
			// console.error(`Error validating access for ${filePath}:`, error)
			// Ignore is designed to work with relative file paths, so will throw error for paths outside cwd. We are allowing access to all files outside cwd.
			return true
		}
	}

	/**
	 * Check if a terminal command should be allowed to execute based on file access patterns
	 * @param command - Terminal command to validate
	 * @returns path of file that is being accessed if it is being accessed, undefined if command is allowed
	 */
	validateCommand(command: string): string | undefined {
		// Always allow if no .rooignore exists
		if (!this.rooIgnoreContent) {
			return undefined
		}

		// First, check for shell redirections and command substitutions that could read files
		// These patterns can bypass simple command parsing
		const dangerousPatterns = [
			// Input redirection: < file, <file
			/<\s*([^\s<>|;&]+)/g,
			// Command substitution: $(cat file), `cat file`
			/\$\([^)]*\b(cat|head|tail|less|more|grep|awk|sed|type|gc|get-content)\s+([^\s)]+)[^)]*\)/gi,
			/`[^`]*\b(cat|head|tail|less|more|grep|awk|sed|type|gc|get-content)\s+([^\s`]+)[^`]*`/gi,
			// Process substitution: <(cat file)
			/<\([^)]*\b(cat|head|tail|less|more|grep|awk|sed|type|gc|get-content)\s+([^\s)]+)[^)]*\)/gi,
			// Here documents/strings that might reference files
			/<<<?\s*([^\s<>|;&]+)/g,
		]

		for (const pattern of dangerousPatterns) {
			const matches = command.matchAll(pattern)
			for (const match of matches) {
				// Get the potential file path from the match
				// Different patterns have the file path at different indices
				const potentialPaths = [match[1], match[2], match[3]].filter(Boolean)
				for (const filePath of potentialPaths) {
					if (filePath && !this.validateAccess(filePath)) {
						return filePath
					}
				}
			}
		}

		// Check for piped commands that might expose file contents
		// e.g., echo "$(cat file)" or echo `cat file`
		const pipelineCommands = command.split(/[|;&]/).map((cmd) => cmd.trim())

		for (const pipeCmd of pipelineCommands) {
			// Split command into parts and get the base command
			const parts = pipeCmd.split(/\s+/)
			if (parts.length === 0) continue

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
				"nl",
				"tac",
				"rev",
				"cut",
				"paste",
				"sort",
				"uniq",
				"comm",
				"diff",
				"cmp",
				"od",
				"hexdump",
				"xxd",
				"strings",
				"file",
				// Additional Unix utilities
				"zcat",
				"zless",
				"zmore",
				"bzcat",
				"xzcat",
				"view",
				// PowerShell commands and aliases
				"get-content",
				"gc",
				"type",
				"select-string",
				"sls",
				// Windows commands
				"findstr",
				"find",
				"fc",
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
					if (arg.includes(":") && i > 0 && parts[i - 1].startsWith("-")) {
						continue
					}
					// Skip empty arguments
					if (!arg) {
						continue
					}
					// Remove quotes if present
					const cleanArg = arg.replace(/^["']|["']$/g, "")
					// Validate file access
					if (!this.validateAccess(cleanArg)) {
						return cleanArg
					}
				}
			}

			// Also check for commands that might read files indirectly
			// e.g., xargs cat, find -exec cat, etc.
			if (baseCommand === "xargs" || baseCommand === "find") {
				// Look for file-reading commands in the arguments
				const argsStr = parts.slice(1).join(" ")
				for (const readCmd of fileReadingCommands) {
					if (argsStr.includes(readCmd)) {
						// Try to extract file paths from find patterns or xargs input
						// This is complex, so we'll check common patterns
						const filePatterns = argsStr.match(/(?:name|path)\s+["']?([^"'\s]+)["']?/gi)
						if (filePatterns) {
							for (const pattern of filePatterns) {
								const filePath = pattern.replace(/(?:name|path)\s+["']?([^"'\s]+)["']?/i, "$1")
								if (!this.validateAccess(filePath)) {
									return filePath
								}
							}
						}
					}
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
	 * Get formatted instructions about the .rooignore file for the LLM
	 * @returns Formatted instructions or undefined if .rooignore doesn't exist
	 */
	getInstructions(): string | undefined {
		if (!this.rooIgnoreContent) {
			return undefined
		}

		return `# .rooignore\n\n(The following is provided by a root-level .rooignore file where the user has specified files and directories that should not be accessed. When using list_files, you'll notice a ${LOCK_TEXT_SYMBOL} next to files that are blocked. Attempting to access the file's contents e.g. through read_file will result in an error.)\n\n${this.rooIgnoreContent}\n.rooignore`
	}
}
