// npx vitest utils/__tests__/path.spec.ts

import os from "os"
import * as path from "path"

import {
	arePathsEqual,
	getReadablePath,
	getWorkspacePath,
	getAllWorkspacePaths,
	getWorkspaceFolderForPath,
} from "../path"

// Mock modules
const mockWorkspaceFolders = vi.fn()
const mockGetWorkspaceFolder = vi.fn()
const mockActiveTextEditor = vi.fn()

vi.mock("vscode", () => ({
	window: {
		get activeTextEditor() {
			return mockActiveTextEditor()
		},
	},
	workspace: {
		get workspaceFolders() {
			return mockWorkspaceFolders()
		},
		getWorkspaceFolder: mockGetWorkspaceFolder,
	},
}))
describe("Path Utilities", () => {
	const originalPlatform = process.platform
	// Helper to mock VS Code configuration

	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks()

		// Set default mock values
		mockWorkspaceFolders.mockReturnValue([
			{
				uri: { fsPath: "/test/workspace" },
				name: "test",
				index: 0,
			},
		])

		mockActiveTextEditor.mockReturnValue({
			document: {
				uri: { fsPath: "/test/workspaceFolder/file.ts" },
			},
		})

		mockGetWorkspaceFolder.mockReturnValue({
			uri: {
				fsPath: "/test/workspaceFolder",
			},
		})
	})

	afterEach(() => {
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
		})
	})

	describe("String.prototype.toPosix", () => {
		it("should convert backslashes to forward slashes", () => {
			const windowsPath = "C:\\Users\\test\\file.txt"
			expect(windowsPath.toPosix()).toBe("C:/Users/test/file.txt")
		})

		it("should not modify paths with forward slashes", () => {
			const unixPath = "/home/user/file.txt"
			expect(unixPath.toPosix()).toBe("/home/user/file.txt")
		})

		it("should preserve extended-length Windows paths", () => {
			const extendedPath = "\\\\?\\C:\\Very\\Long\\Path"
			expect(extendedPath.toPosix()).toBe("\\\\?\\C:\\Very\\Long\\Path")
		})
	})

	describe("getWorkspacePath", () => {
		it("should return the workspace folder of the active editor", () => {
			mockActiveTextEditor.mockReturnValue({
				document: {
					uri: { fsPath: "/test/workspaceFolder/file.ts" },
				},
			})
			mockGetWorkspaceFolder.mockReturnValue({
				uri: { fsPath: "/test/workspaceFolder" },
			})
			mockWorkspaceFolders.mockReturnValue([{ uri: { fsPath: "/test/workspace" }, name: "workspace", index: 0 }])

			expect(getWorkspacePath()).toBe("/test/workspaceFolder")
		})

		it("should return the first workspace folder when no active editor", () => {
			mockActiveTextEditor.mockReturnValue(undefined)
			mockGetWorkspaceFolder.mockReturnValue(undefined)
			mockWorkspaceFolders.mockReturnValue([
				{ uri: { fsPath: "/test/workspace1" }, name: "workspace1", index: 0 },
				{ uri: { fsPath: "/test/workspace2" }, name: "workspace2", index: 1 },
			])

			expect(getWorkspacePath()).toBe("/test/workspace1")
		})

		it("should return default path when no workspace folders", () => {
			mockActiveTextEditor.mockReturnValue(undefined)
			mockGetWorkspaceFolder.mockReturnValue(undefined)
			mockWorkspaceFolders.mockReturnValue(undefined)

			expect(getWorkspacePath("/default/path")).toBe("/default/path")
		})

		it("should handle multi-root workspaces correctly", () => {
			mockWorkspaceFolders.mockReturnValue([
				{ uri: { fsPath: "/test/frontend" }, name: "frontend", index: 0 },
				{ uri: { fsPath: "/test/backend" }, name: "backend", index: 1 },
			])

			// When active editor is in backend folder
			mockActiveTextEditor.mockReturnValue({
				document: { uri: { fsPath: "/test/backend/src/app.ts" } },
			})
			mockGetWorkspaceFolder.mockReturnValue({
				uri: { fsPath: "/test/backend" },
			})

			expect(getWorkspacePath()).toBe("/test/backend")
		})
	})

	describe("getAllWorkspacePaths", () => {
		it("should return all workspace folder paths", () => {
			mockWorkspaceFolders.mockReturnValue([
				{ uri: { fsPath: "/test/frontend" }, name: "frontend", index: 0 },
				{ uri: { fsPath: "/test/backend" }, name: "backend", index: 1 },
			])

			const paths = getAllWorkspacePaths()
			expect(paths).toEqual(["/test/frontend", "/test/backend"])
		})

		it("should return empty array when no workspace folders", () => {
			mockWorkspaceFolders.mockReturnValue(undefined)

			const paths = getAllWorkspacePaths()
			expect(paths).toEqual([])
		})

		it("should handle single workspace folder", () => {
			mockWorkspaceFolders.mockReturnValue([{ uri: { fsPath: "/test/workspace" }, name: "workspace", index: 0 }])

			const paths = getAllWorkspacePaths()
			expect(paths).toEqual(["/test/workspace"])
		})
	})

	describe("getWorkspaceFolderForPath", () => {
		beforeEach(() => {
			mockWorkspaceFolders.mockReturnValue([
				{ uri: { fsPath: "/test/frontend" }, name: "frontend", index: 0 },
				{ uri: { fsPath: "/test/backend" }, name: "backend", index: 1 },
			])
		})

		it("should return the workspace folder containing the path", () => {
			expect(getWorkspaceFolderForPath("/test/frontend/src/app.ts")).toBe("/test/frontend")
			expect(getWorkspaceFolderForPath("/test/backend/src/server.ts")).toBe("/test/backend")
		})

		it("should return the workspace folder for exact match", () => {
			expect(getWorkspaceFolderForPath("/test/frontend")).toBe("/test/frontend")
			expect(getWorkspaceFolderForPath("/test/backend")).toBe("/test/backend")
		})

		it("should return null for paths outside any workspace", () => {
			expect(getWorkspaceFolderForPath("/other/path/file.ts")).toBeNull()
			expect(getWorkspaceFolderForPath("/test/other/file.ts")).toBeNull()
		})

		it("should return null when no workspace folders", () => {
			mockWorkspaceFolders.mockReturnValue(undefined)
			expect(getWorkspaceFolderForPath("/test/frontend/src/app.ts")).toBeNull()
		})

		it("should handle relative paths by resolving them", () => {
			// This depends on the current working directory, so we'll use path.resolve
			const resolvedPath = path.resolve("./src/app.ts")
			const result = getWorkspaceFolderForPath("./src/app.ts")

			// The result should be based on the resolved path
			if (resolvedPath.startsWith("/test/frontend")) {
				expect(result).toBe("/test/frontend")
			} else if (resolvedPath.startsWith("/test/backend")) {
				expect(result).toBe("/test/backend")
			} else {
				expect(result).toBeNull()
			}
		})
	})

	describe("arePathsEqual", () => {
		describe("on Windows", () => {
			beforeEach(() => {
				Object.defineProperty(process, "platform", {
					value: "win32",
				})
			})

			it("should compare paths case-insensitively", () => {
				expect(arePathsEqual("C:\\Users\\Test", "c:\\users\\test")).toBe(true)
			})

			it("should handle different path separators", () => {
				// Convert both paths to use forward slashes after normalization
				const path1 = path.normalize("C:\\Users\\Test").replace(/\\/g, "/")
				const path2 = path.normalize("C:/Users/Test").replace(/\\/g, "/")
				expect(arePathsEqual(path1, path2)).toBe(true)
			})

			it("should normalize paths with ../", () => {
				// Convert both paths to use forward slashes after normalization
				const path1 = path.normalize("C:\\Users\\Test\\..\\Test").replace(/\\/g, "/")
				const path2 = path.normalize("C:\\Users\\Test").replace(/\\/g, "/")
				expect(arePathsEqual(path1, path2)).toBe(true)
			})
		})

		describe("on POSIX", () => {
			beforeEach(() => {
				Object.defineProperty(process, "platform", {
					value: "darwin",
				})
			})

			it("should compare paths case-sensitively", () => {
				expect(arePathsEqual("/Users/Test", "/Users/test")).toBe(false)
			})

			it("should normalize paths", () => {
				expect(arePathsEqual("/Users/./Test", "/Users/Test")).toBe(true)
			})

			it("should handle trailing slashes", () => {
				expect(arePathsEqual("/Users/Test/", "/Users/Test")).toBe(true)
			})
		})

		describe("edge cases", () => {
			it("should handle undefined paths", () => {
				expect(arePathsEqual(undefined, undefined)).toBe(true)
				expect(arePathsEqual("/test", undefined)).toBe(false)
				expect(arePathsEqual(undefined, "/test")).toBe(false)
			})

			it("should handle root paths with trailing slashes", () => {
				expect(arePathsEqual("/", "/")).toBe(true)
				expect(arePathsEqual("C:\\", "C:\\")).toBe(true)
			})
		})
	})

	describe("getReadablePath", () => {
		const homeDir = os.homedir()
		const desktop = path.join(homeDir, "Desktop")
		const cwd = process.platform === "win32" ? "C:\\Users\\test\\project" : "/Users/test/project"

		it("should return basename when path equals cwd", () => {
			expect(getReadablePath(cwd, cwd)).toBe("project")
		})

		it("should return relative path when inside cwd", () => {
			const filePath =
				process.platform === "win32"
					? "C:\\Users\\test\\project\\src\\file.txt"
					: "/Users/test/project/src/file.txt"
			expect(getReadablePath(cwd, filePath)).toBe("src/file.txt")
		})

		it("should return absolute path when outside cwd", () => {
			const filePath =
				process.platform === "win32" ? "C:\\Users\\test\\other\\file.txt" : "/Users/test/other/file.txt"
			expect(getReadablePath(cwd, filePath)).toBe(filePath.toPosix())
		})

		it("should handle Desktop as cwd", () => {
			const filePath = path.join(desktop, "file.txt")
			expect(getReadablePath(desktop, filePath)).toBe(filePath.toPosix())
		})

		it("should handle undefined relative path", () => {
			expect(getReadablePath(cwd)).toBe("project")
		})

		it("should handle parent directory traversal", () => {
			const filePath =
				process.platform === "win32" ? "C:\\Users\\test\\other\\file.txt" : "/Users/test/other/file.txt"
			expect(getReadablePath(cwd, filePath)).toBe(filePath.toPosix())
		})

		it("should normalize paths with redundant segments", () => {
			const filePath =
				process.platform === "win32"
					? "C:\\Users\\test\\project\\src\\file.txt"
					: "/Users/test/project/./src/../src/file.txt"
			expect(getReadablePath(cwd, filePath)).toBe("src/file.txt")
		})
	})
})
