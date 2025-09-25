// Mocks must come first, before imports
vi.mock("vscode", () => ({
	env: {
		language: "en",
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/path" } }],
		getWorkspaceFolder: vi.fn().mockReturnValue({ uri: { fsPath: "/test/path" } }),
	},
	window: {
		activeTextEditor: undefined,
	},
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
}))

vi.mock("fs/promises", () => {
	const mockReadFile = vi.fn()
	const mockMkdir = vi.fn().mockResolvedValue(undefined)
	const mockAccess = vi.fn().mockResolvedValue(undefined)

	return {
		default: {
			readFile: mockReadFile,
			mkdir: mockMkdir,
			access: mockAccess,
		},
		readFile: mockReadFile,
		mkdir: mockMkdir,
		access: mockAccess,
	}
})

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockResolvedValue(true),
	createDirectoriesForFile: vi.fn().mockResolvedValue([]),
}))

import { SYSTEM_PROMPT } from "../system"
import { defaultModeSlug, modes } from "../../../shared/modes"
import * as vscode from "vscode"
import * as fs from "fs/promises"
import { toPosix } from "./utils"

// Get the mocked fs module
const mockedFs = vi.mocked(fs)

// Create a mock ExtensionContext with relative paths instead of absolute paths
const mockContext = {
	extensionPath: "mock/extension/path",
	globalStoragePath: "mock/storage/path",
	storagePath: "mock/storage/path",
	logPath: "mock/log/path",
	subscriptions: [],
	workspaceState: {
		get: () => undefined,
		update: () => Promise.resolve(),
	},
	globalState: {
		get: () => undefined,
		update: () => Promise.resolve(),
		setKeysForSync: () => {},
	},
	extensionUri: { fsPath: "mock/extension/path" },
	globalStorageUri: { fsPath: "mock/settings/path" },
	asAbsolutePath: (relativePath: string) => `mock/extension/path/${relativePath}`,
	extension: {
		packageJSON: {
			version: "1.0.0",
		},
	},
} as unknown as vscode.ExtensionContext

describe("File-Based Custom System Prompt", () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks()

		// Default behavior: file doesn't exist
		mockedFs.readFile.mockRejectedValue({ code: "ENOENT" })
	})

	// Skipped on Windows due to timeout/flake issues
	it.skipIf(process.platform === "win32")(
		"should use default generation when no file-based system prompt is found",
		async () => {
			const customModePrompts = {
				[defaultModeSlug]: {
					roleDefinition: "Test role definition",
				},
			}

			const prompt = await SYSTEM_PROMPT(
				mockContext,
				"test/path", // Using a relative path without leading slash
				false, // supportsComputerUse
				undefined, // mcpHub
				undefined, // diffStrategy
				undefined, // browserViewportSize
				defaultModeSlug, // mode
				customModePrompts, // customModePrompts
				undefined, // customModes
				undefined, // globalCustomInstructions
				undefined, // diffEnabled
				undefined, // experiments
				true, // enableMcpServerCreation
				undefined, // language
				undefined, // rooIgnoreInstructions
				undefined, // partialReadsEnabled
			)

			// Should contain default sections
			expect(prompt).toContain("TOOL USE")
			expect(prompt).toContain("CAPABILITIES")
			expect(prompt).toContain("MODES")
			expect(prompt).toContain("Test role definition")
		},
	)

	it("should use file-based custom system prompt when available", async () => {
		// Mock the readFile to return content from a file
		const fileCustomSystemPrompt = "Custom system prompt from file"
		// When called with utf-8 encoding, return a string
		mockedFs.readFile.mockImplementation((filePath, options) => {
			if (toPosix(filePath).includes(`.roo/system-prompt-${defaultModeSlug}`) && options === "utf-8") {
				return Promise.resolve(fileCustomSystemPrompt)
			}
			return Promise.reject({ code: "ENOENT" })
		})

		const prompt = await SYSTEM_PROMPT(
			mockContext,
			"test/path", // Using a relative path without leading slash
			false, // supportsComputerUse
			undefined, // mcpHub
			undefined, // diffStrategy
			undefined, // browserViewportSize
			defaultModeSlug, // mode
			undefined, // customModePrompts
			undefined, // customModes
			undefined, // globalCustomInstructions
			undefined, // diffEnabled
			undefined, // experiments
			true, // enableMcpServerCreation
			undefined, // language
			undefined, // rooIgnoreInstructions
			undefined, // partialReadsEnabled
		)

		// Should contain role definition and file-based system prompt
		expect(prompt).toContain(modes[0].roleDefinition)
		expect(prompt).toContain(fileCustomSystemPrompt)

		// After the fix, should now contain tool sections for proper tool usage
		expect(prompt).toContain("TOOL USE")
		expect(prompt).toContain("# Tools")
	})

	it("should combine file-based system prompt with role definition and custom instructions", async () => {
		// Mock the readFile to return content from a file
		const fileCustomSystemPrompt = "Custom system prompt from file"
		mockedFs.readFile.mockImplementation((filePath, options) => {
			if (toPosix(filePath).includes(`.roo/system-prompt-${defaultModeSlug}`) && options === "utf-8") {
				return Promise.resolve(fileCustomSystemPrompt)
			}
			return Promise.reject({ code: "ENOENT" })
		})

		// Define custom role definition
		const customRoleDefinition = "Custom role definition"
		const customModePrompts = {
			[defaultModeSlug]: {
				roleDefinition: customRoleDefinition,
			},
		}

		const prompt = await SYSTEM_PROMPT(
			mockContext,
			"test/path", // Using a relative path without leading slash
			false, // supportsComputerUse
			undefined, // mcpHub
			undefined, // diffStrategy
			undefined, // browserViewportSize
			defaultModeSlug, // mode
			customModePrompts, // customModePrompts
			undefined, // customModes
			undefined, // globalCustomInstructions
			undefined, // diffEnabled
			undefined, // experiments
			true, // enableMcpServerCreation
			undefined, // language
			undefined, // rooIgnoreInstructions
			undefined, // partialReadsEnabled
		)

		// Should contain custom role definition and file-based system prompt
		expect(prompt).toContain(customRoleDefinition)
		expect(prompt).toContain(fileCustomSystemPrompt)

		// After the fix, should now contain tool sections for proper tool usage
		expect(prompt).toContain("TOOL USE")
		expect(prompt).toContain("# Tools")
	})

	it("should include simplified read_file tool for code-supernova model with custom prompt", async () => {
		// Mock the readFile to return content from a file
		const fileCustomSystemPrompt = "Custom system prompt for code-supernova"
		mockedFs.readFile.mockImplementation((filePath, options) => {
			if (toPosix(filePath).includes(`.roo/system-prompt-${defaultModeSlug}`) && options === "utf-8") {
				return Promise.resolve(fileCustomSystemPrompt)
			}
			return Promise.reject({ code: "ENOENT" })
		})

		const prompt = await SYSTEM_PROMPT(
			mockContext,
			"test/path",
			false, // supportsComputerUse
			undefined, // mcpHub
			undefined, // diffStrategy
			undefined, // browserViewportSize
			defaultModeSlug, // mode
			undefined, // customModePrompts
			undefined, // customModes
			undefined, // globalCustomInstructions
			undefined, // diffEnabled
			undefined, // experiments
			true, // enableMcpServerCreation
			undefined, // language
			undefined, // rooIgnoreInstructions
			undefined, // partialReadsEnabled
			undefined, // settings
			undefined, // todoList
			"roo/code-supernova", // modelId - this is the key for this test
		)

		// Should contain the custom system prompt
		expect(prompt).toContain(fileCustomSystemPrompt)

		// Should contain tool descriptions
		expect(prompt).toContain("# Tools")
		expect(prompt).toContain("## read_file")

		// Should contain the simplified read_file format for code-supernova
		expect(prompt).toContain("<read_file>")
		expect(prompt).toContain("<path>path/to/file</path>")
		expect(prompt).toContain("</read_file>")

		// Should NOT contain the complex multi-file read format
		expect(prompt).not.toContain("<args>")
		expect(prompt).not.toContain("You can read a maximum of 5 files")
	})
})
