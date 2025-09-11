import { describe, it, expect, vi } from "vitest"
import * as fs from "fs/promises"
import { SecurityMiddleware } from "../SecurityMiddleware"
import { fileExistsAtPath } from "../../../utils/fs"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("../../../utils/fs")
vi.mock("vscode", () => ({
	workspace: {
		createFileSystemWatcher: vi.fn(() => ({
			onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
			onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
			onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
			dispose: vi.fn(),
		})),
	},
	Disposable: vi.fn(),
}))

describe("SecurityMiddleware Simple Test", () => {
	it("should parse and apply YAML config correctly", async () => {
		const testConfig = `
version: '1.0'
security:
  enabled: true
  rules:
    - pattern: "**/.ssh/**"
      action: BLOCK
      priority: 100
      description: "SSH keys"
    - pattern: "**/.env*"
      action: ASK
      priority: 90
      description: "Environment files"
`

		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue(testConfig)

		const middleware = new SecurityMiddleware({
			cwd: "/test",
			projectConfigPath: "/test/.roo-security.yaml",
			debug: true,
		})

		await middleware.initialize()

		const config = middleware.getConfig()
		console.log("Config loaded:", JSON.stringify(config, null, 2))

		// Test SSH pattern
		const sshResult = await middleware.evaluateAccess(".ssh/id_rsa")
		console.log("SSH evaluation:", sshResult)
		expect(sshResult.action).toBe("BLOCK")

		// Test env pattern
		const envResult = await middleware.evaluateAccess(".env")
		console.log("ENV evaluation:", envResult)
		expect(envResult.action).toBe("ASK")

		// Test unmatched file
		const otherResult = await middleware.evaluateAccess("src/index.ts")
		console.log("Other evaluation:", otherResult)
		expect(otherResult.action).toBe("ALLOW")
	})
})
