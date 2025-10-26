import { describe, it, expect } from "vitest"
import { shouldUseSingleFileRead } from "../single-file-read-models.js"

describe("shouldUseSingleFileRead", () => {
	describe("with user setting", () => {
		it("should return true when useSingleFileReadMode is true, regardless of model", () => {
			// Test various models when user setting is enabled
			expect(shouldUseSingleFileRead("claude-3-5-sonnet", true)).toBe(true)
			expect(shouldUseSingleFileRead("gpt-4", true)).toBe(true)
			expect(shouldUseSingleFileRead("qwen-coder", true)).toBe(true)
			expect(shouldUseSingleFileRead("any-random-model", true)).toBe(true)
		})

		it("should return false when useSingleFileReadMode is false and model is not in the list", () => {
			// Test models that are not in the single-file list when user setting is disabled
			expect(shouldUseSingleFileRead("claude-3-5-sonnet", false)).toBe(false)
			expect(shouldUseSingleFileRead("gpt-4", false)).toBe(false)
			expect(shouldUseSingleFileRead("qwen-coder", false)).toBe(false)
		})

		it("should respect false setting even for models that normally use single-file mode", () => {
			// When user explicitly sets to false, it should override model defaults
			expect(shouldUseSingleFileRead("grok-code-fast-1", false)).toBe(false)
			expect(shouldUseSingleFileRead("code-supernova", false)).toBe(false)
			expect(shouldUseSingleFileRead("some-model-with-grok-code-fast-1-in-name", false)).toBe(false)
		})
	})

	describe("without user setting (undefined)", () => {
		it("should return true for models that include the special strings", () => {
			// Exact matches
			expect(shouldUseSingleFileRead("grok-code-fast-1", undefined)).toBe(true)
			expect(shouldUseSingleFileRead("code-supernova", undefined)).toBe(true)

			// Models that contain the special strings
			expect(shouldUseSingleFileRead("x/grok-code-fast-1", undefined)).toBe(true)
			expect(shouldUseSingleFileRead("provider/code-supernova-v2", undefined)).toBe(true)
			expect(shouldUseSingleFileRead("grok-code-fast-1-turbo", undefined)).toBe(true)
		})

		it("should return false for models not in the single-file list", () => {
			expect(shouldUseSingleFileRead("claude-3-5-sonnet", undefined)).toBe(false)
			expect(shouldUseSingleFileRead("gpt-4", undefined)).toBe(false)
			expect(shouldUseSingleFileRead("gemini-pro", undefined)).toBe(false)
			expect(shouldUseSingleFileRead("any-other-model", undefined)).toBe(false)
			expect(shouldUseSingleFileRead("", undefined)).toBe(false)
		})

		it("should return false when no parameters are provided", () => {
			expect(shouldUseSingleFileRead(undefined, undefined)).toBe(false)
		})
	})

	describe("edge cases", () => {
		it("should handle empty model string", () => {
			expect(shouldUseSingleFileRead("", true)).toBe(true) // User setting takes precedence
			expect(shouldUseSingleFileRead("", false)).toBe(false)
			expect(shouldUseSingleFileRead("", undefined)).toBe(false)
		})

		it("should handle undefined model", () => {
			expect(shouldUseSingleFileRead(undefined, true)).toBe(true) // User setting takes precedence
			expect(shouldUseSingleFileRead(undefined, false)).toBe(false)
			expect(shouldUseSingleFileRead(undefined, undefined)).toBe(false)
		})

		it("should handle partial model name matches correctly", () => {
			// The function uses includes(), so partial matches matter
			expect(shouldUseSingleFileRead("grok-code", undefined)).toBe(false) // Doesn't include full "grok-code-fast-1"
			expect(shouldUseSingleFileRead("code-fast-1", undefined)).toBe(false) // Doesn't include full "grok-code-fast-1"
			expect(shouldUseSingleFileRead("supernova", undefined)).toBe(false) // Doesn't include full "code-supernova"
			expect(shouldUseSingleFileRead("grok", undefined)).toBe(false) // Too short
			expect(shouldUseSingleFileRead("code", undefined)).toBe(false) // Too short
		})

		it("should be case-sensitive", () => {
			// The function uses includes() which is case-sensitive
			expect(shouldUseSingleFileRead("GROK-CODE-FAST-1", undefined)).toBe(false)
			expect(shouldUseSingleFileRead("Code-Supernova", undefined)).toBe(false)
			expect(shouldUseSingleFileRead("Grok-Code-Fast-1", undefined)).toBe(false)
			expect(shouldUseSingleFileRead("CODE-SUPERNOVA", undefined)).toBe(false)
		})
	})

	describe("user preference priority", () => {
		it("should always prioritize explicit user preference over model defaults", () => {
			// User explicitly wants single-file mode for a model that doesn't require it
			expect(shouldUseSingleFileRead("claude-3-5-sonnet", true)).toBe(true)

			// User explicitly doesn't want single-file mode for models that typically require it
			expect(shouldUseSingleFileRead("grok-code-fast-1", false)).toBe(false)
			expect(shouldUseSingleFileRead("code-supernova", false)).toBe(false)
			expect(shouldUseSingleFileRead("provider/grok-code-fast-1-latest", false)).toBe(false)
		})
	})
})
