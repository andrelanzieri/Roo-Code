/**
 * Custom Tool Definition Utilities
 *
 * This module provides utilities for defining custom tools that can be
 * loaded by the Roo Code extension. Install @roo-code/types in your
 * project to use these utilities.
 *
 * @example
 * ```ts
 * import { z, defineCustomTool } from "@roo-code/types"
 *
 * export default defineCustomTool({
 *   description: "Greets a user by name",
 *   parameters: z.object({
 *     name: z.string().describe("The name to greet"),
 *   }),
 *   async execute(args) {
 *     return `Hello, ${args.name}!`
 *   }
 * })
 * ```
 */

// Re-export Zod for convenient parameter schema definition
export { z } from "zod"
export type { ZodType, ZodObject, ZodRawShape } from "zod"

import type { ZodType, infer as ZodInfer } from "zod"

/**
 * Context provided to tool execute functions.
 */
export interface CustomToolContext {
	/** Unique identifier for the current session */
	sessionID: string
	/** Unique identifier for the current message */
	messageID: string
	/** The agent/mode that invoked the tool */
	agent: string
}

/**
 * Definition structure for a custom tool.
 *
 * @template T - The Zod schema type for parameters
 */
export interface CustomToolDefinition<T extends ZodType = ZodType> {
	/**
	 * The name of the tool.
	 * This is used to identify the tool in the prompt and in the tool registry.
	 */
	name: string

	/**
	 * A description of what the tool does.
	 * This is shown to the AI model to help it decide when to use the tool.
	 */
	description: string

	/**
	 * Optional Zod schema defining the tool's parameters.
	 * Use `z.object({})` to define the shape of arguments.
	 */
	parameters?: T

	/**
	 * The function that executes the tool.
	 *
	 * @param args - The validated arguments (typed based on the parameters schema)
	 * @param context - Execution context with session and message info
	 * @returns A string result to return to the AI
	 */
	execute: (args: T extends ZodType ? ZodInfer<T> : unknown, context: CustomToolContext) => Promise<string>
}

/**
 * Helper function to define a custom tool with proper type inference.
 *
 * This is optional - you can also just export a plain object that matches
 * the CustomToolDefinition interface.
 *
 * @example
 * ```ts
 * import { z, defineCustomTool } from "@roo-code/types"
 *
 * export default defineCustomTool({
 *   description: "Add two numbers",
 *   parameters: z.object({
 *     a: z.number().describe("First number"),
 *     b: z.number().describe("Second number"),
 *   }),
 *   async execute({ a, b }) {
 *     return `The sum is ${a + b}`
 *   }
 * })
 * ```
 */
export function defineCustomTool<T extends ZodType>(definition: CustomToolDefinition<T>): CustomToolDefinition<T> {
	return definition
}
