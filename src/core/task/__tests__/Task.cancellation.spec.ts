// npx vitest core/task/__tests__/Task.cancellation.spec.ts

import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"
import { Anthropic } from "@anthropic-ai/sdk"
import delay from "delay"

import type { GlobalState, ProviderSettings } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"
import { ApiStreamChunk } from "../../../api/transform/stream"
import { ContextProxy } from "../../config/ContextProxy"

// Mock delay before any imports that might use it
vi.mock("delay", () => ({
	__esModule: true,
	default: vi.fn((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
}))

vi.mock("execa", () => ({
	execa: vi.fn(),
}))

vi.mock("fs/promises", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, any>
	const mockFunctions = {
		mkdir: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn().mockImplementation(() => Promise.resolve("[]")),
		unlink: vi.fn().mockResolvedValue(undefined),
		rmdir: vi.fn().mockResolvedValue(undefined),
	}

	return {
		...actual,
		...mockFunctions,
		default: mockFunctions,
	}
})

vi.mock("p-wait-for", () => ({
	default: vi.fn().mockImplementation(async () => Promise.resolve()),
}))

vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }
	const mockEventEmitter = { event: vi.fn(), fire: vi.fn() }
	const mockTextDocument = { uri: { fsPath: "/mock/workspace/path/file.ts" } }
	const mockTextEditor = { document: mockTextDocument }
	const mockTab = { input: { uri: { fsPath: "/mock/workspace/path/file.ts" } } }
	const mockTabGroup = { tabs: [mockTab] }

	return {
		TabInputTextDiff: vi.fn(),
		CodeActionKind: {
			QuickFix: { value: "quickfix" },
			RefactorRewrite: { value: "refactor.rewrite" },
		},
		window: {
			createTextEditorDecorationType: vi.fn().mockReturnValue({
				dispose: vi.fn(),
			}),
			visibleTextEditors: [mockTextEditor],
			tabGroups: {
				all: [mockTabGroup],
				close: vi.fn(),
				onDidChangeTabs: vi.fn(() => ({ dispose: vi.fn() })),
			},
			showErrorMessage: vi.fn(),
		},
		workspace: {
			workspaceFolders: [
				{
					uri: { fsPath: "/mock/workspace/path" },
					name: "mock-workspace",
					index: 0,
				},
			],
			createFileSystemWatcher: vi.fn(() => ({
				onDidCreate: vi.fn(() => mockDisposable),
				onDidDelete: vi.fn(() => mockDisposable),
				onDidChange: vi.fn(() => mockDisposable),
				dispose: vi.fn(),
			})),
			fs: {
				stat: vi.fn().mockResolvedValue({ type: 1 }), // FileType.File = 1
			},
			onDidSaveTextDocument: vi.fn(() => mockDisposable),
			getConfiguration: vi.fn(() => ({ get: (key: string, defaultValue: any) => defaultValue })),
		},
		env: {
			uriScheme: "vscode",
			language: "en",
		},
		EventEmitter: vi.fn().mockImplementation(() => mockEventEmitter),
		Disposable: {
			from: vi.fn(),
		},
		TabInputText: vi.fn(),
	}
})

vi.mock("../../mentions", () => ({
	parseMentions: vi.fn().mockImplementation((text) => {
		return Promise.resolve(`processed: ${text}`)
	}),
	openMention: vi.fn(),
	getLatestTerminalOutput: vi.fn(),
}))

vi.mock("../../../integrations/misc/extract-text", () => ({
	extractTextFromFile: vi.fn().mockResolvedValue("Mock file content"),
}))

vi.mock("../../environment/getEnvironmentDetails", () => ({
	getEnvironmentDetails: vi.fn().mockResolvedValue(""),
}))

vi.mock("../../ignore/RooIgnoreController")
vi.mock("../../protect/RooProtectedController")

vi.mock("../../../utils/storage", () => ({
	getTaskDirectoryPath: vi
		.fn()
		.mockImplementation((globalStoragePath, taskId) => Promise.resolve(`${globalStoragePath}/tasks/${taskId}`)),
	getSettingsDirectoryPath: vi
		.fn()
		.mockImplementation((globalStoragePath) => Promise.resolve(`${globalStoragePath}/settings`)),
}))

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockImplementation(() => false),
}))

describe("Task Cancellation", () => {
	let mockProvider: any
	let mockApiConfig: ProviderSettings
	let mockOutputChannel: any
	let mockExtensionContext: vscode.ExtensionContext

	beforeEach(() => {
		if (!TelemetryService.hasInstance()) {
			TelemetryService.createInstance([])
		}

		// Setup mock extension context
		const storageUri = {
			fsPath: path.join(os.tmpdir(), "test-storage"),
		}

		mockExtensionContext = {
			globalState: {
				get: vi.fn().mockImplementation((key: keyof GlobalState) => {
					if (key === "taskHistory") {
						return []
					}
					return undefined
				}),
				update: vi.fn().mockImplementation((_key, _value) => Promise.resolve()),
				keys: vi.fn().mockReturnValue([]),
			},
			globalStorageUri: storageUri,
			workspaceState: {
				get: vi.fn().mockImplementation((_key) => undefined),
				update: vi.fn().mockImplementation((_key, _value) => Promise.resolve()),
				keys: vi.fn().mockReturnValue([]),
			},
			secrets: {
				get: vi.fn().mockImplementation((_key) => Promise.resolve(undefined)),
				store: vi.fn().mockImplementation((_key, _value) => Promise.resolve()),
				delete: vi.fn().mockImplementation((_key) => Promise.resolve()),
			},
			extensionUri: {
				fsPath: "/mock/extension/path",
			},
			extension: {
				packageJSON: {
					version: "1.0.0",
				},
			},
		} as unknown as vscode.ExtensionContext

		// Setup mock output channel
		mockOutputChannel = {
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		}

		// Setup mock provider with output channel
		mockProvider = new ClineProvider(
			mockExtensionContext,
			mockOutputChannel,
			"sidebar",
			new ContextProxy(mockExtensionContext),
		) as any

		// Setup mock API configuration
		mockApiConfig = {
			apiProvider: "anthropic",
			apiModelId: "claude-3-5-sonnet-20241022",
			apiKey: "test-api-key",
		}

		// Mock provider methods
		mockProvider.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
		mockProvider.postStateToWebview = vi.fn().mockResolvedValue(undefined)
		mockProvider.getTaskWithId = vi.fn().mockImplementation(async (id) => ({
			historyItem: {
				id,
				ts: Date.now(),
				task: "test task",
				tokensIn: 100,
				tokensOut: 200,
				cacheWrites: 0,
				cacheReads: 0,
				totalCost: 0.001,
			},
			taskDirPath: "/mock/storage/path/tasks/123",
			apiConversationHistoryFilePath: "/mock/storage/path/tasks/123/api_conversation_history.json",
			uiMessagesFilePath: "/mock/storage/path/tasks/123/ui_messages.json",
			apiConversationHistory: [],
		}))
	})

	describe("Streaming Cancellation", () => {
		it("should properly cancel an endless streaming response when abort is triggered", async () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfig,
				task: "test task",
				startTask: false,
			})

			// Track chunks received
			let chunksReceived = 0
			let streamCancelled = false
			let iteratorReturnCalled = false

			// Create an endless stream generator that yields chunks indefinitely
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					try {
						while (true) {
							// Check if we should stop (this simulates the abort check)
							if (task.abort) {
								streamCancelled = true
								return
							}

							chunksReceived++
							yield { type: "text", text: `Chunk ${chunksReceived}` } as ApiStreamChunk

							// Small delay to simulate network
							await new Promise((resolve) => setTimeout(resolve, 5))
						}
					} finally {
						// This block runs when the generator is closed (return() is called)
						iteratorReturnCalled = true
					}
				},
				async return() {
					iteratorReturnCalled = true
					return { done: true, value: undefined }
				},
			} as unknown as AsyncGenerator<ApiStreamChunk>

			// Mock the API to return our endless stream
			vi.spyOn(task.api, "createMessage").mockReturnValue(mockStream)

			// Start streaming in background
			const streamPromise = (async () => {
				try {
					const stream = task.attemptApiRequest()
					const iterator = stream[Symbol.asyncIterator]()
					let item = await iterator.next()
					while (!item.done) {
						// Early abort check (as in PR #7016)
						if (task.abort) {
							if (iterator.return) {
								await iterator.return(undefined).catch(() => {})
							}
							break
						}

						const chunk = item.value
						item = await iterator.next()

						// Check abort after processing (as in PR)
						if (task.abort) {
							if (iterator.return) {
								await iterator.return(undefined).catch(() => {})
							}
							break
						}
					}
				} catch (error) {
					// Expected when aborting
				}
			})()

			// Wait for some chunks to be received
			await new Promise((resolve) => setTimeout(resolve, 50))
			expect(chunksReceived).toBeGreaterThan(0)
			expect(chunksReceived).toBeLessThan(20) // Should not be infinite

			// Now trigger cancellation
			const initialChunks = chunksReceived
			task.abort = true

			// Give it time to process the cancellation
			await new Promise((resolve) => setTimeout(resolve, 50))

			// Verify that:
			// 1. No more chunks were received after abort
			expect(chunksReceived).toBe(initialChunks)

			// 2. Stream was properly cancelled
			expect(streamCancelled).toBe(true)

			// 3. Iterator return was called (cleanup)
			expect(iteratorReturnCalled).toBe(true)

			// Clean up the stream promise
			await streamPromise.catch(() => {}) // Ignore expected error
		})

		it("should handle cancellation during chunk processing", async () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfig,
				task: "test task",
				startTask: false,
			})

			let processedChunks: string[] = []
			let streamIterations = 0
			const maxIterations = 100 // Limit for safety

			// Create a stream that generates chunks continuously
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					while (streamIterations < maxIterations) {
						streamIterations++

						// Early abort check (as in PR #7016)
						if (task.abort) {
							console.log("Stream aborted at iteration", streamIterations)
							return
						}

						yield { type: "text", text: `Chunk ${streamIterations}` } as ApiStreamChunk

						// Simulate network delay
						await new Promise((resolve) => setTimeout(resolve, 5))
					}
				},
				async return() {
					console.log("Stream return called")
					return { done: true, value: undefined }
				},
			} as unknown as AsyncGenerator<ApiStreamChunk>

			// Mock the API
			vi.spyOn(task.api, "createMessage").mockReturnValue(mockStream)

			// Set up abort flag monitoring
			let abortDetectedAt: number | null = null
			let abortValue = false
			Object.defineProperty(task, "abort", {
				get: () => abortValue,
				set: (value) => {
					if (value && !abortDetectedAt) {
						abortDetectedAt = streamIterations
					}
					abortValue = value
				},
				configurable: true,
			})

			// Start processing stream
			const processStream = async () => {
				try {
					const stream = task.attemptApiRequest()
					const iterator = stream[Symbol.asyncIterator]()

					let item = await iterator.next()
					while (!item.done) {
						// Early abort check (as implemented in PR)
						if (task.abort) {
							console.log("Aborting stream (early check)")
							if (iterator.return) {
								await iterator.return(undefined).catch(() => {})
							}
							break
						}

						const chunk = item.value
						item = await iterator.next()

						if (chunk && chunk.type === "text") {
							processedChunks.push(chunk.text)
						}

						// Check abort after processing (as implemented in PR)
						if (task.abort) {
							console.log("Aborting stream (after chunk)")
							if (iterator.return) {
								await iterator.return(undefined).catch(() => {})
							}
							break
						}
					}
				} catch (error) {
					console.log("Stream processing error:", error)
				}
			}

			// Start streaming
			const streamPromise = processStream()

			// Let some chunks through
			await new Promise((resolve) => setTimeout(resolve, 30))
			const chunksBeforeAbort = processedChunks.length
			expect(chunksBeforeAbort).toBeGreaterThan(0)

			// Trigger abort
			task.abort = true

			// Wait for abort to take effect
			await new Promise((resolve) => setTimeout(resolve, 20))

			// Verify no new chunks after abort (allow for one in-flight chunk)
			const chunksAfterAbort = processedChunks.length
			expect(chunksAfterAbort - chunksBeforeAbort).toBeLessThanOrEqual(1)

			// Verify abort was detected
			expect(abortDetectedAt).not.toBeNull()
			expect(abortDetectedAt).toBeLessThanOrEqual(streamIterations)

			// Clean up
			await streamPromise
		})

		it("should handle abort flag being set immediately as in ClineProvider.cancelTask", async () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfig,
				task: "test task",
				startTask: false,
			})

			let streamStarted = false
			let streamAborted = false

			// Create a stream that checks abort immediately
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					streamStarted = true

					// This simulates the early abort check in the PR
					if (task.abort) {
						streamAborted = true
						return
					}

					// Would normally yield chunks here
					yield { type: "text", text: "Should not reach here" } as ApiStreamChunk
				},
			} as unknown as AsyncGenerator<ApiStreamChunk>

			vi.spyOn(task.api, "createMessage").mockReturnValue(mockStream)

			// Set abort flag immediately (as done in ClineProvider.cancelTask)
			task.abort = true

			// Try to start streaming
			const streamPromise = (async () => {
				const stream = task.attemptApiRequest()
				const chunks: any[] = []

				try {
					const iterator = stream[Symbol.asyncIterator]()
					let item = await iterator.next()
					while (!item.done) {
						// Early abort check
						if (task.abort) {
							if (iterator.return) {
								await iterator.return(undefined).catch(() => {})
							}
							break
						}

						const chunk = item.value
						if (chunk) {
							chunks.push(chunk)
						}
						item = await iterator.next()
					}
				} catch (error) {
					// Expected when aborting
				}

				return chunks
			})()

			const chunks = await streamPromise

			// Verify stream was aborted immediately
			expect(streamStarted).toBe(true)
			expect(streamAborted).toBe(true)
			expect(chunks).toHaveLength(0) // No chunks should have been processed
		})

		it("should properly clean up resources when cancelling", async () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfig,
				task: "test task",
				startTask: false,
			})

			const cleanupTracking = {
				iteratorReturnCalled: false,
				streamFinallyCalled: false,
				diffViewRevertCalled: false,
			}

			// Mock diff view provider
			task.diffViewProvider.isEditing = true
			task.diffViewProvider.revertChanges = vi.fn().mockResolvedValue(undefined)

			// Create stream with cleanup tracking
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					try {
						let i = 0
						while (i < 100) {
							if (task.abort) {
								cleanupTracking.streamFinallyCalled = true
								return
							}
							yield { type: "text", text: `Chunk ${i++}` } as ApiStreamChunk
							await new Promise((resolve) => setTimeout(resolve, 5))
						}
					} finally {
						cleanupTracking.streamFinallyCalled = true
					}
				},
				async return() {
					cleanupTracking.iteratorReturnCalled = true
					return { done: true, value: undefined }
				},
			} as unknown as AsyncGenerator<ApiStreamChunk>

			vi.spyOn(task.api, "createMessage").mockReturnValue(mockStream)

			// Mark as streaming
			task.isStreaming = true

			// Start streaming
			const streamPromise = (async () => {
				try {
					const stream = task.attemptApiRequest()
					const iterator = stream[Symbol.asyncIterator]()
					let item = await iterator.next()
					while (!item.done) {
						// Early abort check
						if (task.abort) {
							if (iterator.return) {
								await iterator.return(undefined).catch(() => {})
								cleanupTracking.iteratorReturnCalled = true
							}
							break
						}

						const chunk = item.value
						item = await iterator.next()

						// Check abort after processing
						if (task.abort) {
							if (iterator.return) {
								await iterator.return(undefined).catch(() => {})
								cleanupTracking.iteratorReturnCalled = true
							}
							break
						}
					}
				} catch (error) {
					// Expected
				}
			})()

			// Let it run briefly
			await new Promise((resolve) => setTimeout(resolve, 20))

			// Trigger abort with cleanup
			task.abort = true

			// Simulate abortTask cleanup
			if (task.isStreaming && task.diffViewProvider.isEditing) {
				await task.diffViewProvider.revertChanges()
				cleanupTracking.diffViewRevertCalled = true
			}

			// Wait for stream to finish
			await streamPromise.catch(() => {})
			await new Promise((resolve) => setTimeout(resolve, 10))

			// Verify all cleanup was performed
			expect(cleanupTracking.iteratorReturnCalled).toBe(true)
			expect(cleanupTracking.streamFinallyCalled).toBe(true)
			expect(cleanupTracking.diffViewRevertCalled).toBe(true)
			expect(task.diffViewProvider.revertChanges).toHaveBeenCalled()
		})
	})
})
