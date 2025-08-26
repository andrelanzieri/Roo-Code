import { truncateOutput, applyRunLengthEncoding, processBackspaces, processCarriageReturns } from "../misc/extract-text"
import { DEFAULT_TERMINAL_OUTPUT_CHARACTER_LIMIT } from "@roo-code/types"

import type {
	RooTerminalProvider,
	RooTerminal,
	RooTerminalCallbacks,
	RooTerminalProcess,
	RooTerminalProcessResultPromise,
	ExitCodeDetails,
	CompoundProcessCompletion,
} from "./types"

export abstract class BaseTerminal implements RooTerminal {
	public readonly provider: RooTerminalProvider
	public readonly id: number
	public readonly initialCwd: string

	public busy: boolean
	public running: boolean
	protected streamClosed: boolean

	public taskId?: string
	public process?: RooTerminalProcess
	public completedProcesses: RooTerminalProcess[] = []

	// Compound command tracking
	public isCompoundCommand: boolean = false
	public compoundProcessCompletions: CompoundProcessCompletion[] = []
	public expectedCompoundProcessCount: number = 0
	private compoundCommandWaitTimeout?: NodeJS.Timeout

	constructor(provider: RooTerminalProvider, id: number, cwd: string) {
		this.provider = provider
		this.id = id
		this.initialCwd = cwd
		this.busy = false
		this.running = false
		this.streamClosed = false
		this.isCompoundCommand = false
		this.compoundProcessCompletions = []
	}

	public getCurrentWorkingDirectory(): string {
		return this.initialCwd
	}

	abstract isClosed(): boolean

	abstract runCommand(command: string, callbacks: RooTerminalCallbacks): RooTerminalProcessResultPromise

	/**
	 * Sets the active stream for this terminal and notifies the process
	 * @param stream The stream to set, or undefined to clean up
	 * @throws Error if process is undefined when a stream is provided
	 */
	public setActiveStream(stream: AsyncIterable<string> | undefined, pid?: number): void {
		if (stream) {
			if (!this.process) {
				this.running = false

				console.warn(
					`[Terminal ${this.provider}/${this.id}] process is undefined, so cannot set terminal stream (probably user-initiated non-Roo command)`,
				)

				return
			}

			this.running = true
			this.streamClosed = false
			this.process.emit("shell_execution_started", pid)
			this.process.emit("stream_available", stream)
		} else {
			this.streamClosed = true
		}
	}

	/**
	 * Detects if a command is a compound command (contains operators like &&, ||, ;)
	 * @param command The command to check
	 */
	public detectCompoundCommand(command: string): void {
		// Reset previous compound command state
		this.compoundProcessCompletions = []
		this.expectedCompoundProcessCount = 0

		// Clear any existing timeout
		if (this.compoundCommandWaitTimeout) {
			clearTimeout(this.compoundCommandWaitTimeout)
			this.compoundCommandWaitTimeout = undefined
		}

		// Common shell operators that create compound commands
		const compoundOperators = ["&&", "||", ";", "|", "&"]

		// Check if command contains any compound operators
		this.isCompoundCommand = compoundOperators.some((op) => command.includes(op))

		if (this.isCompoundCommand) {
			// Estimate the number of processes (this is a heuristic, not exact)
			// For && and ||, each operator adds one process
			// For ;, each semicolon adds one process
			// For |, each pipe adds one process
			// For &, it's a background process indicator
			let processCount = 1

			// Count && and || operators
			const andMatches = command.match(/&&/g)
			const orMatches = command.match(/\|\|/g)
			const semiMatches = command.match(/;/g)
			const pipeMatches = command.match(/\|(?!\|)/g) // Match single | but not ||
			// Match single & but not &&, and not preceded by &
			const bgMatches = command.match(/(?<!&)&(?!&)/g)

			if (andMatches) processCount += andMatches.length
			if (orMatches) processCount += orMatches.length
			if (semiMatches) processCount += semiMatches.length
			if (pipeMatches) processCount += pipeMatches.length
			if (bgMatches) processCount += bgMatches.length

			this.expectedCompoundProcessCount = processCount

			console.info(
				`[Terminal ${this.id}] Detected compound command with estimated ${processCount} processes:`,
				command,
			)

			// Set a timeout to handle cases where we don't receive all expected completions
			this.compoundCommandWaitTimeout = setTimeout(() => {
				if (this.compoundProcessCompletions.length > 0) {
					console.warn(
						`[Terminal ${this.id}] Compound command timeout - processing ${this.compoundProcessCompletions.length} completions`,
					)
					this.finalizeCompoundCommand()
				}
			}, 10000) // 10 second timeout for compound commands
		}
	}

	/**
	 * Adds a compound process completion
	 * @param exitDetails The exit details of the completed process
	 * @param command The command that completed
	 */
	public addCompoundProcessCompletion(exitDetails: ExitCodeDetails, command: string): void {
		if (!this.isCompoundCommand) {
			console.warn(`[Terminal ${this.id}] Received compound process completion but not tracking compound command`)
			return
		}

		this.compoundProcessCompletions.push({
			exitDetails,
			command,
			timestamp: Date.now(),
		})

		console.info(
			`[Terminal ${this.id}] Added compound process completion ${this.compoundProcessCompletions.length}/${this.expectedCompoundProcessCount}:`,
			command,
		)

		// Check if all expected processes have completed
		// Note: We check this after adding, so the finalization happens after the last process is added
		if (this.allCompoundProcessesComplete()) {
			console.info(`[Terminal ${this.id}] All compound processes complete, finalizing`)
			this.finalizeCompoundCommand()
		}
	}

	/**
	 * Checks if all compound processes have completed
	 * @returns True if all expected processes have completed
	 */
	public allCompoundProcessesComplete(): boolean {
		// If we're not tracking a compound command, consider it complete
		if (!this.isCompoundCommand) {
			return true
		}

		// Check if we've received completions for all expected processes
		// We use >= because sometimes we might get more completions than expected
		const isComplete = this.compoundProcessCompletions.length >= this.expectedCompoundProcessCount

		console.info(
			`[Terminal ${this.id}] Checking compound completion: ${this.compoundProcessCompletions.length}/${this.expectedCompoundProcessCount} = ${isComplete}`,
		)

		return isComplete
	}

	/**
	 * Gets the combined output from all compound processes
	 * @returns The combined output string
	 */
	public getCompoundProcessOutputs(): string {
		// Combine outputs from all completed processes
		const outputs: string[] = []

		for (const completion of this.compoundProcessCompletions) {
			outputs.push(`[Command: ${completion.command}]`)
			outputs.push(`[Exit Code: ${completion.exitDetails.exitCode}]`)
			if (completion.exitDetails.signalName) {
				outputs.push(`[Signal: ${completion.exitDetails.signalName}]`)
			}
		}

		return outputs.join("\n")
	}

	/**
	 * Finalizes a compound command execution
	 */
	public finalizeCompoundCommand(): void {
		// Clear the timeout if it exists
		if (this.compoundCommandWaitTimeout) {
			clearTimeout(this.compoundCommandWaitTimeout)
			this.compoundCommandWaitTimeout = undefined
		}

		// Get the last exit details (from the final process in the chain)
		const lastCompletion = this.compoundProcessCompletions[this.compoundProcessCompletions.length - 1]
		const finalExitDetails = lastCompletion?.exitDetails || { exitCode: 0 }

		console.info(
			`[Terminal ${this.id}] Finalizing compound command with ${this.compoundProcessCompletions.length} processes`,
		)

		// Reset compound command tracking BEFORE calling shellExecutionComplete
		// to prevent re-entrance issues
		const wasCompound = this.isCompoundCommand
		this.isCompoundCommand = false
		this.compoundProcessCompletions = []
		this.expectedCompoundProcessCount = 0

		// Complete the terminal process with the final exit details
		// Only if we were actually tracking a compound command
		if (wasCompound) {
			this.shellExecutionComplete(finalExitDetails)
		}
	}

	/**
	 * Handles shell execution completion for this terminal.
	 * @param exitDetails The exit details of the shell execution
	 */
	public shellExecutionComplete(exitDetails: ExitCodeDetails) {
		this.busy = false
		this.running = false

		if (this.process) {
			// Add to the front of the queue (most recent first).
			if (this.process.hasUnretrievedOutput()) {
				this.completedProcesses.unshift(this.process)
			}

			this.process.emit("shell_execution_complete", exitDetails)
			this.process = undefined
		}
	}

	public get isStreamClosed(): boolean {
		return this.streamClosed
	}

	/**
	 * Gets the last executed command
	 * @returns The last command string or empty string if none
	 */
	public getLastCommand(): string {
		// Return the command from the active process or the most recent process in the queue
		if (this.process) {
			return this.process.command || ""
		} else if (this.completedProcesses.length > 0) {
			return this.completedProcesses[0].command || ""
		}

		return ""
	}

	/**
	 * Cleans the process queue by removing processes that no longer have unretrieved output
	 * or don't belong to the current task
	 */
	public cleanCompletedProcessQueue(): void {
		// Keep only processes with unretrieved output
		this.completedProcesses = this.completedProcesses.filter((process) => process.hasUnretrievedOutput())
	}

	/**
	 * Gets all processes with unretrieved output
	 * @returns Array of processes with unretrieved output
	 */
	public getProcessesWithOutput(): RooTerminalProcess[] {
		// Clean the queue first to remove any processes without output
		this.cleanCompletedProcessQueue()
		return [...this.completedProcesses]
	}

	/**
	 * Gets all unretrieved output from both active and completed processes
	 * @returns Combined unretrieved output from all processes
	 */
	public getUnretrievedOutput(): string {
		let output = ""

		// First check completed processes to maintain chronological order
		for (const process of this.completedProcesses) {
			const processOutput = process.getUnretrievedOutput()

			if (processOutput) {
				output += processOutput
			}
		}

		// Then check active process for most recent output
		const activeOutput = this.process?.getUnretrievedOutput()

		if (activeOutput) {
			output += activeOutput
		}

		this.cleanCompletedProcessQueue()
		return output
	}

	public static defaultShellIntegrationTimeout = 5_000
	private static shellIntegrationTimeout: number = BaseTerminal.defaultShellIntegrationTimeout
	private static shellIntegrationDisabled: boolean = false
	private static commandDelay: number = 0
	private static powershellCounter: boolean = false
	private static terminalZshClearEolMark: boolean = true
	private static terminalZshOhMy: boolean = false
	private static terminalZshP10k: boolean = false
	private static terminalZdotdir: boolean = false
	private static compressProgressBar: boolean = true

	/**
	 * Compresses terminal output by applying run-length encoding and truncating to line limit
	 * @param input The terminal output to compress
	 * @returns The compressed terminal output
	 */
	public static setShellIntegrationTimeout(timeoutMs: number): void {
		BaseTerminal.shellIntegrationTimeout = timeoutMs
	}

	public static getShellIntegrationTimeout(): number {
		return BaseTerminal.shellIntegrationTimeout
	}

	public static setShellIntegrationDisabled(disabled: boolean): void {
		BaseTerminal.shellIntegrationDisabled = disabled
	}

	public static getShellIntegrationDisabled(): boolean {
		return BaseTerminal.shellIntegrationDisabled
	}

	/**
	 * Sets the command delay in milliseconds
	 * @param delayMs The delay in milliseconds
	 */
	public static setCommandDelay(delayMs: number): void {
		BaseTerminal.commandDelay = delayMs
	}

	/**
	 * Gets the command delay in milliseconds
	 * @returns The command delay in milliseconds
	 */
	public static getCommandDelay(): number {
		return BaseTerminal.commandDelay
	}

	/**
	 * Sets whether to use the PowerShell counter workaround
	 * @param enabled Whether to enable the PowerShell counter workaround
	 */
	public static setPowershellCounter(enabled: boolean): void {
		BaseTerminal.powershellCounter = enabled
	}

	/**
	 * Gets whether to use the PowerShell counter workaround
	 * @returns Whether the PowerShell counter workaround is enabled
	 */
	public static getPowershellCounter(): boolean {
		return BaseTerminal.powershellCounter
	}

	/**
	 * Sets whether to clear the ZSH EOL mark
	 * @param enabled Whether to clear the ZSH EOL mark
	 */
	public static setTerminalZshClearEolMark(enabled: boolean): void {
		BaseTerminal.terminalZshClearEolMark = enabled
	}

	/**
	 * Gets whether to clear the ZSH EOL mark
	 * @returns Whether the ZSH EOL mark clearing is enabled
	 */
	public static getTerminalZshClearEolMark(): boolean {
		return BaseTerminal.terminalZshClearEolMark
	}

	/**
	 * Sets whether to enable Oh My Zsh shell integration
	 * @param enabled Whether to enable Oh My Zsh shell integration
	 */
	public static setTerminalZshOhMy(enabled: boolean): void {
		BaseTerminal.terminalZshOhMy = enabled
	}

	/**
	 * Gets whether Oh My Zsh shell integration is enabled
	 * @returns Whether Oh My Zsh shell integration is enabled
	 */
	public static getTerminalZshOhMy(): boolean {
		return BaseTerminal.terminalZshOhMy
	}

	/**
	 * Sets whether to enable Powerlevel10k shell integration
	 * @param enabled Whether to enable Powerlevel10k shell integration
	 */
	public static setTerminalZshP10k(enabled: boolean): void {
		BaseTerminal.terminalZshP10k = enabled
	}

	/**
	 * Gets whether Powerlevel10k shell integration is enabled
	 * @returns Whether Powerlevel10k shell integration is enabled
	 */
	public static getTerminalZshP10k(): boolean {
		return BaseTerminal.terminalZshP10k
	}

	/**
	 * Compresses terminal output by applying run-length encoding and truncating to line and character limits
	 * @param input The terminal output to compress
	 * @param lineLimit Maximum number of lines to keep
	 * @param characterLimit Optional maximum number of characters to keep (defaults to DEFAULT_TERMINAL_OUTPUT_CHARACTER_LIMIT)
	 * @returns The compressed terminal output
	 */
	public static compressTerminalOutput(input: string, lineLimit: number, characterLimit?: number): string {
		let processedInput = input

		if (BaseTerminal.compressProgressBar) {
			processedInput = processCarriageReturns(processedInput)
			processedInput = processBackspaces(processedInput)
		}

		// Default character limit to prevent context window explosion
		const effectiveCharLimit = characterLimit ?? DEFAULT_TERMINAL_OUTPUT_CHARACTER_LIMIT

		return truncateOutput(applyRunLengthEncoding(processedInput), lineLimit, effectiveCharLimit)
	}

	/**
	 * Sets whether to enable ZDOTDIR handling for zsh
	 * @param enabled Whether to enable ZDOTDIR handling
	 */
	public static setTerminalZdotdir(enabled: boolean): void {
		BaseTerminal.terminalZdotdir = enabled
	}

	/**
	 * Gets whether ZDOTDIR handling is enabled
	 * @returns Whether ZDOTDIR handling is enabled
	 */
	public static getTerminalZdotdir(): boolean {
		return BaseTerminal.terminalZdotdir
	}

	/**
	 * Sets whether to compress progress bar output by processing carriage returns
	 * @param enabled Whether to enable progress bar compression
	 */
	public static setCompressProgressBar(enabled: boolean): void {
		BaseTerminal.compressProgressBar = enabled
	}

	/**
	 * Gets whether progress bar compression is enabled
	 * @returns Whether progress bar compression is enabled
	 */
	public static getCompressProgressBar(): boolean {
		return BaseTerminal.compressProgressBar
	}
}
