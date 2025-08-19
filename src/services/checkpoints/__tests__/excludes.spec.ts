// npx vitest services/checkpoints/__tests__/excludes.spec.ts

import { join } from "path"
import fs from "fs/promises"
import { fileExistsAtPath } from "../../../utils/fs"
import { getExcludePatterns, getExcludePatternsWithStats } from "../excludes"
import { executeRipgrep } from "../../search/file-search"

// Mock fs/promises
vi.mock("fs/promises", () => ({
	default: {
		readFile: vi.fn(),
		stat: vi.fn(),
	},
}))

// Mock fileExistsAtPath
vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn(),
}))

// Mock executeRipgrep
vi.mock("../../search/file-search", () => ({
	executeRipgrep: vi.fn(),
	executeRipgrepForFiles: vi.fn(),
}))

describe("getExcludePatterns", () => {
	const testWorkspacePath = "/test/workspace"

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("getLfsPatterns", () => {
		it("should include LFS patterns from .gitattributes when they exist", async () => {
			// Mock .gitattributes file exists
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)

			// Mock .gitattributes file content with LFS patterns
			const gitAttributesContent = `*.psd filter=lfs diff=lfs merge=lfs -text
*.zip filter=lfs diff=lfs merge=lfs -text
# A comment line
*.mp4 filter=lfs diff=lfs merge=lfs -text
readme.md text
`
			vi.mocked(fs.readFile).mockResolvedValue(gitAttributesContent)

			// Expected LFS patterns
			const expectedLfsPatterns = ["*.psd", "*.zip", "*.mp4"]

			// Get exclude patterns
			const excludePatterns = await getExcludePatterns(testWorkspacePath)

			// Verify .gitattributes was checked at the correct path
			expect(fileExistsAtPath).toHaveBeenCalledWith(join(testWorkspacePath, ".gitattributes"))

			// Verify file was read
			expect(fs.readFile).toHaveBeenCalledWith(join(testWorkspacePath, ".gitattributes"), "utf8")

			// Verify LFS patterns are included in result
			expectedLfsPatterns.forEach((pattern) => {
				expect(excludePatterns).toContain(pattern)
			})

			// Verify all normal patterns also exist
			expect(excludePatterns).toContain(".git/")
		})

		it("should handle .gitattributes with no LFS patterns", async () => {
			// Mock .gitattributes file exists
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)

			// Mock .gitattributes file content with no LFS patterns
			const gitAttributesContent = `*.md text
*.txt text
*.js text eol=lf
`
			vi.mocked(fs.readFile).mockResolvedValue(gitAttributesContent)

			// Get exclude patterns
			const excludePatterns = await getExcludePatterns(testWorkspacePath)

			// Verify .gitattributes was checked
			expect(fileExistsAtPath).toHaveBeenCalledWith(join(testWorkspacePath, ".gitattributes"))

			// Verify file was read
			expect(fs.readFile).toHaveBeenCalledWith(join(testWorkspacePath, ".gitattributes"), "utf8")

			// Verify LFS patterns are not included
			// Just ensure no lines from our mock gitAttributes are in the result
			const gitAttributesLines = gitAttributesContent.split("\n").map((line) => line.split(" ")[0].trim())

			gitAttributesLines.forEach((line) => {
				if (line && !line.startsWith("#")) {
					expect(excludePatterns.includes(line)).toBe(false)
				}
			})

			// Verify default patterns are included
			expect(excludePatterns).toContain(".git/")
		})

		it("should handle missing .gitattributes file", async () => {
			// Mock .gitattributes file doesn't exist
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			// Get exclude patterns
			const excludePatterns = await getExcludePatterns(testWorkspacePath)

			// Verify .gitattributes was checked
			expect(fileExistsAtPath).toHaveBeenCalledWith(join(testWorkspacePath, ".gitattributes"))

			// Verify file was not read
			expect(fs.readFile).not.toHaveBeenCalled()

			// Verify standard patterns are included
			expect(excludePatterns).toContain(".git/")

			// Verify we have standard patterns but no LFS patterns
			// Check for a few known patterns from different categories
			expect(excludePatterns).toContain("node_modules/") // buildArtifact
			expect(excludePatterns).toContain("*.jpg") // media
			expect(excludePatterns).toContain("*.tmp") // cache
			expect(excludePatterns).toContain("*.env*") // config
			expect(excludePatterns).toContain("*.zip") // large data
			expect(excludePatterns).toContain("*.db") // database
			expect(excludePatterns).toContain("*.shp") // geospatial
			expect(excludePatterns).toContain("*.log") // log
		})

		it("should handle errors when reading .gitattributes", async () => {
			// Mock .gitattributes file exists
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)

			// Mock readFile to throw error
			vi.mocked(fs.readFile).mockRejectedValue(new Error("File read error"))

			// Get exclude patterns
			const excludePatterns = await getExcludePatterns(testWorkspacePath)

			// Verify .gitattributes was checked
			expect(fileExistsAtPath).toHaveBeenCalledWith(join(testWorkspacePath, ".gitattributes"))

			// Verify file read was attempted
			expect(fs.readFile).toHaveBeenCalledWith(join(testWorkspacePath, ".gitattributes"), "utf8")

			// Verify standard patterns are included
			expect(excludePatterns).toContain(".git/")

			// Verify we have standard patterns but no LFS patterns
			// Check for a few known patterns from different categories
			expect(excludePatterns).toContain("node_modules/") // buildArtifact
			expect(excludePatterns).toContain("*.jpg") // media
			expect(excludePatterns).toContain("*.tmp") // cache
			expect(excludePatterns).toContain("*.env*") // config
			expect(excludePatterns).toContain("*.zip") // large data
			expect(excludePatterns).toContain("*.db") // database
			expect(excludePatterns).toContain("*.shp") // geospatial
			expect(excludePatterns).toContain("*.log") // log
		})
	})

	describe("getLargeFileAutoExcludePatterns with LFS pre-filtering", () => {
		it("should pre-filter git-lfs patterns when scanning for large files", async () => {
			// Mock .gitattributes file exists with LFS patterns
			vi.mocked(fileExistsAtPath).mockResolvedValue(true)
			const gitAttributesContent = `*.psd filter=lfs diff=lfs merge=lfs -text
*.zip filter=lfs diff=lfs merge=lfs -text
*.mp4 filter=lfs diff=lfs merge=lfs -text
`
			vi.mocked(fs.readFile).mockResolvedValue(gitAttributesContent)

			// Mock executeRipgrep to return some files
			vi.mocked(executeRipgrep).mockResolvedValue([
				{ path: "file1.txt", type: "file", label: "file1.txt" },
				{ path: "large.bin", type: "file", label: "large.bin" },
				{ path: "code.js", type: "file", label: "code.js" },
			])

			// Mock file stats
			vi.mocked(fs.stat).mockImplementation(async (path) => {
				const pathStr = path.toString()
				if (pathStr.includes("large.bin")) {
					return { size: 20 * 1024 * 1024 } as any // 20MB
				}
				return { size: 1024 } as any // 1KB
			})

			// Get exclude patterns with stats
			const result = await getExcludePatternsWithStats(testWorkspacePath)

			// Verify executeRipgrep was called with LFS patterns as exclusions
			expect(executeRipgrep).toHaveBeenCalledWith(
				expect.objectContaining({
					args: expect.arrayContaining(["-g", "!*.psd", "-g", "!*.zip", "-g", "!*.mp4"]),
					workspacePath: testWorkspacePath,
				}),
			)

			// Verify large.bin was detected and included
			expect(result.stats.largeFilesExcluded).toBe(1)
			expect(result.stats.sample).toContain("large.bin")
		})

		it("should handle empty LFS patterns gracefully", async () => {
			// Mock no .gitattributes file
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			// Mock executeRipgrep to return some files
			vi.mocked(executeRipgrep).mockResolvedValue([
				{ path: "file1.txt", type: "file", label: "file1.txt" },
				{ path: "large.bin", type: "file", label: "large.bin" },
			])

			// Mock file stats
			vi.mocked(fs.stat).mockImplementation(async (path) => {
				const pathStr = path.toString()
				if (pathStr.includes("large.bin")) {
					return { size: 20 * 1024 * 1024 } as any // 20MB
				}
				return { size: 1024 } as any // 1KB
			})

			// Get exclude patterns with stats
			const result = await getExcludePatternsWithStats(testWorkspacePath)

			// Verify executeRipgrep was called without LFS patterns
			expect(executeRipgrep).toHaveBeenCalledWith(
				expect.objectContaining({
					args: expect.not.arrayContaining(["-g", "!*.psd", "-g", "!*.zip", "-g", "!*.mp4"]),
					workspacePath: testWorkspacePath,
				}),
			)

			// Verify large file was still detected
			expect(result.stats.largeFilesExcluded).toBe(1)
			expect(result.stats.sample).toContain("large.bin")
		})

		it("should not exclude code files even if they are large", async () => {
			// Mock no .gitattributes file
			vi.mocked(fileExistsAtPath).mockResolvedValue(false)

			// Mock executeRipgrep to return some files including large code files
			vi.mocked(executeRipgrep).mockResolvedValue([
				{ path: "huge.js", type: "file", label: "huge.js" },
				{ path: "large.bin", type: "file", label: "large.bin" },
				{ path: "big.ts", type: "file", label: "big.ts" },
			])

			// Mock file stats - all files are large
			vi.mocked(fs.stat).mockImplementation(async () => {
				return { size: 20 * 1024 * 1024 } as any // 20MB
			})

			// Get exclude patterns with stats
			const result = await getExcludePatternsWithStats(testWorkspacePath)

			// Verify only non-code file was excluded
			expect(result.stats.largeFilesExcluded).toBe(1)
			expect(result.stats.sample).toContain("large.bin")
			expect(result.stats.sample).not.toContain("huge.js")
			expect(result.stats.sample).not.toContain("big.ts")
		})
	})
})
