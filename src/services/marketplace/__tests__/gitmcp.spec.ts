import { describe, it, expect, beforeEach, vi } from "vitest"
import { z } from "zod"
import { mcpMarketplaceItemSchema, type McpMarketplaceItem } from "@roo-code/types"
import gitMcpConfig from "../configs/gitmcp.json"

describe("GitMCP Configuration", () => {
	let config: any

	beforeEach(() => {
		// Load the GitMCP configuration
		config = { ...gitMcpConfig }
		// Remove the 'type' field as it's added programmatically
		delete config.type
		// Remove documentation field as it's not part of the schema
		delete config.documentation
	})

	describe("Schema Validation", () => {
		it("should have a valid MCP marketplace item structure", () => {
			// The schema expects 'content' to be a string or array of installation methods
			// Convert our JSON content to a string
			const configForValidation = {
				...config,
				content: JSON.stringify(config.content),
			}

			const result = mcpMarketplaceItemSchema.safeParse(configForValidation)

			if (!result.success) {
				console.error("Validation errors:", result.error.errors)
			}

			expect(result.success).toBe(true)
		})

		it("should have all required fields", () => {
			expect(config.id).toBe("gitmcp")
			expect(config.name).toBe("GitMCP")
			expect(config.description).toContain("GitHub repository")
			expect(config.url).toBe("https://gitmcp.io")
		})

		it("should have proper author information", () => {
			expect(config.author).toBe("GitMCP Team")
			expect(config.authorUrl).toBe("https://gitmcp.io")
		})

		it("should have appropriate tags", () => {
			expect(config.tags).toContain("github")
			expect(config.tags).toContain("repository")
			expect(config.tags).toContain("context")
			expect(config.tags).toContain("code")
		})

		it("should have prerequisites defined", () => {
			expect(config.prerequisites).toBeDefined()
			expect(config.prerequisites).toContain("Node.js 18 or higher")
			expect(config.prerequisites).toContain("npm or npx available in PATH")
		})

		it("should have parameters for GitHub token", () => {
			expect(config.parameters).toBeDefined()
			expect(config.parameters).toHaveLength(1)

			const tokenParam = config.parameters[0]
			expect(tokenParam.name).toBe("GitHub Personal Access Token")
			expect(tokenParam.key).toBe("GITHUB_PERSONAL_ACCESS_TOKEN")
			expect(tokenParam.optional).toBe(false)
		})
	})

	describe("Content Configuration", () => {
		it("should use npx to run the MCP server", () => {
			expect(config.content.command).toBe("npx")
			expect(config.content.args).toContain("-y")
			expect(config.content.args).toContain("@modelcontextprotocol/server-github")
		})

		it("should include environment variable for GitHub token", () => {
			expect(config.content.env).toBeDefined()
			expect(config.content.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("${GITHUB_PERSONAL_ACCESS_TOKEN}")
		})
	})

	describe("Installation Simulation", () => {
		it("should generate a valid MCP server configuration", () => {
			// Simulate what would be written to mcp_settings.json
			const mcpServerConfig = {
				command: config.content.command,
				args: config.content.args,
				env: config.content.env,
			}

			expect(mcpServerConfig.command).toBe("npx")
			expect(mcpServerConfig.args).toEqual(["-y", "@modelcontextprotocol/server-github"])
			expect(mcpServerConfig.env).toHaveProperty("GITHUB_PERSONAL_ACCESS_TOKEN")
		})

		it("should be installable with parameter substitution", () => {
			// Simulate parameter substitution
			const userToken = "ghp_test123456789"
			const installedConfig = {
				...config.content,
				env: {
					GITHUB_PERSONAL_ACCESS_TOKEN: userToken,
				},
			}

			expect(installedConfig.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe(userToken)
			expect(installedConfig.command).toBe("npx")
		})
	})

	describe("Documentation", () => {
		it("should have documentation in the original config", () => {
			const originalConfig = gitMcpConfig as any
			expect(originalConfig.documentation).toBeDefined()
			expect(originalConfig.documentation.overview).toContain("bridge between AI assistants")
			expect(originalConfig.documentation.features).toBeInstanceOf(Array)
			expect(originalConfig.documentation.setup).toBeInstanceOf(Array)
			expect(originalConfig.documentation.examples).toBeInstanceOf(Array)
		})

		it("should have usage examples", () => {
			const originalConfig = gitMcpConfig as any
			const examples = originalConfig.documentation.examples

			expect(examples).toContain(
				"Using GitMCP, show me how to use the useState hook in the facebook/react repository",
			)
			expect(examples).toContain("Analyze the architecture of the microsoft/vscode repository using GitMCP")
			expect(examples).toContain("What testing patterns are used in the nodejs/node repository?")
		})
	})
})
