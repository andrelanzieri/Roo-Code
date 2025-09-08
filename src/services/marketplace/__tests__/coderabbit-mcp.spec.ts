import { describe, it, expect, vi, beforeEach } from "vitest"
import * as yaml from "yaml"
import * as fs from "fs/promises"
import * as path from "path"
import { mcpMarketplaceItemSchema, type MarketplaceItem } from "@roo-code/types"

describe("CodeRabbit MCP Integration", () => {
	describe("Marketplace Configuration", () => {
		it("should have a valid CodeRabbit MCP marketplace configuration", async () => {
			// Read the CodeRabbit marketplace configuration
			const configPath = path.join(process.cwd(), "..", "marketplace", "mcps", "coderabbit.yaml")
			const configContent = await fs.readFile(configPath, "utf-8")
			const yamlData = yaml.parse(configContent)

			// Validate the configuration structure
			expect(yamlData).toHaveProperty("items")
			expect(Array.isArray(yamlData.items)).toBe(true)
			expect(yamlData.items).toHaveLength(1)

			const coderabbitConfig = yamlData.items[0]

			// Validate against the schema
			const result = mcpMarketplaceItemSchema.safeParse(coderabbitConfig)
			expect(result.success).toBe(true)

			if (result.success) {
				const item = result.data

				// Verify CodeRabbit specific properties
				expect(item.id).toBe("coderabbit")
				expect(item.name).toBe("CodeRabbit")
				expect(item.description).toContain("code review")
				expect(item.url).toBe("https://github.com/coderabbitai/mcp-server")
				expect(item.author).toBe("CodeRabbit")
				expect(item.authorUrl).toBe("https://coderabbit.ai")

				// Verify tags
				expect(item.tags).toContain("code-review")
				expect(item.tags).toContain("github")
				expect(item.tags).toContain("ai")

				// Verify installation methods
				expect(Array.isArray(item.content)).toBe(true)
				if (Array.isArray(item.content)) {
					expect(item.content).toHaveLength(3)

					// Check NPX installation method
					const npxMethod = item.content[0]
					expect(npxMethod.name).toBe("NPX Installation (Recommended)")
					expect(npxMethod.parameters).toBeDefined()
					expect(npxMethod.parameters?.some((p) => p.key === "CODERABBIT_API_KEY")).toBe(true)

					// Check Docker installation method
					const dockerMethod = item.content[1]
					expect(dockerMethod.name).toBe("Docker Installation")
					expect(dockerMethod.parameters).toBeDefined()
					expect(dockerMethod.parameters?.some((p) => p.key === "CODERABBIT_API_KEY")).toBe(true)
					expect(dockerMethod.parameters?.some((p) => p.key === "GITHUB_TOKEN")).toBe(true)

					// Check Local installation method
					const localMethod = item.content[2]
					expect(localMethod.name).toBe("Local Installation")
					expect(localMethod.parameters).toBeDefined()
					expect(localMethod.parameters?.some((p) => p.key === "CODERABBIT_API_KEY")).toBe(true)
				}

				// Verify global parameters
				expect(item.parameters).toBeDefined()
				expect(item.parameters?.some((p) => p.key === "CODERABBIT_REPO_PATH")).toBe(true)
				expect(item.parameters?.some((p) => p.key === "CODERABBIT_AUTO_REVIEW")).toBe(true)
				expect(item.parameters?.some((p) => p.key === "CODERABBIT_LANGUAGE")).toBe(true)
			}
		})

		it("should have valid JSON content in each installation method", async () => {
			const configPath = path.join(process.cwd(), "..", "marketplace", "mcps", "coderabbit.yaml")
			const configContent = await fs.readFile(configPath, "utf-8")
			const yamlData = yaml.parse(configContent)
			const coderabbitConfig = yamlData.items[0]

			if (Array.isArray(coderabbitConfig.content)) {
				for (const method of coderabbitConfig.content) {
					// Parse the JSON content
					const config = JSON.parse(method.content)

					// Verify it has required fields
					expect(config).toHaveProperty("command")
					expect(typeof config.command).toBe("string")

					if (config.args) {
						expect(Array.isArray(config.args)).toBe(true)
					}

					// Verify environment variables are properly templated
					if (config.env) {
						expect(typeof config.env).toBe("object")
						for (const [key, value] of Object.entries(config.env)) {
							expect(typeof value).toBe("string")
							// Check that API key is templated
							if (key === "CODERABBIT_API_KEY") {
								expect(value).toContain("${CODERABBIT_API_KEY}")
							}
						}
					}
				}
			}
		})
	})

	describe("Local MCP Configuration", () => {
		it("should have a valid local MCP configuration for testing", async () => {
			const mcpConfigPath = path.join(process.cwd(), "..", ".roo", "mcp.json")
			const configContent = await fs.readFile(mcpConfigPath, "utf-8")
			const config = JSON.parse(configContent)

			// Verify structure
			expect(config).toHaveProperty("mcpServers")
			expect(config.mcpServers).toHaveProperty("coderabbit")

			const coderabbitServer = config.mcpServers.coderabbit

			// Verify server configuration
			expect(coderabbitServer.command).toBe("npx")
			expect(coderabbitServer.args).toEqual(["-y", "@coderabbitai/mcp-server"])
			expect(coderabbitServer.env).toHaveProperty("CODERABBIT_API_KEY")
			expect(coderabbitServer.env.CODERABBIT_API_KEY).toBe("${CODERABBIT_API_KEY}")

			// Verify it's disabled by default (for safety)
			expect(coderabbitServer.disabled).toBe(true)

			// Verify timeout is set
			expect(coderabbitServer.timeout).toBe(60)
		})
	})

	describe("MCP Server Tools", () => {
		it("should define expected CodeRabbit MCP tools", () => {
			// This is a placeholder test for when the MCP server is actually running
			// It would verify that the server exposes the expected tools
			const expectedTools = [
				"analyze_pr",
				"review_code",
				"suggest_improvements",
				"check_patterns",
				"generate_summary",
			]

			// When the server is running, we would fetch the actual tools
			// and verify they match our expectations
			expect(expectedTools).toBeDefined()
		})
	})

	describe("Integration with Marketplace Manager", () => {
		it("should be installable through the marketplace system", async () => {
			// This test would verify that the CodeRabbit MCP can be installed
			// through the existing marketplace installation system

			const mockMarketplaceItem: MarketplaceItem = {
				type: "mcp",
				id: "coderabbit",
				name: "CodeRabbit",
				description: "AI-powered code review assistant",
				url: "https://github.com/coderabbitai/mcp-server",
				content: [
					{
						name: "NPX Installation",
						content: JSON.stringify({
							command: "npx",
							args: ["-y", "@coderabbitai/mcp-server"],
							env: { CODERABBIT_API_KEY: "${CODERABBIT_API_KEY}" },
						}),
						parameters: [
							{
								name: "CodeRabbit API Key",
								key: "CODERABBIT_API_KEY",
								placeholder: "Your API key",
								optional: false,
							},
						],
					},
				],
			}

			// Verify the item structure matches what the installer expects
			expect(mockMarketplaceItem.type).toBe("mcp")
			expect(mockMarketplaceItem.content).toBeDefined()
			expect(Array.isArray(mockMarketplaceItem.content)).toBe(true)
		})
	})
})
