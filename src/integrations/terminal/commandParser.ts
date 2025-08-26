/**
 * Utility module for parsing and handling compound shell commands.
 * Detects and splits commands with operators like &&, ||, ;, and |
 * to enable sequential execution and proper process tracking.
 */

export interface ParsedCommand {
	/** The original full command string */
	original: string
	/** Whether this is a compound command with operators */
	isCompound: boolean
	/** Individual command segments if compound, otherwise array with single command */
	segments: CommandSegment[]
}

export interface CommandSegment {
	/** The command text */
	command: string
	/** The operator that follows this command (if any) */
	operator?: "&&" | "||" | ";" | "|"
	/** Whether execution should continue based on previous exit code */
	shouldExecute: (previousExitCode: number) => boolean
}

/**
 * Parses a command string to detect compound command operators.
 * Handles &&, ||, ;, and | operators while respecting quotes and escapes.
 *
 * @param command The command string to parse
 * @returns Parsed command information
 */
export function parseCommand(command: string): ParsedCommand {
	const segments: CommandSegment[] = []
	let current = ""
	let inSingleQuote = false
	let inDoubleQuote = false
	let escaped = false
	let i = 0

	while (i < command.length) {
		const char = command[i]
		const nextChar = command[i + 1]

		// Handle escape sequences
		if (escaped) {
			current += char
			escaped = false
			i++
			continue
		}

		if (char === "\\" && !inSingleQuote) {
			escaped = true
			current += char
			i++
			continue
		}

		// Handle quotes
		if (char === "'" && !inDoubleQuote) {
			inSingleQuote = !inSingleQuote
			current += char
			i++
			continue
		}

		if (char === '"' && !inSingleQuote) {
			inDoubleQuote = !inDoubleQuote
			current += char
			i++
			continue
		}

		// If we're inside quotes, just add the character
		if (inSingleQuote || inDoubleQuote) {
			current += char
			i++
			continue
		}

		// Check for operators (only outside quotes)
		let operator: CommandSegment["operator"] | undefined
		let operatorLength = 0

		if (char === "&" && nextChar === "&") {
			operator = "&&"
			operatorLength = 2
		} else if (char === "|" && nextChar === "|") {
			operator = "||"
			operatorLength = 2
		} else if (char === ";") {
			operator = ";"
			operatorLength = 1
		} else if (char === "|" && nextChar !== "|") {
			operator = "|"
			operatorLength = 1
		}

		if (operator) {
			// Found an operator, save current segment
			const trimmedCommand = current.trim()
			if (trimmedCommand) {
				const segment = createSegment(trimmedCommand, operator)
				segments.push(segment)
			}
			current = ""
			i += operatorLength
		} else {
			current += char
			i++
		}
	}

	// Add the last segment
	const trimmedCommand = current.trim()
	if (trimmedCommand) {
		segments.push(createSegment(trimmedCommand, undefined))
	}

	// Now set the shouldExecute logic based on the PREVIOUS segment's operator
	for (let i = 1; i < segments.length; i++) {
		const prevOperator = segments[i - 1].operator

		switch (prevOperator) {
			case "&&":
				// Execute only if previous command succeeded (exit code 0)
				segments[i].shouldExecute = (exitCode) => exitCode === 0
				break
			case "||":
				// Execute only if previous command failed (non-zero exit code)
				segments[i].shouldExecute = (exitCode) => exitCode !== 0
				break
			case ";":
			case "|":
			default:
				// Always execute regardless of previous exit code
				segments[i].shouldExecute = () => true
				break
		}
	}

	// If we only have one segment with no operator, it's not compound
	const isCompound = segments.length > 1 || (segments.length === 1 && segments[0].operator !== undefined)

	return {
		original: command,
		isCompound,
		segments,
	}
}

/**
 * Creates a command segment with appropriate execution logic based on operator
 */
function createSegment(command: string, operator: CommandSegment["operator"]): CommandSegment {
	// The shouldExecute function determines if THIS segment should execute
	// based on the PREVIOUS segment's exit code and the PREVIOUS segment's operator
	// By default, segments always execute (first segment or after semicolon)
	let shouldExecute: (previousExitCode: number) => boolean = () => true

	return {
		command,
		operator,
		shouldExecute,
	}
}

/**
 * Checks if a command contains compound operators that would spawn multiple processes
 *
 * @param command The command to check
 * @returns True if the command contains compound operators
 */
export function isCompoundCommand(command: string): boolean {
	return parseCommand(command).isCompound
}

/**
 * Splits a compound command into individual commands for sequential execution.
 * Preserves the execution logic of operators like && and ||.
 *
 * @param command The compound command to split
 * @returns Array of individual commands with execution conditions
 */
export function splitCompoundCommand(command: string): CommandSegment[] {
	return parseCommand(command).segments
}
