// npx vitest run src/integrations/terminal/__tests__/Terminal.env-preservation.spec.ts

import { Terminal } from "../Terminal"

describe("Terminal.getEnv() - Environment Preservation", () => {
	let originalEnv: NodeJS.ProcessEnv

	beforeEach(() => {
		// Save original environment
		originalEnv = { ...process.env }
	})

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv
	})

	it("should preserve existing environment variables", () => {
		// Set up test environment variables (simulating nix-shell)
		process.env.NIX_BUILD_CORES = "4"
		process.env.NIX_STORE = "/nix/store"
		process.env.IN_NIX_SHELL = "impure"
		process.env.CUSTOM_VAR = "custom_value"

		const env = Terminal.getEnv()

		// Check that nix-shell variables are preserved
		expect(env.NIX_BUILD_CORES).toBe("4")
		expect(env.NIX_STORE).toBe("/nix/store")
		expect(env.IN_NIX_SHELL).toBe("impure")
		expect(env.CUSTOM_VAR).toBe("custom_value")

		// Check that Roo Code specific variables are still set
		expect(env.PAGER).toBe(process.platform === "win32" ? "" : "cat")
		expect(env.VTE_VERSION).toBe("0")
	})

	it("should override specific environment variables when needed", () => {
		// Set conflicting environment variables
		process.env.PAGER = "less"
		process.env.VTE_VERSION = "6003"

		const env = Terminal.getEnv()

		// Check that Roo Code overrides take precedence
		expect(env.PAGER).toBe(process.platform === "win32" ? "" : "cat")
		expect(env.VTE_VERSION).toBe("0")
	})

	it("should preserve PATH and other critical environment variables", () => {
		// Set critical environment variables
		process.env.PATH = "/usr/local/bin:/usr/bin:/bin"
		process.env.HOME = "/home/user"
		process.env.USER = "testuser"
		process.env.SHELL = "/bin/zsh"

		const env = Terminal.getEnv()

		// Check that critical variables are preserved
		expect(env.PATH).toBe("/usr/local/bin:/usr/bin:/bin")
		expect(env.HOME).toBe("/home/user")
		expect(env.USER).toBe("testuser")
		expect(env.SHELL).toBe("/bin/zsh")
	})

	it("should handle undefined environment variables gracefully", () => {
		// Clear some environment variables
		delete process.env.SOME_UNDEFINED_VAR

		const env = Terminal.getEnv()

		// Should not throw and should not include undefined values
		expect(env.SOME_UNDEFINED_VAR).toBeUndefined()
	})

	it("should preserve nix-shell specific environment modifications", () => {
		// Simulate a comprehensive nix-shell environment
		process.env.NIX_BUILD_CORES = "8"
		process.env.NIX_STORE = "/nix/store"
		process.env.IN_NIX_SHELL = "impure"
		process.env.NIX_ENFORCE_NO_NATIVE = "1"
		process.env.PKG_CONFIG_PATH = "/nix/store/xxx/lib/pkgconfig"
		process.env.NODE_PATH = "/nix/store/yyy/lib/node_modules"
		process.env.buildInputs = "/nix/store/aaa /nix/store/bbb"
		process.env.nativeBuildInputs = "/nix/store/ccc /nix/store/ddd"

		const env = Terminal.getEnv()

		// All nix-shell variables should be preserved
		expect(env.NIX_BUILD_CORES).toBe("8")
		expect(env.NIX_STORE).toBe("/nix/store")
		expect(env.IN_NIX_SHELL).toBe("impure")
		expect(env.NIX_ENFORCE_NO_NATIVE).toBe("1")
		expect(env.PKG_CONFIG_PATH).toBe("/nix/store/xxx/lib/pkgconfig")
		expect(env.NODE_PATH).toBe("/nix/store/yyy/lib/node_modules")
		expect(env.buildInputs).toBe("/nix/store/aaa /nix/store/bbb")
		expect(env.nativeBuildInputs).toBe("/nix/store/ccc /nix/store/ddd")
	})

	it("should add PROMPT_EOL_MARK when Terminal.getTerminalZshClearEolMark() is true", () => {
		// This is the default behavior
		const originalValue = Terminal.getTerminalZshClearEolMark()
		Terminal.setTerminalZshClearEolMark(true)

		try {
			const env = Terminal.getEnv()
			expect(env.PROMPT_EOL_MARK).toBe("")
		} finally {
			Terminal.setTerminalZshClearEolMark(originalValue)
		}
	})

	it("should not override PROMPT_EOL_MARK when Terminal.getTerminalZshClearEolMark() is false", () => {
		const originalValue = Terminal.getTerminalZshClearEolMark()
		Terminal.setTerminalZshClearEolMark(false)
		process.env.PROMPT_EOL_MARK = "%"

		try {
			const env = Terminal.getEnv()
			expect(env.PROMPT_EOL_MARK).toBe("%")
		} finally {
			Terminal.setTerminalZshClearEolMark(originalValue)
		}
	})
})
