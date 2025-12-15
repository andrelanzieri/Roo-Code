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

import type { ZodType, infer as ZodInfer } from "zod"

import { TaskLike } from "./task.js"

/**
 * Context provided to tool execute functions.
 */
export interface CustomToolContext {
	mode: string
	task: TaskLike
}

/**
 * A Zod-like schema interface. We use this instead of ZodType directly
 * to avoid TypeScript's excessive type instantiation (TS2589).
 */
export interface ZodLikeSchema {
	_def: unknown
	parse: (data: unknown) => unknown
	safeParse: (data: unknown) => { success: boolean; data?: unknown; error?: unknown }
}

/**
 * Definition structure for a custom tool.
 *
 * Note: This interface uses simple types to avoid TypeScript performance issues
 * with Zod's complex type inference. For type-safe parameter inference, use
 * the `defineCustomTool` helper function instead of annotating with this interface.
 */
export interface CustomToolDefinition {
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
	parameters?: ZodLikeSchema

	/**
	 * The function that executes the tool.
	 *
	 * @param args - The validated arguments
	 * @param context - Execution context with session and message info
	 * @returns A string result to return to the AI
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	execute: (args: any, context: CustomToolContext) => Promise<string>
}

/**
 * Type-safe definition structure for a custom tool with inferred parameter types.
 * Use this with `defineCustomTool` for full type inference.
 *
 * @template T - The Zod schema type for parameters
 */
export interface TypedCustomToolDefinition<T extends ZodType>
	extends Omit<CustomToolDefinition, "execute" | "parameters"> {
	parameters?: T
	execute: (args: ZodInfer<T>, context: CustomToolContext) => Promise<string>
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
 *   name: "add_numbers",
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
export function defineCustomTool<T extends ZodType>(
	definition: TypedCustomToolDefinition<T>,
): TypedCustomToolDefinition<T> {
	return definition
}

// Re-export Zod for convenient parameter schema definition.
export { z as parametersSchema, z } from "zod"

export type { ZodType, ZodObject, ZodRawShape } from "zod"
