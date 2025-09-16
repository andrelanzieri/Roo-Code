// npx vitest utils/__tests__/pathUtils.spec.ts

import * as path from "path"
import { isPathOutsideWorkspace, getContainingWorkspaceFolder } from "../pathUtils"

// Mock vscode module
const mockWorkspaceFolders = vi.fn()

vi.mock("vscode", () => ({
	workspace: {
		get workspaceFolders() {
			return mockWorkspaceFolders()
		},
	},
	WorkspaceFolder: class {
		constructor(
			public uri: { fsPath: string },
			public name: string,
			public index: number,
		) {}
	},
}))

describe("pathUtils", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("isPathOutsideWorkspace", () => {
		describe("single workspace folder", () => {
			beforeEach(() => {
				mockWorkspaceFolders.mockReturnValue([
					{
						uri: { fsPath: "/test/workspace" },
						name: "workspace",
						index: 0,
					},
				])
			})

			it("should return false for paths inside the workspace", () => {
				expect(isPathOutsideWorkspace("/test/workspace")).toBe(false)
				expect(isPathOutsideWorkspace("/test/workspace/src/file.ts")).toBe(false)
				expect(isPathOutsideWorkspace("/test/workspace/nested/deep/file.ts")).toBe(false)
			})

			it("should return true for paths outside the workspace", () => {
				expect(isPathOutsideWorkspace("/test/other")).toBe(true)
				expect(isPathOutsideWorkspace("/other/path/file.ts")).toBe(true)
				expect(isPathOutsideWorkspace("/test")).toBe(true) // Parent directory
			})

			it("should handle relative paths by resolving them", () => {
				const originalCwd = process.cwd()

				// Mock process.cwd to be inside workspace
				const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/test/workspace/src")

				expect(isPathOutsideWorkspace("./file.ts")).toBe(false) // Resolves to /test/workspace/src/file.ts
				expect(isPathOutsideWorkspace("../file.ts")).toBe(false) // Resolves to /test/workspace/file.ts
				expect(isPathOutsideWorkspace("../../other/file.ts")).toBe(true) // Resolves to /test/other/file.ts

				cwdSpy.mockRestore()
			})
		})

		describe("multi-root workspace", () => {
			beforeEach(() => {
				mockWorkspaceFolders.mockReturnValue([
					{
						uri: { fsPath: "/test/frontend" },
						name: "frontend",
						index: 0,
					},
					{
						uri: { fsPath: "/test/backend" },
						name: "backend",
						index: 1,
					},
				])
			})

			it("should return false for paths in any workspace folder", () => {
				// Frontend paths
				expect(isPathOutsideWorkspace("/test/frontend")).toBe(false)
				expect(isPathOutsideWorkspace("/test/frontend/src/app.ts")).toBe(false)

				// Backend paths
				expect(isPathOutsideWorkspace("/test/backend")).toBe(false)
				expect(isPathOutsideWorkspace("/test/backend/src/server.ts")).toBe(false)
			})

			it("should return true for paths outside all workspace folders", () => {
				expect(isPathOutsideWorkspace("/test/other")).toBe(true)
				expect(isPathOutsideWorkspace("/other/path")).toBe(true)
				expect(isPathOutsideWorkspace("/test")).toBe(true) // Parent of both workspaces
			})

			it("should handle paths between workspace folders correctly", () => {
				// This is the key test for the bug fix
				// Paths in sibling workspace folders should NOT be considered outside
				expect(isPathOutsideWorkspace("/test/frontend/src/app.ts")).toBe(false)
				expect(isPathOutsideWorkspace("/test/backend/src/server.ts")).toBe(false)

				// But paths that are truly outside should still be blocked
				expect(isPathOutsideWorkspace("/test/shared/lib.ts")).toBe(true)
			})
		})

		describe("no workspace folders", () => {
			beforeEach(() => {
				mockWorkspaceFolders.mockReturnValue(undefined)
			})

			it("should return true for all paths when no workspace", () => {
				expect(isPathOutsideWorkspace("/any/path")).toBe(true)
				expect(isPathOutsideWorkspace("./relative/path")).toBe(true)
				expect(isPathOutsideWorkspace("/test/workspace/file.ts")).toBe(true)
			})
		})

		describe("empty workspace folders array", () => {
			beforeEach(() => {
				mockWorkspaceFolders.mockReturnValue([])
			})

			it("should return true for all paths when workspace array is empty", () => {
				expect(isPathOutsideWorkspace("/any/path")).toBe(true)
				expect(isPathOutsideWorkspace("./relative/path")).toBe(true)
			})
		})

		describe("path normalization", () => {
			beforeEach(() => {
				mockWorkspaceFolders.mockReturnValue([
					{
						uri: { fsPath: "/test/workspace" },
						name: "workspace",
						index: 0,
					},
				])
			})

			it("should normalize paths with .. and .", () => {
				expect(isPathOutsideWorkspace("/test/workspace/../workspace/src/file.ts")).toBe(false)
				expect(isPathOutsideWorkspace("/test/workspace/./src/file.ts")).toBe(false)
				expect(isPathOutsideWorkspace("/test/workspace/src/../src/file.ts")).toBe(false)
			})

			it("should handle trailing slashes", () => {
				expect(isPathOutsideWorkspace("/test/workspace/")).toBe(false)
				expect(isPathOutsideWorkspace("/test/workspace/src/")).toBe(false)
			})
		})
	})

	describe("getContainingWorkspaceFolder", () => {
		describe("single workspace folder", () => {
			const workspaceFolder = {
				uri: { fsPath: "/test/workspace" },
				name: "workspace",
				index: 0,
			}

			beforeEach(() => {
				mockWorkspaceFolders.mockReturnValue([workspaceFolder])
			})

			it("should return the workspace folder for paths inside it", () => {
				expect(getContainingWorkspaceFolder("/test/workspace")).toEqual(workspaceFolder)
				expect(getContainingWorkspaceFolder("/test/workspace/src/file.ts")).toEqual(workspaceFolder)
			})

			it("should return undefined for paths outside the workspace", () => {
				expect(getContainingWorkspaceFolder("/test/other")).toBeUndefined()
				expect(getContainingWorkspaceFolder("/other/path")).toBeUndefined()
			})
		})

		describe("multi-root workspace", () => {
			const frontendFolder = {
				uri: { fsPath: "/test/frontend" },
				name: "frontend",
				index: 0,
			}

			const backendFolder = {
				uri: { fsPath: "/test/backend" },
				name: "backend",
				index: 1,
			}

			beforeEach(() => {
				mockWorkspaceFolders.mockReturnValue([frontendFolder, backendFolder])
			})

			it("should return the correct workspace folder for each path", () => {
				expect(getContainingWorkspaceFolder("/test/frontend/src/app.ts")).toEqual(frontendFolder)
				expect(getContainingWorkspaceFolder("/test/backend/src/server.ts")).toEqual(backendFolder)
			})

			it("should return the exact workspace folder for root paths", () => {
				expect(getContainingWorkspaceFolder("/test/frontend")).toEqual(frontendFolder)
				expect(getContainingWorkspaceFolder("/test/backend")).toEqual(backendFolder)
			})

			it("should return undefined for paths outside all workspaces", () => {
				expect(getContainingWorkspaceFolder("/test/other")).toBeUndefined()
				expect(getContainingWorkspaceFolder("/test")).toBeUndefined()
			})
		})

		describe("no workspace folders", () => {
			beforeEach(() => {
				mockWorkspaceFolders.mockReturnValue(undefined)
			})

			it("should return undefined when no workspace folders", () => {
				expect(getContainingWorkspaceFolder("/any/path")).toBeUndefined()
			})
		})

		describe("empty workspace folders array", () => {
			beforeEach(() => {
				mockWorkspaceFolders.mockReturnValue([])
			})

			it("should return undefined when workspace array is empty", () => {
				expect(getContainingWorkspaceFolder("/any/path")).toBeUndefined()
			})
		})
	})
})
