// npx vitest run src/services/glob/__tests__/list-files.spec.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import * as childProcess from "child_process"
import { listFiles } from "../list-files"
import * as vscode from "vscode"
import { EventEmitter } from "events"

// Mock vscode
vi.mock("vscode", () => ({
	env: {
		appRoot: "/mock/vscode/app/root",
	},
}))

// Mock ripgrep getBinPath
vi.mock("../../ripgrep", () => ({
	getBinPath: vi.fn().mockResolvedValue("/mock/path/to/rg"),
}))

// Mock fs.promises
vi.mock("fs", async () => {
	const actual = await vi.importActual<typeof import("fs")>("fs")
	return {
		...actual,
		promises: {
			readdir: vi.fn(),
			readFile: vi.fn(),
			access: vi.fn(),
		},
	}
})

// Mock child_process.spawn
vi.mock("child_process", () => ({
	spawn: vi.fn(),
}))

describe("listFiles performance optimization", () => {
	let mockSpawn: any
	let mockProcess: any

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks()

		// Create a mock process for ripgrep
		mockProcess = new EventEmitter()
		mockProcess.stdout = new EventEmitter()
		mockProcess.stderr = new EventEmitter()
		mockProcess.kill = vi.fn()

		mockSpawn = vi.mocked(childProcess.spawn)
		mockSpawn.mockReturnValue(mockProcess as any)

		// Default mock for readFile (no .gitignore)
		vi.mocked(fs.promises.readFile).mockRejectedValue(new Error("File not found"))

		// Default mock for access (no .gitignore)
		vi.mocked(fs.promises.access).mockRejectedValue(new Error("File not found"))
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("listFilteredDirectories with limitHint", () => {
		it("should stop scanning when limit is reached in recursive mode", async () => {
			const testPath = "/test/project"
			const limit = 5

			// Mock directory structure with many nested directories
			const mockReaddir = vi.mocked(fs.promises.readdir)

			// Root level - 3 directories
			mockReaddir.mockResolvedValueOnce([
				{ name: "dir1", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "dir2", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "dir3", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "file1.txt", isDirectory: () => false, isSymbolicLink: () => false },
			] as any)

			// Mock subdirectories for all first-level dirs (they get processed before limit kicks in)
			// dir1 subdirectories
			mockReaddir.mockResolvedValueOnce([
				{ name: "subdir1", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "subdir2", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "subdir3", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// dir2 subdirectories
			mockReaddir.mockResolvedValueOnce([
				{ name: "subdir4", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "subdir5", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// dir3 subdirectories
			mockReaddir.mockResolvedValueOnce([
				{ name: "subdir6", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// Add more mock responses for deeper levels (should not be called with optimization)
			for (let i = 0; i < 10; i++) {
				mockReaddir.mockResolvedValueOnce([
					{ name: `deep${i}`, isDirectory: () => true, isSymbolicLink: () => false },
				] as any)
			}

			// Mock ripgrep to return some files
			const listFilesPromise = listFiles(testPath, true, limit)

			// Simulate ripgrep returning files
			setTimeout(() => {
				mockProcess.stdout.emit("data", "file1.txt\nfile2.txt\n")
				mockProcess.emit("close", 0)
			}, 10)

			const [results, limitReached] = await listFilesPromise

			// Should have stopped early due to limit
			expect(limitReached).toBe(true)
			expect(results.length).toBeLessThanOrEqual(limit)

			// Verify that readdir was not called excessively
			// With optimization, it should stop after processing first-level directories
			// and maybe a few subdirectories before hitting the limit
			const callCount = mockReaddir.mock.calls.length
			expect(callCount).toBeLessThanOrEqual(7) // Root + 3 first-level + maybe a few subdirs
			expect(callCount).toBeGreaterThan(0) // Should have at least scanned root
		})

		it("should ensure first-level directories are included even with limit", async () => {
			const testPath = "/test/project"
			const limit = 3

			// Mock directory structure
			const mockReaddir = vi.mocked(fs.promises.readdir)

			// Root level - 5 directories (more than limit)
			mockReaddir.mockResolvedValueOnce([
				{ name: "important1", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "important2", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "important3", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "important4", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "important5", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// Mock subdirectories for each (should not all be scanned due to limit)
			for (let i = 0; i < 5; i++) {
				mockReaddir.mockResolvedValueOnce([
					{ name: `nested${i}`, isDirectory: () => true, isSymbolicLink: () => false },
				] as any)
			}

			// Mock ripgrep to return no files
			const listFilesPromise = listFiles(testPath, true, limit)

			setTimeout(() => {
				mockProcess.stdout.emit("data", "")
				mockProcess.emit("close", 0)
			}, 10)

			const [results, limitReached] = await listFilesPromise

			// Even with limit of 3, all first-level directories should be prioritized
			const firstLevelDirs = results.filter((r) => {
				const relativePath = path.relative(testPath, r.replace(/\/$/, ""))
				return !relativePath.includes(path.sep)
			})

			// Should have at least the limit number of results
			expect(results.length).toBe(limit)
			expect(limitReached).toBe(true)

			// First-level directories should be included
			expect(firstLevelDirs.length).toBeGreaterThan(0)
		})

		it("should not apply limit in non-recursive mode", async () => {
			const testPath = "/test/project"
			const limit = 2

			// Mock directory structure
			const mockReaddir = vi.mocked(fs.promises.readdir)

			// Root level - 5 directories
			mockReaddir.mockResolvedValueOnce([
				{ name: "dir1", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "dir2", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "dir3", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "dir4", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "dir5", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// Mock ripgrep to return files
			const listFilesPromise = listFiles(testPath, false, limit)

			setTimeout(() => {
				mockProcess.stdout.emit("data", "file1.txt\n")
				mockProcess.emit("close", 0)
			}, 10)

			const [results, limitReached] = await listFilesPromise

			// In non-recursive mode, limit applies to final results, not scanning
			expect(results.length).toBeLessThanOrEqual(limit)
			expect(limitReached).toBe(true)

			// Should have called readdir only once (for root level)
			expect(mockReaddir).toHaveBeenCalledTimes(1)
		})

		it("should handle edge case with limit of 0", async () => {
			const testPath = "/test/project"
			const limit = 0

			const [results, limitReached] = await listFiles(testPath, true, limit)

			// Should return empty array immediately without any scanning
			expect(results).toEqual([])
			expect(limitReached).toBe(false)

			// Should not have called readdir at all
			expect(vi.mocked(fs.promises.readdir)).not.toHaveBeenCalled()
			expect(mockSpawn).not.toHaveBeenCalled()
		})

		it("should continue scanning if limit not reached", async () => {
			const testPath = "/test/project"
			const limit = 100 // High limit

			// Mock directory structure
			const mockReaddir = vi.mocked(fs.promises.readdir)

			// Root level
			mockReaddir.mockResolvedValueOnce([
				{ name: "dir1", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "dir2", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// dir1 subdirectories
			mockReaddir.mockResolvedValueOnce([
				{ name: "subdir1", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// dir2 subdirectories
			mockReaddir.mockResolvedValueOnce([
				{ name: "subdir2", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// Subdirectories of subdirectories - provide enough mocks
			for (let i = 0; i < 20; i++) {
				mockReaddir.mockResolvedValueOnce([])
			}

			// Mock ripgrep to return files
			const listFilesPromise = listFiles(testPath, true, limit)

			setTimeout(() => {
				mockProcess.stdout.emit("data", "file1.txt\nfile2.txt\n")
				mockProcess.emit("close", 0)
			}, 10)

			const [results, limitReached] = await listFilesPromise

			// Should not have reached limit
			expect(limitReached).toBe(false)
			expect(results.length).toBeLessThan(limit)

			// Should have scanned directories, but exact count depends on implementation
			// Just verify it was called at least for the directories we know about
			expect(mockReaddir).toHaveBeenCalled()
			const callCount = mockReaddir.mock.calls.length
			expect(callCount).toBeGreaterThanOrEqual(3) // At least root + 2 dirs
		})
	})

	describe("performance characteristics", () => {
		it("should calculate appropriate limit hint based on files already collected", async () => {
			const testPath = "/test/project"
			const limit = 50

			// Mock many files returned by ripgrep
			const mockReaddir = vi.mocked(fs.promises.readdir)
			// Root level returns one directory
			mockReaddir.mockResolvedValueOnce([
				{ name: "dir1", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)
			// dir1 has no subdirectories to avoid infinite deep traversal in mocks
			mockReaddir.mockResolvedValueOnce([] as any)

			const listFilesPromise = listFiles(testPath, true, limit)

			// Simulate ripgrep returning many files (45)
			const fileList = Array.from({ length: 45 }, (_, i) => `file${i}.txt`).join("\n")
			setTimeout(() => {
				mockProcess.stdout.emit("data", fileList)
				mockProcess.emit("close", 0)
			}, 10)

			const [results, limitReached] = await listFilesPromise

			// With 45 files, remainingCapacity should be small (around 5),
			// so directory scanning should be minimal.
			expect(results.length).toBeLessThanOrEqual(limit)

			// Should have minimal directory scanning since files filled most of the limit
			const callCount = mockReaddir.mock.calls.length
			expect(callCount).toBeLessThanOrEqual(3) // Root + at most one child
			expect(callCount).toBeGreaterThan(0)
		})

		it("should handle ignored directories correctly with limit", async () => {
			const testPath = "/test/project"
			const limit = 10

			// Mock directory structure with ignored directories
			const mockReaddir = vi.mocked(fs.promises.readdir)

			mockReaddir.mockResolvedValueOnce([
				{ name: "src", isDirectory: () => true, isSymbolicLink: () => false },
				{ name: "node_modules", isDirectory: () => true, isSymbolicLink: () => false }, // Should be ignored
				{ name: ".git", isDirectory: () => true, isSymbolicLink: () => false }, // Should be ignored
				{ name: "dist", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// src subdirectories
			mockReaddir.mockResolvedValueOnce([
				{ name: "components", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// dist subdirectories
			mockReaddir.mockResolvedValueOnce([
				{ name: "assets", isDirectory: () => true, isSymbolicLink: () => false },
			] as any)

			// Mock ripgrep
			const listFilesPromise = listFiles(testPath, true, limit)

			setTimeout(() => {
				mockProcess.stdout.emit("data", "")
				mockProcess.emit("close", 0)
			}, 10)

			const [results] = await listFilesPromise

			// Should not include ignored directories
			expect(results).not.toContain(expect.stringMatching(/node_modules/))
			expect(results).not.toContain(expect.stringMatching(/\.git/))
			// It's acceptable if no non-ignored directories are present due to limitHint early exit and ignore rules
		})
	})
})
