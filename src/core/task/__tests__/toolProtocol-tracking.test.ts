import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import type { ClineProvider } from "../../webview/ClineProvider"
import type { ProviderSettings, ModelInfo } from "@roo-code/types"

// Mock vscode module before importing Task
vi.mock("vscode", () => ({
	workspace: {
		createFileSystemWatcher: vi.fn(() => ({
			onDidCreate: vi.fn(),
			onDidChange: vi.fn(),
			onDidDelete: vi.fn(),
			dispose: vi.fn(),
		})),
		getConfiguration: vi.fn(() => ({
			get: vi.fn(() => true),
		})),
		openTextDocument: vi.fn(),
		applyEdit: vi.fn(),
	},
	RelativePattern: vi.fn((base, pattern) => ({ base, pattern })),
	window: {
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			dispose: vi.fn(),
		})),
		createTextEditorDecorationType: vi.fn(() => ({
			dispose: vi.fn(),
		})),
		showTextDocument: vi.fn(),
		activeTextEditor: undefined,
	},
	Uri: {
		file: vi.fn((path) => ({ fsPath: path })),
		parse: vi.fn((str) => ({ toString: () => str })),
	},
	Range: vi.fn(),
	Position: vi.fn(),
	WorkspaceEdit: vi.fn(() => ({
		replace: vi.fn(),
		insert: vi.fn(),
		delete: vi.fn(),
	})),
	ViewColumn: {
		One: 1,
		Two: 2,
		Three: 3,
	},
}))

// Mock other dependencies
vi.mock("../../services/mcp/McpServerManager", () => ({
	McpServerManager: {
		getInstance: vi.fn().mockResolvedValue(null),
	},
}))

vi.mock("../../integrations/terminal/TerminalRegistry", () => ({
	TerminalRegistry: {
		releaseTerminalsForTask: vi.fn(),
	},
}))

vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureTaskCreated: vi.fn(),
			captureTaskRestarted: vi.fn(),
			captureConversationMessage: vi.fn(),
			captureLlmCompletion: vi.fn(),
			captureConsecutiveMistakeError: vi.fn(),
		},
	},
}))

describe("Task toolProtocol tracking", () => {
	let mockProvider: Partial<ClineProvider>
	let mockApiConfiguration: ProviderSettings
	let Task: any

	beforeAll(async () => {
		// Import Task after mocks are set up
		const taskModule = await import("../Task")
		Task = taskModule.Task
	})

	beforeEach(() => {
		// Mock provider with necessary methods
		mockProvider = {
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
			getState: vi.fn().mockResolvedValue({
				mode: "code",
				experiments: {},
			}),
			context: {
				globalStorageUri: { fsPath: "/test/storage" },
				extensionPath: "/test/extension",
			} as any,
			log: vi.fn(),
			updateTaskHistory: vi.fn().mockResolvedValue(undefined),
			postMessageToWebview: vi.fn().mockResolvedValue(undefined),
		}

		mockApiConfiguration = {
			apiProvider: "anthropic",
			apiKey: "test-key",
		} as ProviderSettings
	})

	it("should store toolProtocol 'xml' for user messages when using XML protocol", async () => {
		// Create a task instance
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "Test task",
			startTask: false,
		})

		// Avoid disk writes in this test
		;(task as any).saveApiConversationHistory = vi.fn().mockResolvedValue(undefined)

		// Mock the API to return a model that uses XML protocol
		const mockModelInfo: ModelInfo = {
			contextWindow: 16000,
			supportsPromptCache: true,
			supportsNativeTools: false, // XML protocol
		}

		task.api = {
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: mockModelInfo,
			}),
		}

		// Mock the API conversation history
		task.apiConversationHistory = []

		await (task as any).addToApiConversationHistory({
			role: "user",
			content: [{ type: "text", text: "Hello" }],
		})

		expect(task.apiConversationHistory).toHaveLength(1)
		const stored = task.apiConversationHistory[0] as any

		expect(stored.role).toBe("user")
		expect(stored.toolProtocol).toBe("xml")
		expect(stored.ts).toBeDefined()
	})

	it("should store toolProtocol 'xml' for assistant messages when using XML protocol", async () => {
		// Create a task instance
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "Test task",
			startTask: false,
		})

		// Avoid disk writes in this test
		;(task as any).saveApiConversationHistory = vi.fn().mockResolvedValue(undefined)

		// Mock the API to return a model that uses XML protocol
		const mockModelInfo: ModelInfo = {
			contextWindow: 16000,
			supportsPromptCache: true,
			supportsNativeTools: false, // XML protocol
		}

		task.api = {
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: mockModelInfo,
			}),
		}

		// Mock the API conversation history
		task.apiConversationHistory = []

		await (task as any).addToApiConversationHistory({
			role: "assistant",
			content: [{ type: "text", text: "Here is my response." }],
		})

		expect(task.apiConversationHistory).toHaveLength(1)
		const stored = task.apiConversationHistory[0] as any

		expect(stored.role).toBe("assistant")
		expect(stored.toolProtocol).toBe("xml")
		expect(stored.ts).toBeDefined()
	})

	it("should store toolProtocol 'native' when model supports native tools and configured for native", async () => {
		// Create a task instance with native tool configuration
		const nativeApiConfiguration: ProviderSettings = {
			apiProvider: "openai",
			apiKey: "test-key",
			toolProtocol: "native", // Explicitly set to native
		} as ProviderSettings

		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: nativeApiConfiguration,
			task: "Test task",
			startTask: false,
		})

		// Avoid disk writes in this test
		;(task as any).saveApiConversationHistory = vi.fn().mockResolvedValue(undefined)

		// Update task's apiConfiguration
		task.apiConfiguration = nativeApiConfiguration

		// Mock the API to return a model that supports native tools
		const mockModelInfo: ModelInfo = {
			contextWindow: 16000,
			supportsPromptCache: true,
			supportsNativeTools: true, // Native protocol supported
		}

		task.api = {
			getModel: vi.fn().mockReturnValue({
				id: "gpt-4o",
				info: mockModelInfo,
			}),
		}

		// Mock the API conversation history
		task.apiConversationHistory = []

		await (task as any).addToApiConversationHistory({
			role: "user",
			content: [{ type: "text", text: "Hello" }],
		})

		expect(task.apiConversationHistory).toHaveLength(1)
		const stored = task.apiConversationHistory[0] as any

		expect(stored.role).toBe("user")
		expect(stored.toolProtocol).toBe("native")
		expect(stored.ts).toBeDefined()
	})

	it("should preserve toolProtocol on assistant messages with reasoning", async () => {
		// Create a task instance
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "Test task",
			startTask: false,
		})

		// Avoid disk writes in this test
		;(task as any).saveApiConversationHistory = vi.fn().mockResolvedValue(undefined)

		// Mock the API to return a model that uses XML protocol
		const mockModelInfo: ModelInfo = {
			contextWindow: 16000,
			supportsPromptCache: true,
			supportsNativeTools: false,
		}

		task.api = {
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: mockModelInfo,
			}),
		}

		// Mock the API conversation history
		task.apiConversationHistory = []

		const reasoningText = "Let me think about this..."

		await (task as any).addToApiConversationHistory(
			{
				role: "assistant",
				content: [{ type: "text", text: "Here is my response." }],
			},
			reasoningText,
		)

		expect(task.apiConversationHistory).toHaveLength(1)
		const stored = task.apiConversationHistory[0] as any

		expect(stored.role).toBe("assistant")
		expect(stored.toolProtocol).toBe("xml")
		expect(stored.ts).toBeDefined()
		// Verify reasoning was also stored
		expect(Array.isArray(stored.content)).toBe(true)
		expect(stored.content[0].type).toBe("reasoning")
	})

	it("should include toolProtocol in both user and assistant messages in a conversation", async () => {
		// Create a task instance
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "Test task",
			startTask: false,
		})

		// Avoid disk writes in this test
		;(task as any).saveApiConversationHistory = vi.fn().mockResolvedValue(undefined)

		// Mock the API to return a model that uses XML protocol
		const mockModelInfo: ModelInfo = {
			contextWindow: 16000,
			supportsPromptCache: true,
			supportsNativeTools: false,
		}

		task.api = {
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: mockModelInfo,
			}),
		}

		// Mock the API conversation history
		task.apiConversationHistory = []

		// Add user message
		await (task as any).addToApiConversationHistory({
			role: "user",
			content: [{ type: "text", text: "Hello" }],
		})

		// Add assistant message
		await (task as any).addToApiConversationHistory({
			role: "assistant",
			content: [{ type: "text", text: "Hi there!" }],
		})

		// Add another user message
		await (task as any).addToApiConversationHistory({
			role: "user",
			content: [{ type: "text", text: "Help me with a task" }],
		})

		expect(task.apiConversationHistory).toHaveLength(3)

		// All messages should have toolProtocol set
		for (const msg of task.apiConversationHistory) {
			expect((msg as any).toolProtocol).toBe("xml")
			expect((msg as any).ts).toBeDefined()
		}
	})

	it("should handle toolProtocol when apiConfiguration.toolProtocol is explicitly set to xml", async () => {
		// Create a task instance with explicit XML configuration
		const xmlApiConfiguration: ProviderSettings = {
			apiProvider: "anthropic",
			apiKey: "test-key",
			toolProtocol: "xml", // Explicitly set to xml
		} as ProviderSettings

		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: xmlApiConfiguration,
			task: "Test task",
			startTask: false,
		})

		// Avoid disk writes in this test
		;(task as any).saveApiConversationHistory = vi.fn().mockResolvedValue(undefined)

		// Update task's apiConfiguration
		task.apiConfiguration = xmlApiConfiguration

		// Mock the API to return a model (even if it supports native tools, config overrides)
		const mockModelInfo: ModelInfo = {
			contextWindow: 16000,
			supportsPromptCache: true,
			supportsNativeTools: true, // Model supports native, but config says xml
		}

		task.api = {
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: mockModelInfo,
			}),
		}

		// Mock the API conversation history
		task.apiConversationHistory = []

		await (task as any).addToApiConversationHistory({
			role: "user",
			content: [{ type: "text", text: "Hello" }],
		})

		expect(task.apiConversationHistory).toHaveLength(1)
		const stored = task.apiConversationHistory[0] as any

		expect(stored.role).toBe("user")
		// The explicit toolProtocol config should be respected
		expect(stored.toolProtocol).toBe("xml")
	})

	it("should NOT include toolProtocol in cleaned conversation history sent to API", async () => {
		// Create a task instance
		const task = new Task({
			provider: mockProvider as ClineProvider,
			apiConfiguration: mockApiConfiguration,
			task: "Test task",
			startTask: false,
		})

		// Avoid disk writes in this test
		;(task as any).saveApiConversationHistory = vi.fn().mockResolvedValue(undefined)

		// Mock the API to return a model that uses XML protocol
		const mockModelInfo: ModelInfo = {
			contextWindow: 16000,
			supportsPromptCache: true,
			supportsNativeTools: false,
		}

		task.api = {
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: mockModelInfo,
			}),
		}

		// Manually populate the API conversation history with toolProtocol field
		task.apiConversationHistory = [
			{
				role: "user",
				content: [{ type: "text", text: "Hello" }],
				ts: Date.now(),
				toolProtocol: "xml",
			} as any,
			{
				role: "assistant",
				content: [{ type: "text", text: "Hi there!" }],
				ts: Date.now(),
				toolProtocol: "xml",
			} as any,
		]

		// Call buildCleanConversationHistory to get what would be sent to API
		const cleanHistory = (task as any).buildCleanConversationHistory(task.apiConversationHistory)

		expect(cleanHistory).toHaveLength(2)

		// Verify toolProtocol is NOT in the cleaned messages
		for (const msg of cleanHistory) {
			expect(msg).not.toHaveProperty("toolProtocol")
			expect(msg).not.toHaveProperty("ts")
			// Should only have role and content
			expect(msg).toHaveProperty("role")
			expect(msg).toHaveProperty("content")
		}
	})

	describe("XML parser activation based on history", () => {
		it("should activate XML parser when history contains XML protocol messages even if current model uses native", async () => {
			// Create a task instance with a model that supports native tools
			const nativeApiConfiguration: ProviderSettings = {
				apiProvider: "openai",
				apiKey: "test-key",
				toolProtocol: "native",
			} as ProviderSettings

			const task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: nativeApiConfiguration,
				task: "Test task",
				startTask: false,
			})

			// Mock the API to return a model that supports native tools
			const mockModelInfo: ModelInfo = {
				contextWindow: 16000,
				supportsPromptCache: true,
				supportsNativeTools: true,
			}

			task.api = {
				getModel: vi.fn().mockReturnValue({
					id: "gpt-4o",
					info: mockModelInfo,
				}),
			}

			// Initially with native protocol and no history, parser should NOT be active
			// (We would need to call updateApiConfiguration to check this)

			// Populate history with XML protocol messages (simulating a resumed task)
			task.apiConversationHistory = [
				{
					role: "user",
					content: [{ type: "text", text: "Hello" }],
					ts: Date.now() - 1000,
					toolProtocol: "xml",
				} as any,
				{
					role: "assistant",
					content: [{ type: "text", text: "Hi there!" }],
					ts: Date.now() - 500,
					toolProtocol: "xml",
				} as any,
			]

			// Call updateApiConfiguration which should activate the parser due to XML history
			task.updateApiConfiguration(nativeApiConfiguration)

			// Parser should now be activated because history contains XML protocol messages
			expect(task.assistantMessageParser).toBeDefined()
		})

		it("should NOT activate XML parser when history is empty and using native protocol", async () => {
			// Create a task instance with a model that supports native tools
			const nativeApiConfiguration: ProviderSettings = {
				apiProvider: "openai",
				apiKey: "test-key",
				toolProtocol: "native",
			} as ProviderSettings

			const task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: nativeApiConfiguration,
				task: "Test task",
				startTask: false,
			})

			// Mock the API to return a model that supports native tools
			const mockModelInfo: ModelInfo = {
				contextWindow: 16000,
				supportsPromptCache: true,
				supportsNativeTools: true,
			}

			task.api = {
				getModel: vi.fn().mockReturnValue({
					id: "gpt-4o",
					info: mockModelInfo,
				}),
			}

			// Empty history with native protocol
			task.apiConversationHistory = []

			// Force recreate parser state based on configuration
			task.assistantMessageParser = undefined
			task.updateApiConfiguration(nativeApiConfiguration)

			// Parser should NOT be activated - no XML history and using native protocol
			expect(task.assistantMessageParser).toBeUndefined()
		})

		it("should NOT activate XML parser when history only contains native protocol messages", async () => {
			// Create a task instance with a model that supports native tools
			const nativeApiConfiguration: ProviderSettings = {
				apiProvider: "openai",
				apiKey: "test-key",
				toolProtocol: "native",
			} as ProviderSettings

			const task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: nativeApiConfiguration,
				task: "Test task",
				startTask: false,
			})

			// Mock the API to return a model that supports native tools
			const mockModelInfo: ModelInfo = {
				contextWindow: 16000,
				supportsPromptCache: true,
				supportsNativeTools: true,
			}

			task.api = {
				getModel: vi.fn().mockReturnValue({
					id: "gpt-4o",
					info: mockModelInfo,
				}),
			}

			// Populate history with native protocol messages only
			task.apiConversationHistory = [
				{
					role: "user",
					content: [{ type: "text", text: "Hello" }],
					ts: Date.now() - 1000,
					toolProtocol: "native",
				} as any,
				{
					role: "assistant",
					content: [{ type: "text", text: "Hi there!" }],
					ts: Date.now() - 500,
					toolProtocol: "native",
				} as any,
			]

			// Force recreate parser state based on configuration
			task.assistantMessageParser = undefined
			task.updateApiConfiguration(nativeApiConfiguration)

			// Parser should NOT be activated - only native history and using native protocol
			expect(task.assistantMessageParser).toBeUndefined()
		})
	})
})
