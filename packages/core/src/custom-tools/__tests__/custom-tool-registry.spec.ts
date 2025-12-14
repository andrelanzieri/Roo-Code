import { z } from "zod"
import path from "path"
import { fileURLToPath } from "url"

import {
	type ToolContext,
	type ToolDefinition,
	CustomToolRegistry,
	ToolDefinitionSchema,
	isZodSchema,
} from "../custom-tool-registry.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TEST_FIXTURES_DIR = path.join(__dirname, "fixtures")

const testContext: ToolContext = {
	sessionID: "test-session",
	messageID: "test-message",
	agent: "test-agent",
}

describe("CustomToolRegistry", () => {
	let registry: CustomToolRegistry

	beforeEach(() => {
		registry = new CustomToolRegistry()
	})

	describe("isZodSchema", () => {
		it("should return true for Zod schemas", () => {
			expect(isZodSchema(z.string())).toBe(true)
			expect(isZodSchema(z.number())).toBe(true)
			expect(isZodSchema(z.object({ foo: z.string() }))).toBe(true)
			expect(isZodSchema(z.array(z.number()))).toBe(true)
		})

		it("should return false for non-Zod values", () => {
			expect(isZodSchema(null)).toBe(false)
			expect(isZodSchema(undefined)).toBe(false)
			expect(isZodSchema("string")).toBe(false)
			expect(isZodSchema(123)).toBe(false)
			expect(isZodSchema({})).toBe(false)
			expect(isZodSchema({ _def: "not an object" })).toBe(false)
			expect(isZodSchema([])).toBe(false)
		})
	})

	describe("ToolDefinitionSchema", () => {
		it("should validate a correct tool definition", () => {
			const validTool = {
				description: "A valid tool",
				parameters: z.object({ name: z.string() }),
				execute: async () => "result",
			}

			const result = ToolDefinitionSchema.safeParse(validTool)
			expect(result.success).toBe(true)
		})

		it("should reject empty description", () => {
			const invalidTool = {
				description: "",
				parameters: z.object({}),
				execute: async () => "result",
			}

			const result = ToolDefinitionSchema.safeParse(invalidTool)
			expect(result.success).toBe(false)
		})

		it("should reject non-Zod parameters", () => {
			const invalidTool = {
				description: "Tool with bad params",
				parameters: { foo: "bar" },
				execute: async () => "result",
			}

			const result = ToolDefinitionSchema.safeParse(invalidTool)
			expect(result.success).toBe(false)
		})

		it("should allow missing parameters", () => {
			const toolWithoutParams = {
				description: "Tool without parameters",
				execute: async () => "result",
			}

			const result = ToolDefinitionSchema.safeParse(toolWithoutParams)
			expect(result.success).toBe(true)
		})
	})

	describe("register", () => {
		it("should register a valid tool", () => {
			const tool: ToolDefinition = {
				description: "Test tool",
				parameters: z.object({ input: z.string() }),
				execute: async (args) => `Processed: ${(args as { input: string }).input}`,
			}

			registry.register("test_tool", tool)

			expect(registry.has("test_tool")).toBe(true)
			expect(registry.size).toBe(1)
		})

		it("should throw for invalid tool definition", () => {
			const invalidTool = {
				description: "",
				execute: async () => "result",
			}

			expect(() => registry.register("bad_tool", invalidTool as ToolDefinition)).toThrow(
				/Invalid tool definition/,
			)
		})

		it("should overwrite existing tool with same id", () => {
			const tool1: ToolDefinition = {
				description: "First version",
				execute: async () => "v1",
			}

			const tool2: ToolDefinition = {
				description: "Second version",
				execute: async () => "v2",
			}

			registry.register("tool", tool1)
			registry.register("tool", tool2)

			expect(registry.size).toBe(1)
			expect(registry.get("tool")?.description).toBe("Second version")
		})
	})

	describe("unregister", () => {
		it("should remove a registered tool", () => {
			registry.register("tool", {
				description: "Test",
				execute: async () => "result",
			})

			const result = registry.unregister("tool")

			expect(result).toBe(true)
			expect(registry.has("tool")).toBe(false)
		})

		it("should return false for non-existent tool", () => {
			const result = registry.unregister("nonexistent")
			expect(result).toBe(false)
		})
	})

	describe("get", () => {
		it("should return registered tool", () => {
			registry.register("my_tool", {
				description: "My tool",
				execute: async () => "result",
			})

			const tool = registry.get("my_tool")

			expect(tool).toBeDefined()
			expect(tool?.id).toBe("my_tool")
			expect(tool?.description).toBe("My tool")
		})

		it("should return undefined for non-existent tool", () => {
			expect(registry.get("nonexistent")).toBeUndefined()
		})
	})

	describe("list", () => {
		it("should return all tool IDs", () => {
			registry.register("tool_a", { description: "A", execute: async () => "a" })
			registry.register("tool_b", { description: "B", execute: async () => "b" })
			registry.register("tool_c", { description: "C", execute: async () => "c" })

			const ids = registry.list()

			expect(ids).toHaveLength(3)
			expect(ids).toContain("tool_a")
			expect(ids).toContain("tool_b")
			expect(ids).toContain("tool_c")
		})

		it("should return empty array when no tools registered", () => {
			expect(registry.list()).toEqual([])
		})
	})

	describe("getAll", () => {
		it("should return a copy of all tools", () => {
			registry.register("tool1", { description: "Tool 1", execute: async () => "1" })
			registry.register("tool2", { description: "Tool 2", execute: async () => "2" })

			const all = registry.getAll()

			expect(all.size).toBe(2)
			expect(all.get("tool1")?.description).toBe("Tool 1")
			expect(all.get("tool2")?.description).toBe("Tool 2")

			// Verify it's a copy
			all.delete("tool1")
			expect(registry.has("tool1")).toBe(true)
		})
	})

	describe("execute", () => {
		it("should execute a tool with arguments", async () => {
			registry.register("greeter", {
				description: "Greets someone",
				parameters: z.object({ name: z.string() }),
				execute: async (args) => `Hello, ${(args as { name: string }).name}!`,
			})

			const result = await registry.execute("greeter", { name: "World" }, testContext)

			expect(result).toBe("Hello, World!")
		})

		it("should throw for non-existent tool", async () => {
			await expect(registry.execute("nonexistent", {}, testContext)).rejects.toThrow(
				"Tool not found: nonexistent",
			)
		})

		it("should validate arguments against Zod schema", async () => {
			registry.register("typed_tool", {
				description: "Tool with validation",
				parameters: z.object({
					count: z.number().min(0),
				}),
				execute: async (args) => `Count: ${(args as { count: number }).count}`,
			})

			// Valid args.
			const result = await registry.execute("typed_tool", { count: 5 }, testContext)
			expect(result).toBe("Count: 5")

			// Invalid args - negative number.
			await expect(registry.execute("typed_tool", { count: -1 }, testContext)).rejects.toThrow()

			// Invalid args - wrong type.
			await expect(registry.execute("typed_tool", { count: "five" }, testContext)).rejects.toThrow()
		})

		it("should pass context to execute function", async () => {
			let receivedContext: ToolContext | null = null

			registry.register("context_checker", {
				description: "Checks context",
				execute: async (_args, ctx) => {
					receivedContext = ctx
					return "done"
				},
			})

			await registry.execute("context_checker", {}, testContext)

			expect(receivedContext).toEqual(testContext)
		})
	})

	describe("toJsonSchema", () => {
		it("should generate JSON schema for all tools", () => {
			registry.register("tool1", {
				description: "First tool",
				parameters: z.object({ a: z.string() }),
				execute: async () => "1",
			})

			registry.register("tool2", {
				description: "Second tool",
				execute: async () => "2",
			})

			const schemas = registry.toJsonSchema()

			expect(schemas).toHaveLength(2)

			const tool1Schema = schemas.find((s) => s.name === "tool1")
			expect(tool1Schema).toBeDefined()
			expect(tool1Schema?.description).toBe("First tool")
			expect(tool1Schema?.parameters.note).toBe("(Zod schema - would be converted to JSON Schema)")

			const tool2Schema = schemas.find((s) => s.name === "tool2")
			expect(tool2Schema).toBeDefined()
			expect(tool2Schema?.description).toBe("Second tool")
		})
	})

	describe("clear", () => {
		it("should remove all registered tools", () => {
			registry.register("tool1", { description: "1", execute: async () => "1" })
			registry.register("tool2", { description: "2", execute: async () => "2" })

			expect(registry.size).toBe(2)

			registry.clear()

			expect(registry.size).toBe(0)
			expect(registry.list()).toEqual([])
		})
	})

	describe("loadFromDirectory", () => {
		it("should load tools from TypeScript files", async () => {
			const result = await registry.loadFromDirectory(TEST_FIXTURES_DIR)

			expect(result.loaded).toContain("simple")
			expect(registry.has("simple")).toBe(true)
		})

		it("should handle named exports", async () => {
			const result = await registry.loadFromDirectory(TEST_FIXTURES_DIR)

			expect(result.loaded).toContain("multi_toolA")
			expect(result.loaded).toContain("multi_toolB")
		})

		it("should report validation failures", async () => {
			const result = await registry.loadFromDirectory(TEST_FIXTURES_DIR)

			const invalidFailure = result.failed.find((f) => f.file === "invalid.ts")
			expect(invalidFailure).toBeDefined()
			expect(invalidFailure?.error).toContain("Invalid tool definition")
		})

		it("should return empty results for non-existent directory", async () => {
			const result = await registry.loadFromDirectory("/nonexistent/path")

			expect(result.loaded).toHaveLength(0)
			expect(result.failed).toHaveLength(0)
		})

		it("should skip non-tool exports silently", async () => {
			const result = await registry.loadFromDirectory(TEST_FIXTURES_DIR)

			expect(result.loaded).toContain("mixed_validTool")
			// The non-tool exports should not appear in loaded or failed
			expect(result.loaded).not.toContain("mixed_someString")
			expect(result.loaded).not.toContain("mixed_someNumber")
			expect(result.loaded).not.toContain("mixed_someObject")
		})

		it("should support args as alias for parameters", async () => {
			const result = await registry.loadFromDirectory(TEST_FIXTURES_DIR)

			expect(result.loaded).toContain("legacy")

			const tool = registry.get("legacy")
			expect(tool?.parameters).toBeDefined()
		})
	})

	describe("clearCache", () => {
		it("should clear the TypeScript compilation cache", async () => {
			await registry.loadFromDirectory(TEST_FIXTURES_DIR)
			registry.clearCache()

			// Should be able to load again without issues.
			registry.clear()
			const result = await registry.loadFromDirectory(TEST_FIXTURES_DIR)

			expect(result.loaded).toContain("cached")
		})
	})
})
