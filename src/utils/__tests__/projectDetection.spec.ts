import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { isSwiftProject, getProjectFileLimit } from "../projectDetection"

vi.mock("fs", () => ({
	promises: {
		readdir: vi.fn(),
		stat: vi.fn(),
	},
}))

describe("projectDetection", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("isSwiftProject", () => {
		it("should detect Swift project with Package.swift", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue(["Package.swift", "Sources", "Tests"] as any)

			const result = await isSwiftProject("/test/project")
			expect(result).toBe(true)
		})

		it("should detect Swift project with .xcodeproj", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue(["MyApp.xcodeproj", "MyApp", "MyAppTests"] as any)

			const result = await isSwiftProject("/test/project")
			expect(result).toBe(true)
		})

		it("should detect Swift project with .xcworkspace", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue(["MyApp.xcworkspace", "MyApp.xcodeproj", "Pods"] as any)

			const result = await isSwiftProject("/test/project")
			expect(result).toBe(true)
		})

		it("should detect Swift project with Podfile", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue(["Podfile", "Podfile.lock", "MyApp"] as any)

			const result = await isSwiftProject("/test/project")
			expect(result).toBe(true)
		})

		it("should detect Swift project with Cartfile", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue(["Cartfile", "Cartfile.resolved", "MyApp"] as any)

			const result = await isSwiftProject("/test/project")
			expect(result).toBe(true)
		})

		it("should detect Swift project with .swift files in root", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue(["main.swift", "AppDelegate.swift", "README.md"] as any)

			const result = await isSwiftProject("/test/project")
			expect(result).toBe(true)
		})

		it("should detect Swift project with Sources directory containing Swift files", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValueOnce(["Sources", "Tests", "README.md"] as any)

			vi.mocked(fs.promises.stat).mockResolvedValue({
				isDirectory: () => true,
			} as any)

			vi.mocked(fs.promises.readdir).mockResolvedValueOnce(["App.swift", "Model.swift"] as any)

			const result = await isSwiftProject("/test/project")
			expect(result).toBe(true)
		})

		it("should not detect non-Swift project", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue([
				"package.json",
				"node_modules",
				"src",
				"README.md",
			] as any)

			const result = await isSwiftProject("/test/project")
			expect(result).toBe(false)
		})

		it("should handle errors gracefully", async () => {
			vi.mocked(fs.promises.readdir).mockRejectedValue(new Error("Permission denied"))

			const result = await isSwiftProject("/test/project")
			expect(result).toBe(false)
		})
	})

	describe("getProjectFileLimit", () => {
		it("should return reduced limit for Swift projects", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue(["Package.swift", "Sources"] as any)

			const result = await getProjectFileLimit("/test/project", 200)
			expect(result).toBe(100)
		})

		it("should return reduced limit not exceeding 100 for Swift projects", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue(["MyApp.xcodeproj"] as any)

			const result = await getProjectFileLimit("/test/project", 500)
			expect(result).toBe(100)
		})

		it("should return default limit for non-Swift projects", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue(["package.json", "src"] as any)

			const result = await getProjectFileLimit("/test/project", 200)
			expect(result).toBe(200)
		})

		it("should return smaller default if it's less than 100 for Swift projects", async () => {
			vi.mocked(fs.promises.readdir).mockResolvedValue(["Package.swift"] as any)

			const result = await getProjectFileLimit("/test/project", 50)
			expect(result).toBe(50)
		})
	})
})
