import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { CustomMcpDialog } from "../CustomMcpDialog"
import { vscode } from "@/utils/vscode"

// Mock vscode
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock translation hook
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"marketplace:customMcp.title": "Add Custom MCP Server",
				"marketplace:customMcp.description": "Configure a custom MCP server",
				"marketplace:customMcp.serverName": "Server Name",
				"marketplace:customMcp.serverNamePlaceholder": "e.g., my-mcp-server",
				"marketplace:customMcp.command": "Command",
				"marketplace:customMcp.commandPlaceholder": "e.g., npx",
				"marketplace:customMcp.args": "Arguments (comma-separated)",
				"marketplace:customMcp.argsPlaceholder": "e.g., -y, @serena/mcp-server",
				"marketplace:customMcp.env": "Environment Variables (optional, KEY=value format, one per line)",
				"marketplace:customMcp.envPlaceholder": "KEY=value",
				"marketplace:customMcp.cancel": "Cancel",
				"marketplace:customMcp.add": "Add Server",
			}
			return translations[key] || key
		},
	}),
}))

describe("CustomMcpDialog", () => {
	const mockOnClose = vi.fn()
	const mockOnSuccess = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should render the dialog", () => {
		render(<CustomMcpDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />)

		expect(screen.getByText("Add Custom MCP Server")).toBeInTheDocument()
		expect(screen.getByLabelText("Server Name")).toBeInTheDocument()
		expect(screen.getByLabelText("Command")).toBeInTheDocument()
		expect(screen.getByLabelText("Arguments (comma-separated)")).toBeInTheDocument()
		expect(
			screen.getByLabelText("Environment Variables (optional, KEY=value format, one per line)"),
		).toBeInTheDocument()
	})

	it("should load Serena example when clicking the example button", () => {
		render(<CustomMcpDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />)

		// First click "Looking for Serena MCP?" to show the example
		const lookingForSerena = screen.getByText("Looking for Serena MCP?")
		fireEvent.click(lookingForSerena)

		// Then click "Load Serena Example"
		const exampleButton = screen.getByText("Load Serena Example")
		fireEvent.click(exampleButton)

		const serverNameInput = screen.getByLabelText("Server Name") as HTMLInputElement
		const commandInput = screen.getByLabelText("Command") as HTMLInputElement
		const argsInput = screen.getByLabelText("Arguments (comma-separated)") as HTMLInputElement

		expect(serverNameInput.value).toBe("serena-mcp")
		expect(commandInput.value).toBe("npx")
		expect(argsInput.value).toBe("-y, @serena/mcp-server")
	})

	it("should validate required fields", async () => {
		render(<CustomMcpDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />)

		const addButton = screen.getByText("Add Server")
		fireEvent.click(addButton)

		// Should show validation error for server name
		await waitFor(() => {
			expect(screen.getByText("Server name is required")).toBeInTheDocument()
		})

		// Should not post message when validation fails
		expect(vscode.postMessage).not.toHaveBeenCalled()
		expect(mockOnSuccess).not.toHaveBeenCalled()
	})

	it("should send correct message when adding a server", async () => {
		render(<CustomMcpDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />)

		// Fill in the form
		const serverNameInput = screen.getByLabelText("Server Name") as HTMLInputElement
		const commandInput = screen.getByLabelText("Command") as HTMLInputElement
		const argsInput = screen.getByLabelText("Arguments (comma-separated)") as HTMLInputElement
		const envInput = screen.getByLabelText(
			"Environment Variables (optional, KEY=value format, one per line)",
		) as HTMLTextAreaElement

		fireEvent.change(serverNameInput, { target: { value: "test-server" } })
		fireEvent.change(commandInput, { target: { value: "node" } })
		fireEvent.change(argsInput, { target: { value: "server.js, --port, 3000" } })
		fireEvent.change(envInput, { target: { value: "API_KEY=test123\nDEBUG=true" } })

		// Click add button
		const addButton = screen.getByText("Add Server")
		fireEvent.click(addButton)

		// Should send the correct message
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "addCustomMcpServer",
				serverName: "test-server",
				customMcpConfig: {
					command: "node",
					args: ["server.js", "--port", "3000"],
					env: {
						API_KEY: "test123",
						DEBUG: "true",
					},
				},
			})
		})

		// Should call onSuccess
		expect(mockOnSuccess).toHaveBeenCalled()
	})

	it("should handle empty arguments correctly", async () => {
		render(<CustomMcpDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />)

		// Fill in only required fields
		const serverNameInput = screen.getByLabelText("Server Name") as HTMLInputElement
		const commandInput = screen.getByLabelText("Command") as HTMLInputElement

		fireEvent.change(serverNameInput, { target: { value: "simple-server" } })
		fireEvent.change(commandInput, { target: { value: "python" } })

		// Click add button
		const addButton = screen.getByText("Add Server")
		fireEvent.click(addButton)

		// Should send message with empty args (no env field when empty)
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "addCustomMcpServer",
				serverName: "simple-server",
				customMcpConfig: {
					command: "python",
					args: [],
				},
			})
		})
	})

	it("should close dialog when clicking cancel", () => {
		render(<CustomMcpDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />)

		const cancelButton = screen.getByText("Cancel")
		fireEvent.click(cancelButton)

		expect(mockOnClose).toHaveBeenCalled()
		expect(vscode.postMessage).not.toHaveBeenCalled()
		expect(mockOnSuccess).not.toHaveBeenCalled()
	})

	it("should parse environment variables correctly", async () => {
		render(<CustomMcpDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />)

		const serverNameInput = screen.getByLabelText("Server Name") as HTMLInputElement
		const commandInput = screen.getByLabelText("Command") as HTMLInputElement
		const envInput = screen.getByLabelText(
			"Environment Variables (optional, KEY=value format, one per line)",
		) as HTMLTextAreaElement

		fireEvent.change(serverNameInput, { target: { value: "env-test" } })
		fireEvent.change(commandInput, { target: { value: "test" } })
		// Test various env formats including spaces and special characters
		fireEvent.change(envInput, {
			target: { value: "KEY1=value1\nKEY2 = value with spaces\nKEY3=\nINVALID_LINE\n  KEY4=trimmed  " },
		})

		const addButton = screen.getByText("Add Server")
		fireEvent.click(addButton)

		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "addCustomMcpServer",
				serverName: "env-test",
				customMcpConfig: {
					command: "test",
					args: [],
					env: {
						KEY1: "value1",
						KEY2: "value with spaces",
						KEY3: "",
						KEY4: "trimmed",
					},
				},
			})
		})
	})

	it("should trim whitespace from inputs", async () => {
		render(<CustomMcpDialog onClose={mockOnClose} onSuccess={mockOnSuccess} />)

		const serverNameInput = screen.getByLabelText("Server Name") as HTMLInputElement
		const commandInput = screen.getByLabelText("Command") as HTMLInputElement
		const argsInput = screen.getByLabelText("Arguments (comma-separated)") as HTMLInputElement

		fireEvent.change(serverNameInput, { target: { value: "  trimmed-server  " } })
		fireEvent.change(commandInput, { target: { value: "  node  " } })
		fireEvent.change(argsInput, { target: { value: "  arg1  ,  arg2  " } })

		const addButton = screen.getByText("Add Server")
		fireEvent.click(addButton)

		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "addCustomMcpServer",
				serverName: "trimmed-server",
				customMcpConfig: {
					command: "node",
					args: ["arg1", "arg2"],
				},
			})
		})
	})
})
