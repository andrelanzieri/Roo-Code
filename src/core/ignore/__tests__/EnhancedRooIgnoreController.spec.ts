import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { EnhancedRooIgnoreController } from "../EnhancedRooIgnoreController"
import { SecurityEvaluation } from "../../security/types"
import { fileExistsAtPath } from "../../../utils/fs"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("fs")
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
	RelativePattern: vi.fn((base, pattern) => ({ base, pattern })),
	Disposable: vi.fn(),
}))

describe("EnhancedRooIgnoreController", () => {
	let controller: EnhancedRooIgnoreController
	let mockAskHandler: ReturnType<typeof vi.fn>
	const testCwd = "/test/project"

	const mockRooIgnoreContent = `
# Traditional .rooignore patterns
node_modules/
*.log
.env
secrets/
`

	const mockSecurityConfig = `
version: '1.0'
security:
  enabled: true
  rules:
    - pattern: "**/*.key"
      action: ASK
      priority: 90
      description: "Key files"
    - pattern: "**/sensitive/**"
      action: BLOCK
      priority: 100
      description: "Sensitive directory"
`

	beforeEach(() => {
		vi.clearAllMocks()
		mockAskHandler = vi.fn().mockResolvedValue(true)

		// Setup file existence mocks
		vi.mocked(fileExistsAtPath).mockImplementation(async (filePath) => {
			return filePath.includes(".rooignore") || filePath.includes(".roo-security")
		})

		// Setup file read mocks
		vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
			const pathStr = filePath.toString()
			if (pathStr.includes(".rooignore")) return mockRooIgnoreContent
			if (pathStr.includes(".roo-security")) return mockSecurityConfig
			return ""
		})
	})

	afterEach(() => {
		if (controller) {
			controller.dispose()
		}
	})

	describe("backward compatibility", () => {
		it("should work without security middleware enabled", async () => {
			controller = new EnhancedRooIgnoreController(testCwd)
			await controller.initialize()

			// Should block based on .rooignore
			expect(controller.validateAccess("node_modules/package.json")).toBe(false)
			expect(controller.validateAccess(".env")).toBe(false)
			expect(controller.validateAccess("src/index.ts")).toBe(true)
		})

		it("should maintain synchronous validateAccess for compatibility", () => {
			controller = new EnhancedRooIgnoreController(testCwd)

			// Should be able to call synchronously
			const result = controller.validateAccess("test.txt")
			expect(typeof result).toBe("boolean")
		})

		it("should maintain synchronous validateCommand for compatibility", () => {
			controller = new EnhancedRooIgnoreController(testCwd)

			// Should be able to call synchronously
			const result = controller.validateCommand("cat test.txt")
			expect(result === undefined || typeof result === "string").toBe(true)
		})
	})

	describe("with security middleware enabled", () => {
		beforeEach(async () => {
			controller = new EnhancedRooIgnoreController(testCwd, {
				enableSecurityMiddleware: true,
				askHandler: mockAskHandler,
				securityOptions: {
					projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
				},
			})
			await controller.initialize()
		})

		it("should combine .rooignore and security middleware rules", async () => {
			// Blocked by .rooignore
			const envResult = await controller.validateAccessAsync(".env")
			expect(envResult.allowed).toBe(false)
			expect(envResult.evaluation?.message).toContain(".rooignore")

			// Blocked by security middleware
			const sensitiveResult = await controller.validateAccessAsync("sensitive/data.txt")
			expect(sensitiveResult.allowed).toBe(false)
			expect(sensitiveResult.evaluation?.action).toBe("BLOCK")

			// Allowed by both
			const srcResult = await controller.validateAccessAsync("src/index.ts")
			expect(srcResult.allowed).toBe(true)
		})

		it("should handle ASK actions", async () => {
			mockAskHandler.mockResolvedValue(true)

			const result = await controller.validateAccessAsync("private.key")

			expect(result.requiresApproval).toBe(true)
			expect(result.evaluation?.action).toBe("ASK")
			expect(result.evaluation?.matchedRule?.description).toBe("Key files")
		})

		it("should prioritize .rooignore blocks over security ASK", async () => {
			// Add a pattern that would ASK in security but is blocked by .rooignore
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				const pathStr = filePath.toString()
				if (pathStr.includes(".rooignore")) return ".env.key"
				if (pathStr.includes(".roo-security")) return mockSecurityConfig
				return ""
			})

			const newController = new EnhancedRooIgnoreController(testCwd, {
				enableSecurityMiddleware: true,
				askHandler: mockAskHandler,
			})
			await newController.initialize()

			const result = await newController.validateAccessAsync(".env.key")

			expect(result.allowed).toBe(false)
			expect(result.evaluation?.message).toContain(".rooignore")
			expect(mockAskHandler).not.toHaveBeenCalled()

			newController.dispose()
		})
	})

	describe("validateCommandAsync", () => {
		beforeEach(async () => {
			controller = new EnhancedRooIgnoreController(testCwd, {
				enableSecurityMiddleware: true,
				askHandler: mockAskHandler,
				securityOptions: {
					projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
				},
			})
			await controller.initialize()
		})

		it("should block commands accessing protected files", async () => {
			const result = await controller.validateCommandAsync("cat .env")

			expect(result.allowed).toBe(false)
			expect(result.blockedFile).toBe(".env")
			expect(result.evaluation?.message).toContain(".rooignore")
		})

		it("should handle ASK for commands", async () => {
			const result = await controller.validateCommandAsync("cat private.key")

			expect(result.allowed).toBe(false)
			expect(result.requiresApproval).toBe(true)
			expect(result.blockedFile).toBe("private.key")
		})

		it("should allow commands not accessing files", async () => {
			const result = await controller.validateCommandAsync("ls -la")

			expect(result.allowed).toBe(true)
			expect(result.blockedFile).toBeUndefined()
		})
	})

	describe("statistics and configuration", () => {
		beforeEach(async () => {
			controller = new EnhancedRooIgnoreController(testCwd, {
				enableSecurityMiddleware: true,
				askHandler: mockAskHandler,
				securityOptions: {
					projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
				},
			})
			await controller.initialize()
		})

		it("should provide security statistics", async () => {
			await controller.validateAccessAsync("sensitive/file.txt")
			await controller.validateAccessAsync("src/index.ts")
			await controller.validateAccessAsync("private.key")

			const stats = controller.getSecurityStats()

			expect(stats).toBeDefined()
			expect(stats?.totalEvaluations).toBeGreaterThan(0)
		})

		it("should provide security configuration", () => {
			const config = controller.getSecurityConfig()

			expect(config).toBeDefined()
			expect(config?.project).toBeDefined()
		})

		it("should export security configuration", async () => {
			const yamlContent = await controller.exportSecurityConfig("project")

			expect(yamlContent).toBeDefined()
			expect(yamlContent).toContain("version")
			expect(yamlContent).toContain("security")
		})

		it("should import security configuration", async () => {
			const newConfig = `
version: '1.0'
security:
  enabled: true
  rules:
    - pattern: "**/*.test"
      action: BLOCK
      priority: 100
`

			await controller.importSecurityConfig(newConfig, "custom")

			const config = controller.getSecurityConfig()
			expect(config?.custom).toBeDefined()
		})
	})

	describe("getInstructions", () => {
		it("should provide basic instructions without security middleware", async () => {
			controller = new EnhancedRooIgnoreController(testCwd)
			await controller.initialize()

			const instructions = controller.getInstructions()

			expect(instructions).toContain(".rooignore")
			expect(instructions).not.toContain("Security Middleware")
		})

		it("should provide enhanced instructions with security middleware", async () => {
			controller = new EnhancedRooIgnoreController(testCwd, {
				enableSecurityMiddleware: true,
				securityOptions: {
					projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
				},
			})
			await controller.initialize()

			// Trigger some evaluations for statistics
			await controller.validateAccessAsync("test.txt")

			const instructions = controller.getInstructions()

			expect(instructions).toContain(".rooignore")
			expect(instructions).toContain("Security Middleware")
			expect(instructions).toContain("Security Statistics")
		})
	})

	describe("disposal", () => {
		it("should dispose both base controller and security middleware", async () => {
			const disposeSpy = vi.spyOn(EnhancedRooIgnoreController.prototype, "dispose")

			controller = new EnhancedRooIgnoreController(testCwd, {
				enableSecurityMiddleware: true,
			})
			await controller.initialize()

			controller.dispose()

			expect(disposeSpy).toHaveBeenCalled()
		})
	})

	describe("edge cases", () => {
		it("should handle undefined ask handler gracefully", async () => {
			controller = new EnhancedRooIgnoreController(testCwd, {
				enableSecurityMiddleware: true,
				// No askHandler provided
			})
			await controller.initialize()

			// Should default to blocking ASK actions when no handler
			const result = await controller.validateAccessAsync("private.key")

			expect(result.allowed).toBe(false)
			expect(result.requiresApproval).toBe(true)
		})

		it("should handle file paths with backslashes", async () => {
			controller = new EnhancedRooIgnoreController(testCwd, {
				enableSecurityMiddleware: true,
			})
			await controller.initialize()

			const result = await controller.validateAccessAsync("sensitive\\data.txt")

			expect(result.allowed).toBe(false)
		})

		it("should handle relative and absolute paths", async () => {
			controller = new EnhancedRooIgnoreController(testCwd, {
				enableSecurityMiddleware: true,
			})
			await controller.initialize()

			// Relative path
			const relativeResult = await controller.validateAccessAsync("./sensitive/data.txt")
			expect(relativeResult.allowed).toBe(false)

			// Absolute path
			const absoluteResult = await controller.validateAccessAsync(path.join(testCwd, "sensitive/data.txt"))
			expect(absoluteResult.allowed).toBe(false)
		})
	})
})
