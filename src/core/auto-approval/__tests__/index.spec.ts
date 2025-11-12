import { describe, it, expect, vi } from "vitest"
import { checkAutoApproval } from "../index"
import type { ExtensionState } from "../../../shared/ExtensionMessage"
import type { McpServerUse } from "@roo-code/types"

describe("checkAutoApproval", () => {
	describe("MCP auto-approval", () => {
		it("should approve MCP tool when alwaysAllowMcp is enabled", async () => {
			const mcpServerUse: McpServerUse = {
				type: "use_mcp_tool",
				serverName: "test-server",
				toolName: "test-tool",
			}

			const state: Partial<ExtensionState> = {
				autoApprovalEnabled: true,
				alwaysAllowMcp: true,
				mcpServers: [
					{
						name: "test-server",
						config: "test-config",
						status: "connected",
						tools: [
							{
								name: "test-tool",
								alwaysAllow: false, // Tool does NOT have alwaysAllow flag
							},
						],
					},
				] as any,
			}

			const result = await checkAutoApproval({
				state: state as ExtensionState,
				ask: "use_mcp_server",
				text: JSON.stringify(mcpServerUse),
			})

			// Should approve because alwaysAllowMcp is true, regardless of tool's alwaysAllow flag
			expect(result).toEqual({ decision: "approve" })
		})

		it("should approve MCP tool when tool has alwaysAllow flag even if alwaysAllowMcp is false", async () => {
			const mcpServerUse: McpServerUse = {
				type: "use_mcp_tool",
				serverName: "test-server",
				toolName: "test-tool",
			}

			const state: Partial<ExtensionState> = {
				autoApprovalEnabled: true,
				alwaysAllowMcp: false, // Global MCP auto-approval is disabled
				mcpServers: [
					{
						name: "test-server",
						config: "test-config",
						status: "connected",
						tools: [
							{
								name: "test-tool",
								alwaysAllow: true, // Tool has individual alwaysAllow flag
							},
						],
					},
				] as any,
			}

			const result = await checkAutoApproval({
				state: state as ExtensionState,
				ask: "use_mcp_server",
				text: JSON.stringify(mcpServerUse),
			})

			// Should approve because tool has alwaysAllow flag
			expect(result).toEqual({ decision: "approve" })
		})

		it("should ask for approval when neither alwaysAllowMcp nor tool alwaysAllow is set", async () => {
			const mcpServerUse: McpServerUse = {
				type: "use_mcp_tool",
				serverName: "test-server",
				toolName: "test-tool",
			}

			const state: Partial<ExtensionState> = {
				autoApprovalEnabled: true,
				alwaysAllowMcp: false,
				mcpServers: [
					{
						name: "test-server",
						config: "test-config",
						status: "connected",
						tools: [
							{
								name: "test-tool",
								alwaysAllow: false,
							},
						],
					},
				] as any,
			}

			const result = await checkAutoApproval({
				state: state as ExtensionState,
				ask: "use_mcp_server",
				text: JSON.stringify(mcpServerUse),
			})

			// Should ask because neither condition is met
			expect(result).toEqual({ decision: "ask" })
		})

		it("should approve MCP resource access when alwaysAllowMcp is enabled", async () => {
			const mcpServerUse: McpServerUse = {
				type: "access_mcp_resource",
				serverName: "test-server",
				uri: "test://resource",
			}

			const state: Partial<ExtensionState> = {
				autoApprovalEnabled: true,
				alwaysAllowMcp: true,
			}

			const result = await checkAutoApproval({
				state: state as ExtensionState,
				ask: "use_mcp_server",
				text: JSON.stringify(mcpServerUse),
			})

			// Should approve resource access when alwaysAllowMcp is true
			expect(result).toEqual({ decision: "approve" })
		})

		it("should ask for MCP resource access when alwaysAllowMcp is disabled", async () => {
			const mcpServerUse: McpServerUse = {
				type: "access_mcp_resource",
				serverName: "test-server",
				uri: "test://resource",
			}

			const state: Partial<ExtensionState> = {
				autoApprovalEnabled: true,
				alwaysAllowMcp: false,
			}

			const result = await checkAutoApproval({
				state: state as ExtensionState,
				ask: "use_mcp_server",
				text: JSON.stringify(mcpServerUse),
			})

			// Should ask for resource access when alwaysAllowMcp is false
			expect(result).toEqual({ decision: "ask" })
		})

		it("should handle missing text gracefully", async () => {
			const state: Partial<ExtensionState> = {
				autoApprovalEnabled: true,
				alwaysAllowMcp: true,
			}

			const result = await checkAutoApproval({
				state: state as ExtensionState,
				ask: "use_mcp_server",
				text: undefined,
			})

			expect(result).toEqual({ decision: "ask" })
		})

		it("should handle invalid JSON gracefully", async () => {
			const state: Partial<ExtensionState> = {
				autoApprovalEnabled: true,
				alwaysAllowMcp: true,
			}

			const result = await checkAutoApproval({
				state: state as ExtensionState,
				ask: "use_mcp_server",
				text: "invalid json",
			})

			expect(result).toEqual({ decision: "ask" })
		})
	})

	describe("General auto-approval settings", () => {
		it("should ask when autoApprovalEnabled is false", async () => {
			const state: Partial<ExtensionState> = {
				autoApprovalEnabled: false,
				alwaysAllowMcp: true,
			}

			const result = await checkAutoApproval({
				state: state as ExtensionState,
				ask: "use_mcp_server",
				text: JSON.stringify({ type: "use_mcp_tool", serverName: "test", toolName: "test" }),
			})

			expect(result).toEqual({ decision: "ask" })
		})

		it("should ask when state is undefined", async () => {
			const result = await checkAutoApproval({
				state: undefined,
				ask: "use_mcp_server",
				text: JSON.stringify({ type: "use_mcp_tool", serverName: "test", toolName: "test" }),
			})

			expect(result).toEqual({ decision: "ask" })
		})
	})
})
