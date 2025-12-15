/**
 * CustomToolRegistry - A reusable class for dynamically loading and managing TypeScript tools.
 *
 * Features:
 * - Dynamic TypeScript/JavaScript tool loading with esbuild transpilation.
 * - Zod-based validation of tool definitions.
 * - Tool execution with context.
 * - JSON Schema generation for LLM integration.
 */

import fs from "fs"
import path from "path"
import { createHash } from "crypto"
import os from "os"

import { build } from "esbuild"
import { z, type ZodType } from "zod"

/**
 * Default subdirectory name for custom tools within a .roo directory.
 * Tools placed in `{rooDir}/tools/` will be automatically discovered and loaded.
 *
 * @example
 * ```ts
 * // Typical usage with getRooDirectoriesForCwd from roo-config:
 * for (const rooDir of getRooDirectoriesForCwd(cwd)) {
 *   await registry.loadFromDirectory(path.join(rooDir, TOOLS_DIR_NAME))
 * }
 * ```
 */
export const TOOLS_DIR_NAME = "tools"

export interface ToolContext {
	sessionID: string
	messageID: string
	agent: string
}

export interface ToolDefinition {
	description: string
	parameters?: ZodType
	args?: ZodType
	execute: (args: unknown, context: ToolContext) => Promise<string>
}

export interface RegisteredTool {
	id: string
	description: string
	parameters?: ZodType
	execute: (args: unknown, context: ToolContext) => Promise<string>
}

export interface ToolSchema {
	name: string
	description: string
	parameters: {
		type: string
		properties: Record<string, unknown>
		required: string[]
		note?: string
	}
}

export interface LoadResult {
	loaded: string[]
	failed: Array<{ file: string; error: string }>
}

/**
 * Check if a value is a Zod schema by looking for the _def property
 * which is present on all Zod types.
 */
function isZodSchema(value: unknown): value is ZodType {
	return (
		value !== null &&
		typeof value === "object" &&
		"_def" in value &&
		typeof (value as Record<string, unknown>)._def === "object"
	)
}

/**
 * Zod schema to validate the shape of imported tool definitions.
 * This ensures tools have the required structure before registration.
 */
const ToolDefinitionSchema = z.object({
	description: z.string().min(1, "Tool must have a non-empty description"),
	parameters: z.custom<ZodType>(isZodSchema, "parameters must be a Zod schema").optional(),
	args: z.custom<ZodType>(isZodSchema, "args must be a Zod schema").optional(),
	execute: z
		.function()
		.args(z.unknown(), z.unknown())
		.returns(z.promise(z.string()))
		.describe("Async function that executes the tool"),
})

export interface RegistryOptions {
	/** Directory for caching compiled TypeScript files. */
	cacheDir?: string
	/** Additional paths for resolving node modules (useful for tools outside node_modules). */
	nodePaths?: string[]
}

export class CustomToolRegistry {
	private tools = new Map<string, RegisteredTool>()
	private tsCache = new Map<string, string>()
	private cacheDir: string
	private nodePaths: string[]

	constructor(options?: RegistryOptions) {
		this.cacheDir = options?.cacheDir ?? path.join(os.tmpdir(), "dynamic-tools-cache")
		// Default to current working directory's node_modules.
		this.nodePaths = options?.nodePaths ?? [path.join(process.cwd(), "node_modules")]
	}

	/**
	 * Load all tools from a directory.
	 * Supports both .ts and .js files.
	 *
	 * @param toolDir - Absolute path to the tools directory
	 * @returns LoadResult with lists of loaded and failed tools
	 *
	 * @example
	 * ```ts
	 * // Load tools from multiple .roo directories (global and project):
	 * import { getRooDirectoriesForCwd } from "../services/roo-config"
	 * import { CustomToolRegistry, TOOLS_DIR_NAME } from "@roo-code/core"
	 *
	 * const registry = new CustomToolRegistry()
	 * for (const rooDir of getRooDirectoriesForCwd(cwd)) {
	 *   await registry.loadFromDirectory(path.join(rooDir, TOOLS_DIR_NAME))
	 * }
	 * ```
	 */
	async loadFromDirectory(toolDir: string): Promise<LoadResult> {
		const result: LoadResult = { loaded: [], failed: [] }

		if (!fs.existsSync(toolDir)) {
			return result
		}

		const files = fs.readdirSync(toolDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"))

		for (const file of files) {
			const filePath = path.join(toolDir, file)
			const namespace = path.basename(file, path.extname(file))

			try {
				const mod = await this.importTypeScript(filePath)

				for (const [exportName, value] of Object.entries(mod)) {
					const def = this.validateToolDefinition(exportName, value)
					if (!def) continue

					const toolId = exportName === "default" ? namespace : `${namespace}_${exportName}`
					this.tools.set(toolId, {
						id: toolId,
						description: def.description,
						parameters: def.parameters || def.args,
						execute: def.execute,
					})

					result.loaded.push(toolId)
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				result.failed.push({ file, error: message })
			}
		}

		return result
	}

	/**
	 * Register a tool directly (without loading from file).
	 */
	register(id: string, definition: ToolDefinition): void {
		const validated = this.validateToolDefinition(id, definition)
		if (!validated) {
			throw new Error(`Invalid tool definition for '${id}'`)
		}

		this.tools.set(id, {
			id,
			description: validated.description,
			parameters: validated.parameters || validated.args,
			execute: validated.execute,
		})
	}

	/**
	 * Unregister a tool by ID.
	 */
	unregister(id: string): boolean {
		return this.tools.delete(id)
	}

	/**
	 * Get a tool by ID.
	 */
	get(id: string): RegisteredTool | undefined {
		return this.tools.get(id)
	}

	/**
	 * Check if a tool exists.
	 */
	has(id: string): boolean {
		return this.tools.has(id)
	}

	/**
	 * Get all registered tool IDs.
	 */
	list(): string[] {
		return Array.from(this.tools.keys())
	}

	/**
	 * Get all registered tools.
	 */
	getAll(): Map<string, RegisteredTool> {
		return new Map(this.tools)
	}

	/**
	 * Get the number of registered tools.
	 */
	get size(): number {
		return this.tools.size
	}

	/**
	 * Execute a tool with given arguments.
	 */
	async execute(toolId: string, args: unknown, context: ToolContext): Promise<string> {
		const tool = this.tools.get(toolId)
		if (!tool) {
			throw new Error(`Tool not found: ${toolId}`)
		}

		// Validate args against schema if available
		if (tool.parameters && "parse" in tool.parameters) {
			;(tool.parameters as { parse: (args: unknown) => void }).parse(args)
		}

		return tool.execute(args, context)
	}

	/**
	 * Generate JSON schema representation of all tools (for LLM integration).
	 */
	toJsonSchema(): ToolSchema[] {
		const schemas: ToolSchema[] = []

		for (const [id, tool] of this.tools) {
			const schema: ToolSchema = {
				name: id,
				description: tool.description,
				parameters: {
					type: "object",
					properties: {},
					required: [],
				},
			}

			if (tool.parameters && "_def" in tool.parameters) {
				schema.parameters.note = "(Zod schema - would be converted to JSON Schema)"
			}

			schemas.push(schema)
		}

		return schemas
	}

	/**
	 * Clear all registered tools.
	 */
	clear(): void {
		this.tools.clear()
	}

	/**
	 * Clear the TypeScript compilation cache.
	 */
	clearCache(): void {
		this.tsCache.clear()
	}

	/**
	 * Dynamically import a TypeScript or JavaScript file.
	 * TypeScript files are transpiled on-the-fly using esbuild.
	 */
	private async importTypeScript(filePath: string): Promise<Record<string, ToolDefinition>> {
		const absolutePath = path.resolve(filePath)
		const ext = path.extname(absolutePath)

		if (ext === ".js" || ext === ".mjs") {
			return import(`file://${absolutePath}`)
		}

		const stat = fs.statSync(absolutePath)
		const cacheKey = `${absolutePath}:${stat.mtimeMs}`

		// Check if we have a cached version.
		if (this.tsCache.has(cacheKey)) {
			const cachedPath = this.tsCache.get(cacheKey)!
			return import(`file://${cachedPath}`)
		}

		// Ensure cache directory exists.
		fs.mkdirSync(this.cacheDir, { recursive: true })

		const hash = createHash("sha256").update(cacheKey).digest("hex").slice(0, 16)
		const tempFile = path.join(this.cacheDir, `${hash}.mjs`)

		// Bundle the TypeScript file with dependencies.
		await build({
			entryPoints: [absolutePath],
			bundle: true,
			format: "esm",
			platform: "node",
			target: "node18",
			outfile: tempFile,
			sourcemap: "inline",
			packages: "bundle",
			// Include node_modules paths for module resolution.
			nodePaths: this.nodePaths,
		})

		this.tsCache.set(cacheKey, tempFile)
		return import(`file://${tempFile}`)
	}

	/**
	 * Validate a tool definition and return a typed result.
	 * Returns null for non-tool exports, throws for invalid tools.
	 */
	private validateToolDefinition(exportName: string, value: unknown): ToolDefinition | null {
		// Quick pre-check to filter out non-objects.
		if (!value || typeof value !== "object") {
			return null
		}

		// Check if it looks like a tool (has execute function).
		if (!("execute" in value) || typeof (value as Record<string, unknown>).execute !== "function") {
			return null
		}

		const result = ToolDefinitionSchema.safeParse(value)

		if (!result.success) {
			const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")
			throw new Error(`Invalid tool definition for '${exportName}': ${errors}`)
		}

		return result.data as ToolDefinition
	}
}

export { isZodSchema, ToolDefinitionSchema }
