import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { RooIndexController } from "../RooIndexController"
import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
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
	RelativePattern: vi.fn((base, pattern) => ({ base, pattern })),
}))

describe("RooIndexController", () => {
	let controller: RooIndexController
	const testCwd = "/test/workspace"

	beforeEach(() => {
		vi.clearAllMocks()
		controller = new RooIndexController(testCwd)
	})

	afterEach(() => {
		controller.dispose()
	})

	describe("initialization", () => {
		it("should initialize with no content when .rooindex doesn't exist", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			await controller.initialize()

			expect(controller.rooIndexContent).toBeUndefined()
		})

		it("should load .rooindex content when file exists", async () => {
			const mockContent = "generated/\nnode_modules/\n*.min.js"
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			await controller.initialize()

			expect(controller.rooIndexContent).toBe(mockContent)
			expect(fs.readFile).toHaveBeenCalledWith(path.join(testCwd, ".rooindex"), "utf8")
		})

		it("should handle read errors gracefully", async () => {
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockRejectedValue(new Error("Read error"))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			await controller.initialize()

			expect(controller.rooIndexContent).toBeUndefined()
			expect(consoleSpy).toHaveBeenCalledWith("Unexpected error loading .rooindex:", expect.any(Error))

			consoleSpy.mockRestore()
		})
	})

	describe("shouldInclude", () => {
		it("should return false when .rooindex doesn't exist", () => {
			controller.rooIndexContent = undefined

			expect(controller.shouldInclude("generated/api.ts")).toBe(false)
			expect(controller.shouldInclude("node_modules/package/index.js")).toBe(false)
		})

		it("should match patterns from .rooindex", async () => {
			const mockContent = "generated/\n*.min.js\napi-client/**"
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			await controller.initialize()

			// These should match the patterns
			expect(controller.shouldInclude("generated/api.ts")).toBe(true)
			expect(controller.shouldInclude("generated/types.ts")).toBe(true)
			expect(controller.shouldInclude("bundle.min.js")).toBe(true)
			expect(controller.shouldInclude("api-client/index.ts")).toBe(true)
			expect(controller.shouldInclude("api-client/models/user.ts")).toBe(true)

			// These should not match
			expect(controller.shouldInclude("src/index.ts")).toBe(false)
			expect(controller.shouldInclude("test.js")).toBe(false)
		})

		it("should handle absolute paths correctly", async () => {
			const mockContent = "generated/"
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			await controller.initialize()

			// Absolute path that should match
			expect(controller.shouldInclude(path.join(testCwd, "generated/api.ts"))).toBe(true)

			// Relative path that should match
			expect(controller.shouldInclude("generated/api.ts")).toBe(true)
		})

		it("should normalize path separators for cross-platform compatibility", async () => {
			const mockContent = "generated/**/*.ts"
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			await controller.initialize()

			// Windows-style path should work
			expect(controller.shouldInclude("generated\\models\\user.ts")).toBe(true)

			// Unix-style path should work
			expect(controller.shouldInclude("generated/models/user.ts")).toBe(true)
		})
	})

	describe("filterForInclusion", () => {
		it("should return empty array when .rooindex doesn't exist", () => {
			controller.rooIndexContent = undefined
			const paths = ["generated/api.ts", "src/index.ts", "node_modules/pkg/index.js"]

			const result = controller.filterForInclusion(paths)

			expect(result).toEqual([])
		})

		it("should filter paths based on .rooindex patterns", async () => {
			const mockContent = "generated/\n*.min.js"
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			await controller.initialize()

			const paths = ["generated/api.ts", "generated/types.ts", "src/index.ts", "bundle.min.js", "test.js"]

			const result = controller.filterForInclusion(paths)

			expect(result).toEqual(["generated/api.ts", "generated/types.ts", "bundle.min.js"])
		})
	})

	describe("shouldOverrideGitignore", () => {
		it("should return false if file is not gitignored", async () => {
			const mockContent = "generated/"
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			await controller.initialize()

			expect(controller.shouldOverrideGitignore("src/index.ts", false)).toBe(false)
		})

		it("should return false if file is gitignored but not in .rooindex", async () => {
			const mockContent = "generated/"
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			await controller.initialize()

			// node_modules/pkg/index.js doesn't match "generated/" pattern
			expect(controller.shouldOverrideGitignore("node_modules/pkg/index.js", true)).toBe(false)
		})

		it("should return true if file is gitignored and matches .rooindex pattern", async () => {
			const mockContent = "generated/\nnode_modules/my-local-package/"
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			await controller.initialize()

			expect(controller.shouldOverrideGitignore("generated/api.ts", true)).toBe(true)
			expect(controller.shouldOverrideGitignore("node_modules/my-local-package/index.js", true)).toBe(true)
		})
	})

	describe("getInstructions", () => {
		it("should return undefined when .rooindex doesn't exist", () => {
			controller.rooIndexContent = undefined

			expect(controller.getInstructions()).toBeUndefined()
		})

		it("should return formatted instructions when .rooindex exists", async () => {
			const mockContent = "generated/\n*.min.js"
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(mockContent)

			await controller.initialize()

			const instructions = controller.getInstructions()

			expect(instructions).toContain("# .rooindex")
			expect(instructions).toContain(mockContent)
			expect(instructions).toContain("files that should be indexed even if they are gitignored")
		})
	})

	describe("file watching", () => {
		it("should set up file watcher on construction", () => {
			const mockWatcher = {
				onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
				onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
				onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
				dispose: vi.fn(),
			}
			vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(mockWatcher as any)

			const newController = new RooIndexController(testCwd)

			expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(
				expect.objectContaining({
					base: testCwd,
					pattern: ".rooindex",
				}),
			)
			expect(mockWatcher.onDidChange).toHaveBeenCalled()
			expect(mockWatcher.onDidCreate).toHaveBeenCalled()
			expect(mockWatcher.onDidDelete).toHaveBeenCalled()

			newController.dispose()
		})
	})

	describe("dispose", () => {
		it("should dispose all resources", () => {
			const mockDisposable = { dispose: vi.fn() }
			const mockWatcher = {
				onDidChange: vi.fn(() => mockDisposable),
				onDidCreate: vi.fn(() => mockDisposable),
				onDidDelete: vi.fn(() => mockDisposable),
				dispose: vi.fn(),
			}
			vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(mockWatcher as any)

			const newController = new RooIndexController(testCwd)
			newController.dispose()

			expect(mockDisposable.dispose).toHaveBeenCalledTimes(3) // For each event handler
			expect(mockWatcher.dispose).toHaveBeenCalled()
		})
	})
})
