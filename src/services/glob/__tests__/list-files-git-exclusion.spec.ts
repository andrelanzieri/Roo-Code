// npx vitest src/services/glob/__tests__/list-files-git-exclusion.spec.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as childProcess from "child_process"
import * as path from "path"
import * as os from "os"
import * as fs from "fs"
import { listFiles } from "../list-files"

// Mock child_process module
vi.mock("child_process", () => ({
	spawn: vi.fn(),
}))

// Mock dependencies
vi.mock("../../ripgrep", () => ({
	getBinPath: vi.fn(async () => "/usr/bin/rg"),
}))

vi.mock("vscode", () => ({
	env: {
		appRoot: "/test/app/root",
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(() => undefined),
		})),
	},
}))

describe("list-files .git exclusion", () => {
	let tempDir: string
	let originalCwd: string

	beforeEach(async () => {
		// Create a temporary directory for testing
		tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "roo-git-exclusion-test-"))
		originalCwd = process.cwd()

		// Mock fs.promises.access to simulate files exist
		vi.spyOn(fs.promises, "access").mockResolvedValue(undefined)
		vi.spyOn(fs.promises, "readdir").mockImplementation(async () => [])
	})

	afterEach(async () => {
		// Clean up temporary directory
		await fs.promises.rm(tempDir, { recursive: true, force: true })
		vi.restoreAllMocks()
	})

	it("should always exclude .git directories in recursive mode", async () => {
		// Mock ripgrep spawn
		const mockSpawn = vi.mocked(childProcess.spawn)
		mockSpawn.mockImplementation((command: string, args: readonly string[]) => {
			const mockProcess = {
				stdout: {
					on: (event: string, callback: (data: any) => void) => {
						if (event === "data") {
							// Simulate ripgrep output
							setTimeout(() => callback(`${path.join(tempDir, "src", "index.ts")}\n`), 10)
						}
					},
				},
				stderr: {
					on: vi.fn(),
				},
				on: (event: string, callback: (code: number | null) => void) => {
					if (event === "close") {
						setTimeout(() => callback(0), 20)
					}
				},
				kill: vi.fn(),
			} as any
			return mockProcess
		})

		// Call listFiles in recursive mode
		const [files, limitReached] = await listFiles(tempDir, true, 100)

		// Verify ripgrep was called with the .git exclusion pattern
		expect(mockSpawn).toHaveBeenCalled()
		const [rgPath, args] = mockSpawn.mock.calls[0]

		// Check that the arguments include the .git exclusion pattern
		expect(args).toContain("-g")
		expect(args).toContain("!**/.git/**")
	})

	it("should exclude .git directories even when explicitly targeting a hidden directory", async () => {
		// Create a hidden directory path
		const hiddenDirPath = path.join(tempDir, ".hidden-dir")

		// Mock ripgrep spawn
		const mockSpawn = vi.mocked(childProcess.spawn)
		mockSpawn.mockImplementation((command: string, args: readonly string[]) => {
			const mockProcess = {
				stdout: {
					on: (event: string, callback: (data: any) => void) => {
						if (event === "data") {
							// Simulate ripgrep output
							setTimeout(() => callback(`${path.join(hiddenDirPath, "file.ts")}\n`), 10)
						}
					},
				},
				stderr: {
					on: vi.fn(),
				},
				on: (event: string, callback: (code: number | null) => void) => {
					if (event === "close") {
						setTimeout(() => callback(0), 20)
					}
				},
				kill: vi.fn(),
			} as any
			return mockProcess
		})

		// Call listFiles targeting a hidden directory
		const [files, limitReached] = await listFiles(hiddenDirPath, true, 100)

		// Verify ripgrep was called with the .git exclusion pattern
		expect(mockSpawn).toHaveBeenCalled()
		const [rgPath, args] = mockSpawn.mock.calls[0]

		// Even when targeting a hidden directory, .git should still be excluded
		expect(args).toContain("-g")
		expect(args).toContain("!**/.git/**")

		// But the command should have the special flags for hidden directories
		expect(args).toContain("--no-ignore-vcs")
		expect(args).toContain("--no-ignore")
	})

	it("should exclude .git directories in non-recursive mode", async () => {
		// Mock ripgrep spawn
		const mockSpawn = vi.mocked(childProcess.spawn)
		mockSpawn.mockImplementation((command: string, args: readonly string[]) => {
			const mockProcess = {
				stdout: {
					on: (event: string, callback: (data: any) => void) => {
						if (event === "data") {
							// Simulate ripgrep output for non-recursive
							setTimeout(() => callback(`${path.join(tempDir, "file.ts")}\n`), 10)
						}
					},
				},
				stderr: {
					on: vi.fn(),
				},
				on: (event: string, callback: (code: number | null) => void) => {
					if (event === "close") {
						setTimeout(() => callback(0), 20)
					}
				},
				kill: vi.fn(),
			} as any
			return mockProcess
		})

		// Call listFiles in non-recursive mode
		const [files, limitReached] = await listFiles(tempDir, false, 100)

		// Verify ripgrep was called with the .git exclusion patterns
		expect(mockSpawn).toHaveBeenCalled()
		const [rgPath, args] = mockSpawn.mock.calls[0]

		// Check that the arguments include the .git exclusion patterns for non-recursive mode
		expect(args).toContain("-g")
		expect(args).toContain("!.git")
		expect(args).toContain("!.git/**")
	})

	it("should exclude .git even when it's the target directory", async () => {
		// Create a .git directory path
		const gitDirPath = path.join(tempDir, ".git")

		// Mock ripgrep spawn
		const mockSpawn = vi.mocked(childProcess.spawn)
		mockSpawn.mockImplementation((command: string, args: readonly string[]) => {
			const mockProcess = {
				stdout: {
					on: (event: string, callback: (data: any) => void) => {
						if (event === "data") {
							// Simulate empty output (no files found)
							setTimeout(() => callback(""), 10)
						}
					},
				},
				stderr: {
					on: vi.fn(),
				},
				on: (event: string, callback: (code: number | null) => void) => {
					if (event === "close") {
						setTimeout(() => callback(0), 20)
					}
				},
				kill: vi.fn(),
			} as any
			return mockProcess
		})

		// Call listFiles targeting .git directory
		const [files, limitReached] = await listFiles(gitDirPath, true, 100)

		// Verify ripgrep was called with the .git exclusion pattern
		expect(mockSpawn).toHaveBeenCalled()
		const [rgPath, args] = mockSpawn.mock.calls[0]

		// .git should still be excluded even when it's the target
		expect(args).toContain("-g")
		expect(args).toContain("!**/.git/**")
	})
})
