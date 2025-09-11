import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import { SecurityMiddleware } from "../SecurityMiddleware"
import { SecurityAction, SecurityMiddlewareOptions } from "../types"
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

describe("SecurityMiddleware", () => {
	let middleware: SecurityMiddleware
	let mockAskHandler: ReturnType<typeof vi.fn>
	const testCwd = "/test/project"

	const mockGlobalConfig = `
version: '1.0'
security:
  enabled: true
  inheritRules: true
  defaultAction: ALLOW
  rules:
    - pattern: '**/.env*'
      action: ASK
      priority: 90
      description: Environment files
      askMessage: 'Access to \${file} requires approval'
    - pattern: '**/.ssh/**'
      action: BLOCK
      priority: 100
      description: SSH keys
`

	const mockProjectConfig = `
version: '1.0'
security:
  enabled: true
  inheritRules: true
  defaultAction: ALLOW
  rules:
    - pattern: 'config/production.*'
      action: BLOCK
      priority: 100
      description: Production config
    - pattern: '**/*.key'
      action: ASK
      priority: 85
      description: Key files
`

	const mockCustomConfig = `
version: '1.0'
security:
  enabled: true
  inheritRules: true
  defaultAction: ALLOW
  rules:
    - pattern: 'test/fixtures/**'
      action: ALLOW
      priority: 200
      description: Test fixtures
    - pattern: '**/personal/**'
      action: BLOCK
      priority: 150
      description: Personal files
`

	beforeEach(() => {
		vi.clearAllMocks()
		mockAskHandler = vi.fn().mockResolvedValue(true)

		// Setup file existence mocks
		vi.mocked(fileExistsAtPath).mockImplementation(async (filePath) => {
			const pathStr = filePath.toString()
			// Return true for the config files we want to load
			return pathStr.includes(".roo-security")
		})

		// Setup file read mocks
		vi.mocked(fs.readFile).mockImplementation(async (filePath, encoding) => {
			const pathStr = filePath.toString()
			if (pathStr.includes("global")) return mockGlobalConfig
			if (pathStr.includes("custom")) return mockCustomConfig
			if (pathStr.includes("project") || pathStr.includes(".roo-security.yaml")) return mockProjectConfig
			return ""
		})
	})

	afterEach(() => {
		if (middleware) {
			middleware.dispose()
		}
	})

	describe("initialization", () => {
		it("should initialize with default options", async () => {
			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				debug: false,
			}

			middleware = new SecurityMiddleware(options)
			await middleware.initialize()

			const config = middleware.getConfig()
			expect(config).toBeDefined()
		})

		it("should load configurations from all tiers", async () => {
			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				globalConfigPath: "/home/user/.roo-security.yaml",
				projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
				customConfigPath: path.join(testCwd, ".roo-security-custom.yaml"),
			}

			middleware = new SecurityMiddleware(options)
			await middleware.initialize()

			const config = middleware.getConfig()
			expect(config.global).toBeDefined()
			expect(config.project).toBeDefined()
			expect(config.custom).toBeDefined()
		})

		it("should handle missing configuration files gracefully", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
			}

			middleware = new SecurityMiddleware(options)
			await expect(middleware.initialize()).resolves.not.toThrow()

			const config = middleware.getConfig()
			expect(Object.keys(config)).toHaveLength(0)
		})
	})

	describe("evaluateAccess", () => {
		beforeEach(async () => {
			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				onAskAction: mockAskHandler,
				globalConfigPath: "/home/user/.roo-security.yaml",
				projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
				customConfigPath: path.join(testCwd, ".roo-security-custom.yaml"),
			}

			middleware = new SecurityMiddleware(options)
			await middleware.initialize()
		})

		it("should block access to SSH files", async () => {
			const evaluation = await middleware.evaluateAccess(".ssh/id_rsa")

			expect(evaluation.action).toBe("BLOCK")
			expect(evaluation.matchedRule?.description).toBe("SSH keys")
			expect(evaluation.level).toBe("global")
		})

		it("should ask for approval for environment files", async () => {
			mockAskHandler.mockResolvedValue(true)

			const evaluation = await middleware.evaluateAccess(".env.production")

			expect(mockAskHandler).toHaveBeenCalled()
			expect(evaluation.action).toBe("ALLOW") // After approval
			expect(evaluation.matchedRule?.description).toBe("Environment files")
		})

		it("should deny access when ASK action is rejected", async () => {
			mockAskHandler.mockResolvedValue(false)

			const evaluation = await middleware.evaluateAccess(".env.production")

			expect(mockAskHandler).toHaveBeenCalled()
			expect(evaluation.action).toBe("BLOCK")
		})

		it("should block production config files", async () => {
			const evaluation = await middleware.evaluateAccess("config/production.yml")

			expect(evaluation.action).toBe("BLOCK")
			expect(evaluation.matchedRule?.description).toBe("Production config")
			expect(evaluation.level).toBe("project")
		})

		it("should allow test fixtures (custom override)", async () => {
			const evaluation = await middleware.evaluateAccess("test/fixtures/data.json")

			expect(evaluation.action).toBe("ALLOW")
			expect(evaluation.matchedRule?.description).toBe("Test fixtures")
			expect(evaluation.level).toBe("custom")
		})

		it("should block personal files", async () => {
			const evaluation = await middleware.evaluateAccess("docs/personal/notes.txt")

			expect(evaluation.action).toBe("BLOCK")
			expect(evaluation.matchedRule?.description).toBe("Personal files")
			expect(evaluation.level).toBe("custom")
		})

		it("should allow files not matching any rules", async () => {
			const evaluation = await middleware.evaluateAccess("src/index.ts")

			expect(evaluation.action).toBe("ALLOW")
			expect(evaluation.matchedRule).toBeUndefined()
		})

		it("should respect rule priority", async () => {
			// Custom rule (priority 200) should override project rule
			const evaluation = await middleware.evaluateAccess("test/fixtures/production.json")

			expect(evaluation.action).toBe("ALLOW")
			expect(evaluation.level).toBe("custom")
		})

		it("should handle regex patterns", async () => {
			// Create middleware with a regex pattern
			vi.mocked(fs.readFile).mockResolvedValue(`
version: '1.0'
security:
  enabled: true
  rules:
    - pattern: '/.*\\.secret\\..*/'
      action: BLOCK
      priority: 100
      description: Secret files
`)

			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
			}

			const regexMiddleware = new SecurityMiddleware(options)
			await regexMiddleware.initialize()

			const evaluation = await regexMiddleware.evaluateAccess("config.secret.json")
			expect(evaluation.action).toBe("BLOCK")

			regexMiddleware.dispose()
		})
	})

	describe("evaluateCommand", () => {
		beforeEach(async () => {
			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
			}

			middleware = new SecurityMiddleware(options)
			await middleware.initialize()
		})

		it("should block commands accessing protected files", async () => {
			const evaluation = await middleware.evaluateCommand("cat config/production.yml")

			expect(evaluation.action).toBe("BLOCK")
			expect(evaluation.message).toContain("Command blocked")
		})

		it("should allow commands not accessing files", async () => {
			const evaluation = await middleware.evaluateCommand("ls -la")

			expect(evaluation.action).toBe("ALLOW")
		})

		it("should check multiple file arguments", async () => {
			const evaluation = await middleware.evaluateCommand("cat README.md config/production.yml")

			expect(evaluation.action).toBe("BLOCK")
		})

		it("should ignore command flags", async () => {
			const evaluation = await middleware.evaluateCommand('grep -r "pattern" src/')

			expect(evaluation.action).toBe("ALLOW")
		})

		it("should handle PowerShell commands", async () => {
			const evaluation = await middleware.evaluateCommand("Get-Content config/production.yml")

			expect(evaluation.action).toBe("BLOCK")
		})
	})

	describe("statistics", () => {
		beforeEach(async () => {
			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				onAskAction: mockAskHandler,
				projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
			}

			middleware = new SecurityMiddleware(options)
			await middleware.initialize()
		})

		it("should track evaluation statistics", async () => {
			await middleware.evaluateAccess("config/production.yml") // BLOCK
			await middleware.evaluateAccess("src/index.ts") // ALLOW
			await middleware.evaluateAccess("test.key") // ASK -> ALLOW

			const stats = middleware.getStats()

			expect(stats.totalEvaluations).toBe(3)
			expect(stats.blockedCount).toBe(1)
			expect(stats.allowedCount).toBe(1)
			expect(stats.askedCount).toBe(1)
		})

		it("should reset statistics", async () => {
			await middleware.evaluateAccess("config/production.yml")
			await middleware.evaluateAccess("src/index.ts")

			middleware.resetStats()
			const stats = middleware.getStats()

			expect(stats.totalEvaluations).toBe(0)
			expect(stats.blockedCount).toBe(0)
			expect(stats.allowedCount).toBe(0)
			expect(stats.askedCount).toBe(0)
		})
	})

	describe("configuration management", () => {
		beforeEach(async () => {
			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
			}

			middleware = new SecurityMiddleware(options)
			await middleware.initialize()
		})

		it("should export configuration to YAML", async () => {
			const yamlContent = await middleware.exportConfig("project")

			expect(yamlContent).toContain('version: "1.0"')
			expect(yamlContent).toContain("security:")
			expect(yamlContent).toContain("rules:")
		})

		it("should import configuration from YAML", async () => {
			const newConfig = `
version: '1.0'
security:
  enabled: true
  rules:
    - pattern: "**/*.test"
      action: BLOCK
      priority: 100
      description: "Test files"
`

			await middleware.importConfig(newConfig, "custom")

			const config = middleware.getConfig()
			expect(config.custom?.rules).toHaveLength(1)
			expect(config.custom?.rules?.[0].pattern).toBe("**/*.test")
		})

		it("should reject invalid configuration format", async () => {
			const invalidConfig = `
invalid: true
`

			await expect(middleware.importConfig(invalidConfig, "custom")).rejects.toThrow(
				"Invalid configuration format",
			)
		})
	})

	describe("inheritance", () => {
		it("should respect inheritRules setting", async () => {
			// Mock config with inheritRules: false
			vi.mocked(fs.readFile).mockResolvedValue(`
version: '1.0'
security:
  enabled: true
  inheritRules: false
  rules:
    - pattern: "**/*.block"
      action: BLOCK
      priority: 100
`)

			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
				globalConfigPath: "/home/user/.roo-security.yaml",
			}

			middleware = new SecurityMiddleware(options)
			await middleware.initialize()

			// Should only check project rules, not global
			const evaluation = await middleware.evaluateAccess(".env")
			expect(evaluation.action).toBe("ALLOW") // Global rule not applied
		})
	})

	describe("default actions", () => {
		it("should apply default action when no rules match", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(`
version: '1.0'
security:
  enabled: true
  defaultAction: BLOCK
  rules: []
`)

			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
			}

			middleware = new SecurityMiddleware(options)
			await middleware.initialize()

			const evaluation = await middleware.evaluateAccess("any-file.txt")
			expect(evaluation.action).toBe("BLOCK")
		})
	})

	describe("file watching", () => {
		it("should set up file watchers for configuration changes", async () => {
			const mockWatcher = {
				onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
				onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
				onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
				dispose: vi.fn(),
			}

			vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(mockWatcher as any)

			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				globalConfigPath: "/home/user/.roo-security.yaml",
				projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
				customConfigPath: path.join(testCwd, ".roo-security-custom.yaml"),
			}

			middleware = new SecurityMiddleware(options)
			await middleware.initialize()

			// Should create watchers for all config files
			expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(3)
			expect(mockWatcher.onDidChange).toHaveBeenCalled()
			expect(mockWatcher.onDidCreate).toHaveBeenCalled()
			expect(mockWatcher.onDidDelete).toHaveBeenCalled()
		})
	})

	describe("disposal", () => {
		it("should clean up resources on dispose", async () => {
			const mockDisposable = { dispose: vi.fn() }
			const mockWatcher = {
				onDidChange: vi.fn(() => mockDisposable),
				onDidCreate: vi.fn(() => mockDisposable),
				onDidDelete: vi.fn(() => mockDisposable),
				dispose: vi.fn(),
			}

			vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(mockWatcher as any)

			const options: SecurityMiddlewareOptions = {
				cwd: testCwd,
				projectConfigPath: path.join(testCwd, ".roo-security.yaml"),
			}

			middleware = new SecurityMiddleware(options)
			await middleware.initialize()

			middleware.dispose()

			expect(mockDisposable.dispose).toHaveBeenCalled()
			expect(mockWatcher.dispose).toHaveBeenCalled()
		})
	})
})
