// npx vitest services/marketplace/__tests__/SimpleInstaller.playwright.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { SimpleInstaller } from "../SimpleInstaller"
import type { MarketplaceItem } from "@roo-code/types"

// Mock vscode
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
	},
	ExtensionContext: vi.fn(),
}))

// Mock fs/promises
vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
}))

// Mock globalContext
vi.mock("../../../utils/globalContext", () => ({
	ensureSettingsDirectoryExists: vi.fn().mockResolvedValue("/test/settings"),
}))

describe("SimpleInstaller - Playwright MCP Fix", () => {
	let installer: SimpleInstaller
	let mockContext: vscode.ExtensionContext

	beforeEach(() => {
		vi.clearAllMocks()
		mockContext = {} as vscode.ExtensionContext
		installer = new SimpleInstaller(mockContext)
	})

	it("should filter out empty string arguments for Playwright MCP server", async () => {
		const playwrightItem: MarketplaceItem = {
			id: "playwright",
			name: "Playwright MCP Server",
			type: "mcp",
			description: "Browser automation MCP server",
			author: "Playwright Team",
			url: "https://github.com/playwright/mcp",
			content: JSON.stringify({
				command: "npx",
				args: ["-y", "@playwright/mcp@latest", "--browser=", "--headless=", "--viewport-size="],
			}),
		}

		// Mock file doesn't exist (new installation)
		vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" })
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)

		await installer.installItem(playwrightItem, { target: "global" })

		// Check that writeFile was called with filtered args
		expect(fs.writeFile).toHaveBeenCalledWith(
			expect.stringContaining("mcp_settings.json"),
			expect.any(String),
			"utf-8",
		)

		// Get the actual content that was written
		const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
		const writtenContent = JSON.parse(writeCall[1] as string)

		// Verify that empty string arguments were filtered out
		expect(writtenContent.mcpServers.playwright.args).toEqual(["-y", "@playwright/mcp@latest"])

		// Verify command is preserved
		expect(writtenContent.mcpServers.playwright.command).toBe("npx")
	})

	it("should not modify args for non-Playwright MCP servers", async () => {
		const otherItem: MarketplaceItem = {
			id: "other-server",
			name: "Other MCP Server",
			type: "mcp",
			description: "Another MCP server",
			author: "Other Team",
			url: "https://example.com/other-server",
			content: JSON.stringify({
				command: "node",
				args: ["server.js", "--option=", ""],
			}),
		}

		// Mock file doesn't exist (new installation)
		vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" })
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)

		await installer.installItem(otherItem, { target: "global" })

		// Get the actual content that was written
		const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
		const writtenContent = JSON.parse(writeCall[1] as string)

		// Verify that args were NOT modified for non-Playwright servers
		expect(writtenContent.mcpServers["other-server"].args).toEqual(["server.js", "--option=", ""])
	})

	it("should handle Playwright MCP server with no args gracefully", async () => {
		const playwrightItem: MarketplaceItem = {
			id: "playwright",
			name: "Playwright MCP Server",
			type: "mcp",
			description: "Browser automation MCP server",
			author: "Playwright Team",
			url: "https://github.com/playwright/mcp",
			content: JSON.stringify({
				command: "npx",
				// No args property
			}),
		}

		// Mock file doesn't exist (new installation)
		vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" })
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)

		await installer.installItem(playwrightItem, { target: "global" })

		// Should not throw an error
		expect(fs.writeFile).toHaveBeenCalled()

		// Get the actual content that was written
		const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
		const writtenContent = JSON.parse(writeCall[1] as string)

		// Verify command is preserved and no args property exists
		expect(writtenContent.mcpServers.playwright.command).toBe("npx")
		expect(writtenContent.mcpServers.playwright.args).toBeUndefined()
	})

	it("should handle Playwright MCP server with mixed empty and non-empty args", async () => {
		const playwrightItem: MarketplaceItem = {
			id: "playwright",
			name: "Playwright MCP Server",
			type: "mcp",
			description: "Browser automation MCP server",
			author: "Playwright Team",
			url: "https://github.com/playwright/mcp",
			content: JSON.stringify({
				command: "npx",
				args: ["-y", "", "@playwright/mcp@latest", "--browser=", "--headless=false", "", "--viewport-size="],
			}),
		}

		// Mock file doesn't exist (new installation)
		vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" })
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)

		await installer.installItem(playwrightItem, { target: "project" })

		// Check that writeFile was called
		expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining("mcp.json"), expect.any(String), "utf-8")

		// Get the actual content that was written
		const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
		const writtenContent = JSON.parse(writeCall[1] as string)

		// Verify that only empty string arguments were filtered out
		expect(writtenContent.mcpServers.playwright.args).toEqual(["-y", "@playwright/mcp@latest", "--headless=false"])
	})
})
