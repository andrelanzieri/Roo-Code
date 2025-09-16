import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import {
	isRemoteEnvironment,
	getRemoteType,
	getRemoteWorkspaceId,
	getEnvironmentStoragePath,
} from "../remoteEnvironment"

// Mock vscode module
vi.mock("vscode", () => ({
	env: {
		remoteName: undefined,
	},
	workspace: {
		workspaceFolders: undefined,
	},
}))

describe("remoteEnvironment", () => {
	let mockVscode: any

	beforeEach(() => {
		mockVscode = vi.mocked(vscode)
	})

	afterEach(() => {
		// Reset mocks after each test
		mockVscode.env.remoteName = undefined
		mockVscode.workspace.workspaceFolders = undefined
	})

	describe("isRemoteEnvironment", () => {
		it("should return false when not in remote environment", () => {
			mockVscode.env.remoteName = undefined
			expect(isRemoteEnvironment()).toBe(false)
		})

		it("should return true when in SSH remote environment", () => {
			mockVscode.env.remoteName = "ssh-remote"
			expect(isRemoteEnvironment()).toBe(true)
		})

		it("should return true when in WSL environment", () => {
			mockVscode.env.remoteName = "wsl"
			expect(isRemoteEnvironment()).toBe(true)
		})

		it("should return true when in dev container environment", () => {
			mockVscode.env.remoteName = "dev-container"
			expect(isRemoteEnvironment()).toBe(true)
		})

		it("should return true when in codespaces environment", () => {
			mockVscode.env.remoteName = "codespaces"
			expect(isRemoteEnvironment()).toBe(true)
		})
	})

	describe("getRemoteType", () => {
		it("should return undefined when not in remote environment", () => {
			mockVscode.env.remoteName = undefined
			expect(getRemoteType()).toBeUndefined()
		})

		it("should return 'ssh-remote' for SSH remote", () => {
			mockVscode.env.remoteName = "ssh-remote"
			expect(getRemoteType()).toBe("ssh-remote")
		})

		it("should return 'wsl' for WSL", () => {
			mockVscode.env.remoteName = "wsl"
			expect(getRemoteType()).toBe("wsl")
		})
	})

	describe("getRemoteWorkspaceId", () => {
		it("should return undefined when not in remote environment", () => {
			mockVscode.env.remoteName = undefined
			expect(getRemoteWorkspaceId()).toBeUndefined()
		})

		it("should return remote name when no workspace folders", () => {
			mockVscode.env.remoteName = "ssh-remote"
			mockVscode.workspace.workspaceFolders = undefined
			expect(getRemoteWorkspaceId()).toBe("ssh-remote")
		})

		it("should return remote name when workspace folders is empty", () => {
			mockVscode.env.remoteName = "ssh-remote"
			mockVscode.workspace.workspaceFolders = []
			expect(getRemoteWorkspaceId()).toBe("ssh-remote")
		})

		it("should include workspace folder name and hash in ID", () => {
			mockVscode.env.remoteName = "ssh-remote"
			mockVscode.workspace.workspaceFolders = [
				{
					name: "my-project",
					uri: {
						toString: () => "file:///home/user/projects/my-project",
					},
				},
			]
			const id = getRemoteWorkspaceId()
			expect(id).toMatch(/^ssh-remote-my-project-[a-z0-9]+$/)
		})

		it("should create consistent hash for same workspace", () => {
			mockVscode.env.remoteName = "ssh-remote"
			const workspaceUri = "file:///home/user/projects/my-project"
			mockVscode.workspace.workspaceFolders = [
				{
					name: "my-project",
					uri: {
						toString: () => workspaceUri,
					},
				},
			]
			const id1 = getRemoteWorkspaceId()
			const id2 = getRemoteWorkspaceId()
			expect(id1).toBe(id2)
		})

		it("should create different hashes for different workspaces", () => {
			mockVscode.env.remoteName = "ssh-remote"

			// First workspace
			mockVscode.workspace.workspaceFolders = [
				{
					name: "project1",
					uri: {
						toString: () => "file:///home/user/projects/project1",
					},
				},
			]
			const id1 = getRemoteWorkspaceId()

			// Second workspace
			mockVscode.workspace.workspaceFolders = [
				{
					name: "project2",
					uri: {
						toString: () => "file:///home/user/projects/project2",
					},
				},
			]
			const id2 = getRemoteWorkspaceId()

			expect(id1).not.toBe(id2)
		})
	})

	describe("getEnvironmentStoragePath", () => {
		const basePath = "/home/user/.vscode/extensions/storage"

		it("should return base path unchanged when not in remote environment", () => {
			mockVscode.env.remoteName = undefined
			expect(getEnvironmentStoragePath(basePath)).toBe(basePath)
		})

		it("should add remote subdirectory for SSH remote", () => {
			mockVscode.env.remoteName = "ssh-remote"
			mockVscode.workspace.workspaceFolders = [
				{
					name: "my-project",
					uri: {
						toString: () => "file:///home/user/projects/my-project",
					},
				},
			]
			const result = getEnvironmentStoragePath(basePath)
			expect(result).toMatch(
				/^\/home\/user\/.vscode\/extensions\/storage\/remote\/ssh-remote-my-project-[a-z0-9]+$/,
			)
		})

		it("should add remote subdirectory for WSL", () => {
			mockVscode.env.remoteName = "wsl"
			mockVscode.workspace.workspaceFolders = [
				{
					name: "linux-project",
					uri: {
						toString: () => "file:///home/user/linux-project",
					},
				},
			]
			const result = getEnvironmentStoragePath(basePath)
			expect(result).toMatch(/^\/home\/user\/.vscode\/extensions\/storage\/remote\/wsl-linux-project-[a-z0-9]+$/)
		})

		it("should add remote subdirectory for dev containers", () => {
			mockVscode.env.remoteName = "dev-container"
			mockVscode.workspace.workspaceFolders = [
				{
					name: "container-app",
					uri: {
						toString: () => "file:///workspace/container-app",
					},
				},
			]
			const result = getEnvironmentStoragePath(basePath)
			expect(result).toMatch(
				/^\/home\/user\/.vscode\/extensions\/storage\/remote\/dev-container-container-app-[a-z0-9]+$/,
			)
		})

		it("should handle Windows paths correctly", () => {
			const windowsBasePath = "C:\\Users\\user\\AppData\\Roaming\\Code\\User\\globalStorage\\roo-cline"
			mockVscode.env.remoteName = "ssh-remote"
			mockVscode.workspace.workspaceFolders = [
				{
					name: "remote-project",
					uri: {
						toString: () => "file:///home/remote/project",
					},
				},
			]
			const result = getEnvironmentStoragePath(windowsBasePath)
			// The path.join will use forward slashes even on Windows in Node.js context
			expect(result).toMatch(
				/^C:\\Users\\user\\AppData\\Roaming\\Code\\User\\globalStorage\\roo-cline\/remote\/ssh-remote-remote-project-[a-z0-9]+$/,
			)
		})

		it("should fallback to base path when remote ID cannot be determined", () => {
			mockVscode.env.remoteName = "unknown-remote"
			mockVscode.workspace.workspaceFolders = undefined
			// In this case, getRemoteWorkspaceId returns just "unknown-remote"
			const result = getEnvironmentStoragePath(basePath)
			expect(result).toBe(`${basePath}/remote/unknown-remote`)
		})
	})
})
