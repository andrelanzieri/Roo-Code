import { describe, it, expect, vi, beforeEach } from "vitest"
import { webviewMessageHandler } from "../webviewMessageHandler"
import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	workspace: {
		workspaceFolders: [],
	},
}))

// Mock fs/promises
vi.mock("fs/promises", () => ({
	default: {},
	mkdir: vi.fn(),
	readFile: vi.fn(),
	writeFile: vi.fn(),
}))

// Mock safeWriteJson
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn(),
}))

// Mock openFile
vi.mock("../../../integrations/misc/open-file", () => ({
	openFile: vi.fn(),
}))

// Mock i18n
vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string) => key),
}))

describe("webviewMessageHandler - addCustomMcpServer", () => {
	let mockProvider: any
	let mockMcpHub: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockMcpHub = {
			getMcpSettingsFilePath: vi.fn().mockResolvedValue("/mock/global/mcp.json"),
			refreshAllConnections: vi.fn().mockResolvedValue(undefined),
		}

		mockProvider = {
			getMcpHub: vi.fn().mockReturnValue(mockMcpHub),
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
			log: vi.fn(),
			contextProxy: {
				getValue: vi.fn(),
				setValue: vi.fn().mockResolvedValue(undefined),
			},
		}
	})

	it("should add custom MCP server to project settings when workspace is available", async () => {
		// Setup workspace
		vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: "/test/workspace" } } as any]

		// Mock fs operations
		vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found")) // Simulate no existing file
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)

		const message = {
			type: "addCustomMcpServer" as const,
			serverName: "serena-mcp",
			customMcpConfig: {
				command: "npx",
				args: ["-y", "@serena/mcp-server"],
				env: { NODE_ENV: "production" },
			},
		}

		// Mock getCurrentTask to return null (no active task)
		mockProvider.getCurrentTask = vi.fn().mockReturnValue({
			cwd: "/test/workspace",
		})
		mockProvider.cwd = "/test/workspace"

		await webviewMessageHandler(mockProvider, message)

		// Verify directory creation
		expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining(".roo"), { recursive: true })

		// Verify MCP settings were written
		const { safeWriteJson } = await import("../../../utils/safeWriteJson")
		expect(safeWriteJson).toHaveBeenCalledWith(
			expect.stringContaining("mcp.json"),
			expect.objectContaining({
				mcpServers: {
					"serena-mcp": {
						command: "npx",
						args: ["-y", "@serena/mcp-server"],
						env: { NODE_ENV: "production" },
					},
				},
			}),
		)

		// Verify MCP hub refresh
		expect(mockMcpHub.refreshAllConnections).toHaveBeenCalled()

		// Verify success message
		expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
			expect.stringContaining("marketplace:customMcp.success"),
		)

		// Verify state update
		expect(mockProvider.postStateToWebview).toHaveBeenCalled()
	})

	it("should add custom MCP server to global settings when no workspace is available", async () => {
		// No workspace
		vi.mocked(vscode.workspace).workspaceFolders = undefined

		// Mock existing MCP settings
		vi.mocked(fs.readFile).mockResolvedValue(
			JSON.stringify({
				mcpServers: {
					"existing-server": {
						command: "existing",
						args: [],
					},
				},
			}),
		)

		const message = {
			type: "addCustomMcpServer" as const,
			serverName: "new-server",
			customMcpConfig: {
				command: "new-command",
				args: ["arg1", "arg2"],
			},
		}

		await webviewMessageHandler(mockProvider, message)

		// Verify global settings path was used
		expect(mockMcpHub.getMcpSettingsFilePath).toHaveBeenCalled()

		// Verify MCP settings were merged
		const { safeWriteJson } = await import("../../../utils/safeWriteJson")
		expect(safeWriteJson).toHaveBeenCalledWith(
			"/mock/global/mcp.json",
			expect.objectContaining({
				mcpServers: {
					"existing-server": {
						command: "existing",
						args: [],
					},
					"new-server": {
						command: "new-command",
						args: ["arg1", "arg2"],
					},
				},
			}),
		)
	})

	it("should show error when MCP hub is not available", async () => {
		mockProvider.getMcpHub.mockReturnValue(null)

		const message = {
			type: "addCustomMcpServer" as const,
			serverName: "test-server",
			customMcpConfig: {
				command: "test",
				args: [],
			},
		}

		await webviewMessageHandler(mockProvider, message)

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			expect.stringContaining("mcp:errors.hub_not_available"),
		)
	})

	it("should show error when server name is missing", async () => {
		const message = {
			type: "addCustomMcpServer" as const,
			serverName: "",
			customMcpConfig: {
				command: "test",
				args: [],
			},
		}

		await webviewMessageHandler(mockProvider, message)

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			expect.stringContaining("marketplace:customMcp.error"),
		)
	})

	it("should show error when config is missing", async () => {
		const message = {
			type: "addCustomMcpServer" as const,
			serverName: "test-server",
			customMcpConfig: null as any,
		}

		await webviewMessageHandler(mockProvider, message)

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			expect.stringContaining("marketplace:customMcp.error"),
		)
	})

	it("should handle errors during MCP server addition", async () => {
		vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: "/test/workspace" } } as any]

		// Mock getCurrentTask to return task with cwd
		mockProvider.getCurrentTask = vi.fn().mockReturnValue({
			cwd: "/test/workspace",
		})
		mockProvider.cwd = "/test/workspace"

		// Mock fs.mkdir to throw an error
		const testError = new Error("Permission denied")
		vi.mocked(fs.mkdir).mockRejectedValue(testError)

		const message = {
			type: "addCustomMcpServer" as const,
			serverName: "test-server",
			customMcpConfig: {
				command: "test",
				args: [],
			},
		}

		await webviewMessageHandler(mockProvider, message)

		// Verify error logging
		expect(mockProvider.log).toHaveBeenCalledWith(expect.stringContaining("Failed to add custom MCP server"))

		// Verify error message - the actual error message includes the error details
		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			expect.stringMatching(/Permission denied|marketplace:customMcp\.error/),
		)
	})
})
