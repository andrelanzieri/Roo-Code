import { describe, it, expect, vi, beforeEach } from "vitest"
import { QwenCodeHandler } from "../qwen-code"
import { qwenCodeDefaultModelId, qwenCodeModels } from "@roo-code/types"

// Mock fs module
vi.mock("node:fs", () => ({
	promises: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
	},
}))

// Mock fetch
global.fetch = vi.fn()

describe("QwenCodeHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("getModel", () => {
		it("should return default model when no model is specified", () => {
			const handler = new QwenCodeHandler({})
			const { id, info } = handler.getModel()

			expect(id).toBe(qwenCodeDefaultModelId)
			expect(info).toEqual(qwenCodeModels[qwenCodeDefaultModelId])
		})

		it("should return specified model when valid model is provided", () => {
			const testModelId = "qwen3-coder-flash"
			const handler = new QwenCodeHandler({
				apiModelId: testModelId,
			})
			const { id, info } = handler.getModel()

			expect(id).toBe(testModelId)
			expect(info).toEqual(qwenCodeModels[testModelId])
		})

		it("should use default context window when qwenCodeMaxContextWindow is not set", () => {
			const handler = new QwenCodeHandler({})
			const { info } = handler.getModel()

			expect(info.contextWindow).toBe(1_000_000) // Default context window
		})

		it("should limit context window when qwenCodeMaxContextWindow is set", () => {
			const maxContextWindow = 256_000
			const handler = new QwenCodeHandler({
				qwenCodeMaxContextWindow: maxContextWindow,
			})
			const { info } = handler.getModel()

			expect(info.contextWindow).toBe(maxContextWindow)
		})

		it("should use original context window when qwenCodeMaxContextWindow is larger", () => {
			const handler = new QwenCodeHandler({
				qwenCodeMaxContextWindow: 2_000_000, // Larger than default
			})
			const { info } = handler.getModel()

			expect(info.contextWindow).toBe(1_000_000) // Should not exceed original
		})

		it("should ignore qwenCodeMaxContextWindow when it's 0 or negative", () => {
			const handler1 = new QwenCodeHandler({
				qwenCodeMaxContextWindow: 0,
			})
			const { info: info1 } = handler1.getModel()

			expect(info1.contextWindow).toBe(1_000_000) // Should use default

			const handler2 = new QwenCodeHandler({
				qwenCodeMaxContextWindow: -1,
			})
			const { info: info2 } = handler2.getModel()

			expect(info2.contextWindow).toBe(1_000_000) // Should use default
		})

		it("should apply context window limit to different models", () => {
			const maxContextWindow = 200_000
			const handler = new QwenCodeHandler({
				apiModelId: "qwen3-coder-flash",
				qwenCodeMaxContextWindow: maxContextWindow,
			})
			const { id, info } = handler.getModel()

			expect(id).toBe("qwen3-coder-flash")
			expect(info.contextWindow).toBe(maxContextWindow)
			// Other properties should remain unchanged
			expect(info.maxTokens).toBe(qwenCodeModels["qwen3-coder-flash"].maxTokens)
			expect(info.description).toBe(qwenCodeModels["qwen3-coder-flash"].description)
		})
	})
})
