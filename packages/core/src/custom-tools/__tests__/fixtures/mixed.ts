import { z } from "zod"

// This is a valid tool.
export const validTool = {
	description: "Valid",
	parameters: z.object({}),
	async execute() {
		return "valid"
	},
}

// These should be silently skipped.
export const someString = "not a tool"
export const someNumber = 42
export const someObject = { foo: "bar" }
