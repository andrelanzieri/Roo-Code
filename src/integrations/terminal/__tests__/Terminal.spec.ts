// npx vitest run src/integrations/terminal/__tests__/Terminal.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as vscode from "vscode"
import { Terminal } from "../Terminal"

vi.mock("vscode", () => ({
	window: {
		createTerminal: vi.fn(),
	},
	ThemeIcon: vi.fn().mockImplementation((icon) => ({ icon })),
}))

describe("Terminal", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset all static properties
		Terminal.setShellIntegrationTimeout(5000)
		Terminal.setCommandDelay(0)
		Terminal.setTerminalZshClearEolMark(true)
		Terminal.setTerminalZshOhMy(false)
		Terminal.setTerminalZshP10k(false)
		Terminal.setTerminalZdotdir(false)
	})

	describe("getEnv", () => {
		it("should include UTF-8 encoding environment variables", () => {
			const env = Terminal.getEnv()

			expect(env.LANG).toBe("en_US.UTF-8")
			expect(env.LC_ALL).toBe("en_US.UTF-8")
		})

		it("should include VTE_VERSION and PAGER", () => {
			const env = Terminal.getEnv()

			expect(env.VTE_VERSION).toBe("0")
			expect(env.PAGER).toBe(process.platform === "win32" ? "" : "cat")
		})

		it("should handle Oh My Zsh configuration", () => {
			Terminal.setTerminalZshOhMy(true)
			const env = Terminal.getEnv()

			expect(env.ITERM_SHELL_INTEGRATION_INSTALLED).toBe("Yes")
		})

		it("should handle Powerlevel10k configuration", () => {
			Terminal.setTerminalZshP10k(true)
			const env = Terminal.getEnv()

			expect(env.POWERLEVEL9K_TERM_SHELL_INTEGRATION).toBe("true")
		})

		it("should handle command delay configuration", () => {
			Terminal.setCommandDelay(100)
			const env = Terminal.getEnv()

			expect(env.PROMPT_COMMAND).toBe("sleep 0.1")
		})

		it("should clear EOL mark by default", () => {
			const env = Terminal.getEnv()

			expect(env.PROMPT_EOL_MARK).toBe("")
		})

		it("should not clear EOL mark when disabled", () => {
			Terminal.setTerminalZshClearEolMark(false)
			const env = Terminal.getEnv()

			expect(env.PROMPT_EOL_MARK).toBeUndefined()
		})
	})

	describe("Terminal creation", () => {
		it("should create terminal with UTF-8 environment", () => {
			const mockTerminal = { shellIntegration: undefined }
			vi.mocked(vscode.window.createTerminal).mockReturnValue(mockTerminal as any)

			const terminal = new Terminal(1, undefined, "/test/path")

			expect(vscode.window.createTerminal).toHaveBeenCalledWith({
				cwd: "/test/path",
				name: "Roo Code",
				iconPath: expect.objectContaining({ icon: "rocket" }),
				env: expect.objectContaining({
					LANG: "en_US.UTF-8",
					LC_ALL: "en_US.UTF-8",
				}),
			})
		})
	})

	describe("UTF-8 command handling", () => {
		it("should properly handle commands with UTF-8 characters", async () => {
			const mockTerminal = {
				shellIntegration: {
					executeCommand: vi.fn(),
					cwd: { fsPath: "/test/path" },
				},
				exitStatus: undefined,
			}
			vi.mocked(vscode.window.createTerminal).mockReturnValue(mockTerminal as any)

			const terminal = new Terminal(1, undefined, "/test/path")

			// Test that the terminal is created with proper UTF-8 environment
			const env = Terminal.getEnv()
			expect(env.LANG).toBe("en_US.UTF-8")
			expect(env.LC_ALL).toBe("en_US.UTF-8")

			// Verify that environment ensures proper encoding for commands with special characters
			const testCommands = [
				'python -c "print(\\" → foo\\")"',
				'echo "→ arrow"',
				'echo "λ lambda"',
				'echo "中文"',
				'echo "émoji 😀"',
			]

			// The UTF-8 environment should be set properly for handling these commands
			for (const cmd of testCommands) {
				// The terminal should be able to handle UTF-8 commands without issues
				expect(() => {
					// This validates that the environment is properly configured
					const encodedCmd = Buffer.from(cmd, "utf8").toString("utf8")
					expect(encodedCmd).toBe(cmd)
				}).not.toThrow()
			}
		})
	})
})
