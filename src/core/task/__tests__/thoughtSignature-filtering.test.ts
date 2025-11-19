// npx vitest run src/core/task/__tests__/thoughtSignature-filtering.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest"
import { Task } from "../Task"
import type { ProviderSettings } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

// Mock modules
vi.mock("delay", () => ({
	__esModule: true,
	default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("fs/promises", () => ({
	mkdir: vi.fn().mockResolvedValue(undefined),
	writeFile: vi.fn().mockResolvedValue(undefined),
	readFile: vi.fn().mockResolvedValue("[]"),
	unlink: vi.fn().mockResolvedValue(undefined),
	rmdir: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("p-wait-for", () => ({
	default: vi.fn().mockImplementation(async () => Promise.resolve()),
}))

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/mock/workspace" } }],
		getConfiguration: vi.fn(() => ({ get: (_key: string, defaultValue: any) => defaultValue })),
	},
	window: {
		createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	},
}))

vi.mock("../../../utils/storage", () => ({
	getTaskDirectoryPath: vi.fn().mockResolvedValue("/mock/storage/tasks/123"),
	getSettingsDirectoryPath: vi.fn().mockResolvedValue("/mock/storage/settings"),
}))

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockResolvedValue(false),
}))

vi.mock("../../ignore/RooIgnoreController")
vi.mock("../../protect/RooProtectedController")

describe("thoughtSignature filtering in buildCleanConversationHistory", () => {
	let mockProvider: any
	let task: Task

	beforeEach(() => {
		// Initialize telemetry service if not already initialized
		if (!TelemetryService.hasInstance()) {
			TelemetryService.createInstance([])
		}

		// Create mock provider
		mockProvider = {
			context: {
				globalStorageUri: { fsPath: "/test/storage" },
				globalState: {
					get: vi.fn().mockReturnValue(undefined),
					update: vi.fn().mockResolvedValue(undefined),
				},
				secrets: {
					get: vi.fn().mockResolvedValue(undefined),
					store: vi.fn().mockResolvedValue(undefined),
				},
			},
			postMessageToWebview: vi.fn().mockResolvedValue(undefined),
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
			updateTaskHistory: vi.fn().mockResolvedValue(undefined),
			getState: vi.fn().mockResolvedValue({}),
			log: vi.fn(),
		}
	})

	it("should keep thoughtSignature blocks when using Gemini provider", () => {
		const geminiConfig: ProviderSettings = {
			apiProvider: "gemini",
			apiModelId: "gemini-3-pro",
			geminiApiKey: "test-key",
		}

		task = new Task({
			provider: mockProvider,
			apiConfiguration: geminiConfig,
			task: "test task",
			startTask: false,
		})

		// Create test messages with thoughtSignature blocks
		const messages = [
			{
				role: "assistant" as const,
				content: [
					{ type: "text" as const, text: "Assistant response" },
					{ type: "thoughtSignature" as const, thoughtSignature: "test-signature-123" },
				],
				ts: Date.now(),
			},
			{
				role: "user" as const,
				content: [{ type: "text" as const, text: "User message" }],
				ts: Date.now(),
			},
		]

		// Call the private method using bracket notation
		const result = (task as any).buildCleanConversationHistory(messages)

		// Find the assistant message in the result
		const assistantMessage = result.find((msg: any) => msg.role === "assistant")

		// Verify thoughtSignature blocks are preserved for Gemini
		expect(assistantMessage).toBeDefined()
		expect(assistantMessage.content).toEqual([
			{ type: "text", text: "Assistant response" },
			{ type: "thoughtSignature", thoughtSignature: "test-signature-123" },
		])
	})

	it("should filter out thoughtSignature blocks when using Claude/Anthropic provider", () => {
		const anthropicConfig: ProviderSettings = {
			apiProvider: "anthropic",
			apiModelId: "claude-3-5-sonnet-20241022",
			apiKey: "test-key",
		}

		task = new Task({
			provider: mockProvider,
			apiConfiguration: anthropicConfig,
			task: "test task",
			startTask: false,
		})

		// Create test messages with thoughtSignature blocks
		const messages = [
			{
				role: "assistant" as const,
				content: [
					{ type: "text" as const, text: "Assistant response" },
					{ type: "thoughtSignature" as const, thoughtSignature: "test-signature-123" },
				],
				ts: Date.now(),
			},
			{
				role: "user" as const,
				content: [{ type: "text" as const, text: "User message" }],
				ts: Date.now(),
			},
		]

		// Call the private method using bracket notation
		const result = (task as any).buildCleanConversationHistory(messages)

		// Find the assistant message in the result
		const assistantMessage = result.find((msg: any) => msg.role === "assistant")

		// Verify thoughtSignature blocks are filtered out for non-Gemini providers
		expect(assistantMessage).toBeDefined()
		expect(assistantMessage.content).toBe("Assistant response")
	})

	it("should filter out thoughtSignature blocks from user messages for non-Gemini providers", () => {
		const openaiConfig: ProviderSettings = {
			apiProvider: "openai",
			apiModelId: "gpt-4",
			openAiApiKey: "test-key",
		}

		task = new Task({
			provider: mockProvider,
			apiConfiguration: openaiConfig,
			task: "test task",
			startTask: false,
		})

		// Create test messages with thoughtSignature blocks in user message
		const messages = [
			{
				role: "user" as const,
				content: [
					{ type: "text" as const, text: "User message" },
					{ type: "thoughtSignature" as const, thoughtSignature: "user-signature-456" },
				],
				ts: Date.now(),
			},
		]

		// Call the private method using bracket notation
		const result = (task as any).buildCleanConversationHistory(messages)

		// Find the user message in the result
		const userMessage = result.find((msg: any) => msg.role === "user")

		// Verify thoughtSignature blocks are filtered out from user messages
		expect(userMessage).toBeDefined()
		expect(userMessage.content).toEqual([{ type: "text", text: "User message" }])
	})

	it("should preserve thoughtSignature blocks when using Vertex provider (for Gemini models)", () => {
		const vertexConfig: ProviderSettings = {
			apiProvider: "vertex",
			apiModelId: "gemini-2.5-flash",
			vertexProjectId: "test-project",
			vertexRegion: "us-central1",
		}

		task = new Task({
			provider: mockProvider,
			apiConfiguration: vertexConfig,
			task: "test task",
			startTask: false,
		})

		// Create test messages with thoughtSignature blocks
		const messages = [
			{
				role: "assistant" as const,
				content: [
					{ type: "text" as const, text: "Assistant response" },
					{ type: "thoughtSignature" as const, thoughtSignature: "vertex-signature-789" },
				],
				ts: Date.now(),
			},
		]

		// Call the private method using bracket notation
		const result = (task as any).buildCleanConversationHistory(messages)

		// Find the assistant message in the result
		const assistantMessage = result.find((msg: any) => msg.role === "assistant")

		// Verify thoughtSignature blocks are preserved for Vertex (Gemini models)
		expect(assistantMessage).toBeDefined()
		expect(assistantMessage.content).toEqual([
			{ type: "text", text: "Assistant response" },
			{ type: "thoughtSignature", thoughtSignature: "vertex-signature-789" },
		])
	})

	it("should handle empty content arrays correctly", () => {
		const anthropicConfig: ProviderSettings = {
			apiProvider: "anthropic",
			apiModelId: "claude-3-5-sonnet-20241022",
			apiKey: "test-key",
		}

		task = new Task({
			provider: mockProvider,
			apiConfiguration: anthropicConfig,
			task: "test task",
			startTask: false,
		})

		// Create test messages with only thoughtSignature blocks
		const messages = [
			{
				role: "assistant" as const,
				content: [{ type: "thoughtSignature" as const, thoughtSignature: "only-signature" }],
				ts: Date.now(),
			},
		]

		// Call the private method using bracket notation
		const result = (task as any).buildCleanConversationHistory(messages)

		// Find the assistant message in the result
		const assistantMessage = result.find((msg: any) => msg.role === "assistant")

		// Verify empty string is used when all content is filtered out
		expect(assistantMessage).toBeDefined()
		expect(assistantMessage.content).toBe("")
	})

	it("should handle mixed content types correctly", () => {
		const anthropicConfig: ProviderSettings = {
			apiProvider: "anthropic",
			apiModelId: "claude-3-5-sonnet-20241022",
			apiKey: "test-key",
		}

		task = new Task({
			provider: mockProvider,
			apiConfiguration: anthropicConfig,
			task: "test task",
			startTask: false,
		})

		// Create test messages with mixed content types
		const messages = [
			{
				role: "assistant" as const,
				content: [
					{ type: "text" as const, text: "First text" },
					{ type: "thoughtSignature" as const, thoughtSignature: "signature-1" },
					{ type: "text" as const, text: "Second text" },
					{ type: "thoughtSignature" as const, thoughtSignature: "signature-2" },
					{ type: "text" as const, text: "Third text" },
				],
				ts: Date.now(),
			},
		]

		// Call the private method using bracket notation
		const result = (task as any).buildCleanConversationHistory(messages)

		// Find the assistant message in the result
		const assistantMessage = result.find((msg: any) => msg.role === "assistant")

		// Verify only text blocks remain after filtering
		expect(assistantMessage).toBeDefined()
		expect(assistantMessage.content).toEqual([
			{ type: "text", text: "First text" },
			{ type: "text", text: "Second text" },
			{ type: "text", text: "Third text" },
		])
	})

	it("should handle string content without modification", () => {
		const anthropicConfig: ProviderSettings = {
			apiProvider: "anthropic",
			apiModelId: "claude-3-5-sonnet-20241022",
			apiKey: "test-key",
		}

		task = new Task({
			provider: mockProvider,
			apiConfiguration: anthropicConfig,
			task: "test task",
			startTask: false,
		})

		// Create test messages with string content
		const messages = [
			{
				role: "assistant" as const,
				content: "Simple string message",
				ts: Date.now(),
			},
		]

		// Call the private method using bracket notation
		const result = (task as any).buildCleanConversationHistory(messages)

		// Find the assistant message in the result
		const assistantMessage = result.find((msg: any) => msg.role === "assistant")

		// Verify string content is preserved as-is
		expect(assistantMessage).toBeDefined()
		expect(assistantMessage.content).toBe("Simple string message")
	})
})
