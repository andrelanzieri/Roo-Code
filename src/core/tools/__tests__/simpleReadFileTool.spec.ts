// npx vitest src/core/tools/__tests__/simpleReadFileTool.spec.ts

import * as path from "path"
import { isBinaryFile } from "isbinaryfile"
import { countFileLines } from "../../../integrations/misc/line-counter"
import { extractTextFromFile } from "../../../integrations/misc/extract-text"
import { simpleReadFileTool } from "../simpleReadFileTool"
import { ToolUse, ToolParamName, ToolResponse } from "../../../shared/tools"

vi.mock("path", async () => {
	const originalPath = await vi.importActual("path")
	return {
		default: originalPath,
		...originalPath,
		resolve: vi.fn().mockImplementation((...args) => args.join("/")),
	}
})

vi.mock("isbinaryfile")
vi.mock("../../../integrations/misc/line-counter")

vi.mock("../../../integrations/misc/extract-text", () => ({
	extractTextFromFile: vi.fn(),
	addLineNumbers: vi.fn((text) => text),
	getSupportedBinaryFormats: vi.fn(() => [".pdf", ".docx", ".ipynb"]),
}))

// Mock i18n translation function
vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string, params?: Record<string, any>) => {
		const translations: Record<string, string> = {
			"tools:readFile.definitionsOnly": " (definitions only)",
			"tools:readFile.maxLines": " (max {{max}} lines)",
		}
		let result = translations[key] || key
		if (params) {
			Object.entries(params).forEach(([param, value]) => {
				result = result.replace(new RegExp(`{{${param}}}`, "g"), String(value))
			})
		}
		return result
	}),
}))

vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolDenied: vi.fn(() => "The user denied this operation."),
		toolDeniedWithFeedback: vi.fn(
			(feedback?: string) =>
				`The user denied this operation and provided the following feedback:\n<feedback>\n${feedback}\n</feedback>`,
		),
		toolApprovedWithFeedback: vi.fn(
			(feedback?: string) =>
				`The user approved this operation and provided the following context:\n<feedback>\n${feedback}\n</feedback>`,
		),
		rooIgnoreError: vi.fn(
			(path: string) =>
				`Access to ${path} is blocked by the .rooignore file settings. You must try to continue in the task without using this file, or ask the user to update the .rooignore file.`,
		),
		toolResult: vi.fn((text: string, images?: string[]) => text),
	},
}))

vi.mock("../../ignore/RooIgnoreController", () => ({
	RooIgnoreController: class {
		initialize() {
			return Promise.resolve()
		}
		validateAccess() {
			return true
		}
	},
}))

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockReturnValue(true),
}))

function createMockCline(): any {
	const mockProvider = {
		getState: vi.fn().mockResolvedValue({ maxReadFileLine: -1, maxImageFileSize: 20, maxTotalImageSize: 20 }),
		deref: vi.fn().mockReturnThis(),
	}

	const mockCline: any = {
		cwd: "/",
		task: "Test",
		providerRef: mockProvider,
		rooIgnoreController: {
			validateAccess: vi.fn().mockReturnValue(true),
		},
		say: vi.fn().mockResolvedValue(undefined),
		ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
		presentAssistantMessage: vi.fn(),
		handleError: vi.fn().mockResolvedValue(undefined),
		pushToolResult: vi.fn(),
		removeClosingTag: vi.fn((tag, content) => content),
		fileContextTracker: {
			trackFileContext: vi.fn().mockResolvedValue(undefined),
		},
		recordToolUsage: vi.fn().mockReturnValue(undefined),
		recordToolError: vi.fn().mockReturnValue(undefined),
		consecutiveMistakeCount: 0,
		sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing required parameter: path"),
		api: {
			getModel: vi.fn().mockReturnValue({
				info: {
					supportsImages: false,
					contextWindow: 200000,
					maxTokens: 4096,
					supportsPromptCache: false,
					supportsNativeTools: true,
				},
			}),
		},
	}

	return { mockCline, mockProvider }
}

describe("simpleReadFileTool", () => {
	const testFilePath = "test/file.txt"
	const absoluteFilePath = "/test/file.txt"
	const fileContent = "1 | Line 1\n2 | Line 2\n3 | Line 3"

	const mockedCountFileLines = vi.mocked(countFileLines)
	const mockedExtractTextFromFile = vi.mocked(extractTextFromFile)
	const mockedIsBinaryFile = vi.mocked(isBinaryFile)
	const mockedPathResolve = vi.mocked(path.resolve)

	let mockCline: any
	let mockProvider: any
	let toolResult: ToolResponse | undefined

	beforeEach(() => {
		vi.clearAllMocks()

		const mocks = createMockCline()
		mockCline = mocks.mockCline
		mockProvider = mocks.mockProvider

		mockedPathResolve.mockReturnValue(absoluteFilePath)
		mockedIsBinaryFile.mockResolvedValue(false)
		mockedCountFileLines.mockResolvedValue(3)
		mockedExtractTextFromFile.mockResolvedValue(fileContent)

		toolResult = undefined
	})

	describe("XML protocol - params.path", () => {
		it("should read file using params.path from XML protocol", async () => {
			// Create a tool use object with path in params (XML protocol format)
			const toolUse: ToolUse<"read_file"> = {
				type: "tool_use",
				name: "read_file",
				params: { path: testFilePath },
				partial: false,
			}

			await simpleReadFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				vi.fn(),
				(result: ToolResponse) => {
					toolResult = result
				},
				vi.fn((_, content) => content ?? ""),
				"xml",
			)

			// Verify file was read
			expect(toolResult).toBeDefined()
			expect(toolResult).toContain(`<path>${testFilePath}</path>`)
			expect(toolResult).toContain(fileContent)
		})

		it("should handle missing path parameter in XML protocol", async () => {
			const toolUse: ToolUse<"read_file"> = {
				type: "tool_use",
				name: "read_file",
				params: {},
				partial: false,
			}

			await simpleReadFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				vi.fn(),
				(result: ToolResponse) => {
					toolResult = result
				},
				vi.fn((_, content) => content ?? ""),
				"xml",
			)

			// Verify error was returned
			expect(mockCline.sayAndCreateMissingParamError).toHaveBeenCalledWith("read_file", "path")
			expect(mockCline.consecutiveMistakeCount).toBe(1)
		})
	})

	describe("Native protocol - nativeArgs.files", () => {
		it("should read file using nativeArgs.files from native protocol", async () => {
			// Create a tool use object with path in nativeArgs.files (native protocol format)
			const toolUse: ToolUse<"read_file"> = {
				type: "tool_use",
				name: "read_file",
				params: {},
				partial: false,
				nativeArgs: {
					files: [{ path: testFilePath }],
				},
			}

			await simpleReadFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				vi.fn(),
				(result: ToolResponse) => {
					toolResult = result
				},
				vi.fn((_, content) => content ?? ""),
				"native",
			)

			// Verify file was read
			expect(toolResult).toBeDefined()
			expect(toolResult).toContain(`<path>${testFilePath}</path>`)
			expect(toolResult).toContain(fileContent)
		})

		it("should prefer nativeArgs.files over params.path when both exist", async () => {
			const nativePath = "native/path.txt"
			const xmlPath = "xml/path.txt"

			mockedPathResolve.mockImplementation((...args) => args.join("/"))

			const toolUse: ToolUse<"read_file"> = {
				type: "tool_use",
				name: "read_file",
				params: { path: xmlPath },
				partial: false,
				nativeArgs: {
					files: [{ path: nativePath }],
				},
			}

			await simpleReadFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				vi.fn(),
				(result: ToolResponse) => {
					toolResult = result
				},
				vi.fn((_, content) => content ?? ""),
				"native",
			)

			// Verify the native path was used (appears in the result)
			expect(toolResult).toBeDefined()
			expect(toolResult).toContain(`<path>${nativePath}</path>`)
		})

		it("should handle empty files array in nativeArgs", async () => {
			const toolUse: ToolUse<"read_file"> = {
				type: "tool_use",
				name: "read_file",
				params: {},
				partial: false,
				nativeArgs: {
					files: [],
				},
			}

			await simpleReadFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				vi.fn(),
				(result: ToolResponse) => {
					toolResult = result
				},
				vi.fn((_, content) => content ?? ""),
				"native",
			)

			// Should fall back to checking params.path, which is undefined, so error
			expect(mockCline.sayAndCreateMissingParamError).toHaveBeenCalledWith("read_file", "path")
		})

		it("should handle undefined nativeArgs", async () => {
			const toolUse: ToolUse<"read_file"> = {
				type: "tool_use",
				name: "read_file",
				params: { path: testFilePath },
				partial: false,
				nativeArgs: undefined,
			}

			await simpleReadFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				vi.fn(),
				(result: ToolResponse) => {
					toolResult = result
				},
				vi.fn((_, content) => content ?? ""),
				"native",
			)

			// Should fall back to params.path
			expect(toolResult).toBeDefined()
			expect(toolResult).toContain(`<path>${testFilePath}</path>`)
		})

		it("should handle nativeArgs.files with undefined files property", async () => {
			const toolUse: ToolUse<"read_file"> = {
				type: "tool_use",
				name: "read_file",
				params: { path: testFilePath },
				partial: false,
				nativeArgs: {} as any, // No files property
			}

			await simpleReadFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				vi.fn(),
				(result: ToolResponse) => {
					toolResult = result
				},
				vi.fn((_, content) => content ?? ""),
				"native",
			)

			// Should fall back to params.path
			expect(toolResult).toBeDefined()
			expect(toolResult).toContain(`<path>${testFilePath}</path>`)
		})
	})

	describe("Grok code fast model simulation", () => {
		it("should successfully read file when model uses native protocol with files array", async () => {
			// This simulates what happens when grok-code-fast-1 uses native tool calling
			// The model sends: { files: [{ path: "src/file.ts" }] }
			// Instead of: { path: "src/file.ts" }

			const testPath = "src/component.ts"
			mockedPathResolve.mockImplementation((...args) => args.join("/"))

			const toolUse: ToolUse<"read_file"> = {
				type: "tool_use",
				name: "read_file",
				id: "call_abc123", // Native protocol has ID
				params: {}, // Empty params in native mode
				partial: false,
				nativeArgs: {
					files: [{ path: testPath }],
				},
			}

			await simpleReadFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				vi.fn(),
				(result: ToolResponse) => {
					toolResult = result
				},
				vi.fn((_, content) => content ?? ""),
				"native",
			)

			// Verify the file was successfully read
			expect(toolResult).toBeDefined()
			expect(toolResult).toContain(`<path>${testPath}</path>`)
			expect(toolResult).toContain("<content")
			expect(mockCline.consecutiveMistakeCount).toBe(0)
		})
	})
})
