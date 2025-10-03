// npx vitest core/ignore/__tests__/GitIgnoreController.spec.ts

import type { Mock } from "vitest"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import path from "path"
import * as vscode from "vscode"
import { GitIgnoreController } from "../GitIgnoreController"
import { fileExistsAtPath } from "../../../utils/fs"
import * as fs from "fs/promises"
import * as fsSync from "fs"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("fs")
vi.mock("../../../utils/fs")

// Mock vscode
vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }

	return {
		workspace: {
			createFileSystemWatcher: vi.fn(() => ({
				onDidCreate: vi.fn(() => mockDisposable),
				onDidChange: vi.fn(() => mockDisposable),
				onDidDelete: vi.fn(() => mockDisposable),
				dispose: vi.fn(),
			})),
		},
		RelativePattern: vi.fn().mockImplementation((base, pattern) => ({
			base,
			pattern,
		})),
	}
})

describe("GitIgnoreController", () => {
	const TEST_CWD = "/test/path"
	let controller: GitIgnoreController
	let mockFileExists: Mock<typeof fileExistsAtPath>
	let mockReadFile: Mock<typeof fs.readFile>
	let mockWatcher: any

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks()

		// Setup mock file watcher
		mockWatcher = {
			onDidCreate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			onDidDelete: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			dispose: vi.fn(),
		}

		// @ts-expect-error - Mocking
		vscode.workspace.createFileSystemWatcher.mockReturnValue(mockWatcher)

		// Setup fs mocks (exactly like RooIgnoreController)
		mockFileExists = fileExistsAtPath as Mock<typeof fileExistsAtPath>
		mockReadFile = fs.readFile as Mock<typeof fs.readFile>

		// Setup fsSync mocks with default behavior (return path as-is, like regular files)
		const mockRealpathSync = vi.mocked(fsSync.realpathSync)
		mockRealpathSync.mockImplementation((filePath: any) => filePath.toString())

		// Create controller
		controller = new GitIgnoreController(TEST_CWD)
	})

	afterEach(() => {
		if (controller) {
			controller.dispose()
		}
	})

	describe("initialization", () => {
		it("should initialize without .gitignore files", async () => {
			// Setup mocks to simulate no .gitignore files
			mockFileExists.mockResolvedValue(false)

			await controller.initialize()

			// Should allow all access when no .gitignore files exist
			expect(controller.validateAccess("any/file.ts")).toBe(true)
			expect(controller.hasGitignoreFiles()).toBe(false)
		})

		it("should discover and load root .gitignore file", async () => {
			// Setup mocks to simulate root .gitignore file
			mockFileExists.mockImplementation((filePath: string) => {
				return Promise.resolve(filePath === path.join(TEST_CWD, ".gitignore"))
			})
			mockReadFile.mockResolvedValue("node_modules/\n*.log\n")

			await controller.initialize()

			// Verify file was discovered
			expect(controller.hasGitignoreFiles()).toBe(true)
			expect(controller.getGitignoreFiles()).toContain(path.join(TEST_CWD, ".gitignore"))

			// Verify patterns are applied
			expect(controller.validateAccess("node_modules/package.json")).toBe(false)
			expect(controller.validateAccess("debug.log")).toBe(false)
			expect(controller.validateAccess("src/index.ts")).toBe(true)
		})
	})

	describe("validateAccess", () => {
		beforeEach(async () => {
			// Setup a basic .gitignore for testing
			mockFileExists.mockImplementation((filePath: string) => {
				return Promise.resolve(filePath === path.join(TEST_CWD, ".gitignore"))
			})
			mockReadFile.mockResolvedValue("node_modules/\n*.log\n/build\n")

			await controller.initialize()
		})

		it("should block files matching .gitignore patterns", () => {
			expect(controller.validateAccess("node_modules/package.json")).toBe(false)
			expect(controller.validateAccess("debug.log")).toBe(false)
			expect(controller.validateAccess("build")).toBe(false)
		})

		it("should allow files not matching .gitignore patterns", () => {
			expect(controller.validateAccess("src/index.ts")).toBe(true)
			expect(controller.validateAccess("README.md")).toBe(true)
			expect(controller.validateAccess("package.json")).toBe(true)
		})

		it("should allow all access when no .gitignore files exist", async () => {
			// Create a new controller with no .gitignore
			mockFileExists.mockResolvedValue(false)
			const emptyController = new GitIgnoreController(TEST_CWD)
			await emptyController.initialize()

			expect(emptyController.validateAccess("node_modules/package.json")).toBe(true)
			expect(emptyController.validateAccess("debug.log")).toBe(true)
			expect(emptyController.validateAccess("any/file.ts")).toBe(true)

			emptyController.dispose()
		})

		it("should discover and load nested .gitignore files", async () => {
			// Setup mocks to simulate both root and nested .gitignore files
			mockFileExists.mockImplementation((filePath: string) => {
				return Promise.resolve(
					filePath === path.join(TEST_CWD, ".gitignore") ||
						filePath === path.join(TEST_CWD, "src", ".gitignore"),
				)
			})

			// Mock different content for each file
			mockReadFile.mockImplementation((filePath: any) => {
				// Normalize path separators for cross-platform compatibility
				const normalizedPath = filePath.toString().replace(/\\/g, "/")
				if (normalizedPath.endsWith("src/.gitignore")) {
					return Promise.resolve("*.tmp\n")
				}
				return Promise.resolve("node_modules/\n*.log\n")
			})

			await controller.initialize()

			// Verify both files were discovered
			expect(controller.hasGitignoreFiles()).toBe(true)
			const gitignoreFiles = controller.getGitignoreFiles()
			expect(gitignoreFiles).toContain(path.join(TEST_CWD, ".gitignore"))
			expect(gitignoreFiles).toContain(path.join(TEST_CWD, "src", ".gitignore"))

			// Verify patterns from both files are applied
			expect(controller.validateAccess("node_modules/package.json")).toBe(false) // Root .gitignore
			expect(controller.validateAccess("debug.log")).toBe(false) // Root .gitignore
			expect(controller.validateAccess("src/temp.tmp")).toBe(false) // Nested .gitignore
			expect(controller.validateAccess("src/index.ts")).toBe(true) // Should be allowed
		})

		it("should filter deeply nested files from nested .gitignore patterns", async () => {
			// Setup mocks to simulate nested .gitignore file
			mockFileExists.mockImplementation((filePath: string) => {
				return Promise.resolve(
					filePath === path.join(TEST_CWD, ".gitignore") ||
						filePath === path.join(TEST_CWD, "src", ".gitignore"),
				)
			})

			// Mock different content for each file
			mockReadFile.mockImplementation((filePath: any) => {
				// Normalize path separators for cross-platform compatibility
				const normalizedPath = filePath.toString().replace(/\\/g, "/")
				if (normalizedPath.endsWith("src/.gitignore")) {
					// Pattern that should match files at any depth within src/
					return Promise.resolve("*.tmp\n*.cache\n")
				}
				return Promise.resolve("node_modules/\n")
			})

			await controller.initialize()

			// Test direct children of src/
			expect(controller.validateAccess("src/temp.tmp")).toBe(false)
			expect(controller.validateAccess("src/data.cache")).toBe(false)

			// Test deeply nested files (2 levels deep)
			expect(controller.validateAccess("src/utils/temp.tmp")).toBe(false)
			expect(controller.validateAccess("src/components/data.cache")).toBe(false)

			// Test very deeply nested files (3+ levels deep)
			expect(controller.validateAccess("src/utils/helpers/temp.tmp")).toBe(false)
			expect(controller.validateAccess("src/components/ui/buttons/data.cache")).toBe(false)

			// Test that non-matching files are allowed at all depths
			expect(controller.validateAccess("src/index.ts")).toBe(true)
			expect(controller.validateAccess("src/utils/helper.ts")).toBe(true)
			expect(controller.validateAccess("src/components/ui/Button.tsx")).toBe(true)

			// Test that patterns don't leak outside src/
			expect(controller.validateAccess("temp.tmp")).toBe(true)
			expect(controller.validateAccess("lib/temp.tmp")).toBe(true)
			expect(controller.validateAccess("test/data.cache")).toBe(true)
		})
	})

	describe("filterPaths", () => {
		beforeEach(async () => {
			// Setup .gitignore patterns
			mockFileExists.mockImplementation((filePath: string) => {
				return Promise.resolve(filePath === path.join(TEST_CWD, ".gitignore"))
			})
			mockReadFile.mockResolvedValue("*.log\nnode_modules/\n")

			await controller.initialize()
		})

		it("should filter out ignored paths", () => {
			const paths = ["src/index.ts", "debug.log", "node_modules/package.json", "README.md", "error.log"]

			const filtered = controller.filterPaths(paths)

			expect(filtered).toEqual(["src/index.ts", "README.md"])
		})

		it("should return all paths when no .gitignore exists", async () => {
			// Create controller with no .gitignore
			mockFileExists.mockResolvedValue(false)
			const emptyController = new GitIgnoreController(TEST_CWD)
			await emptyController.initialize()

			const paths = ["src/index.ts", "debug.log", "node_modules/package.json"]
			const filtered = emptyController.filterPaths(paths)

			expect(filtered).toEqual(paths)

			emptyController.dispose()
		})
	})

	describe("utility methods", () => {
		it("should return gitignore file paths", async () => {
			mockFileExists.mockImplementation((filePath: string) => {
				return Promise.resolve(filePath === path.join(TEST_CWD, ".gitignore"))
			})
			mockReadFile.mockResolvedValue("*.log\n")

			await controller.initialize()

			const files = controller.getGitignoreFiles()
			expect(files).toContain(path.join(TEST_CWD, ".gitignore"))
		})

		it("should return gitignore content", async () => {
			const content = "*.log\nnode_modules/\n"
			mockFileExists.mockImplementation((filePath: string) => {
				return Promise.resolve(filePath === path.join(TEST_CWD, ".gitignore"))
			})
			mockReadFile.mockResolvedValue(content)

			await controller.initialize()

			const gitignoreFile = path.join(TEST_CWD, ".gitignore")
			expect(controller.getGitignoreContent(gitignoreFile)).toBe(content)
		})
	})
})
