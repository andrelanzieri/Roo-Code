import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Use vi.hoisted to ensure mocks are set up before imports
const { execAsync } = vi.hoisted(() => {
	return {
		execAsync: vi.fn(),
	}
})

// Mock modules before any imports
vi.mock("fs/promises")
vi.mock("child_process")
vi.mock("util", () => ({
	promisify: vi.fn(() => execAsync),
}))
vi.mock("vscode", () => ({
	window: {
		showErrorMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		withProgress: vi.fn((options, task) => task({ report: vi.fn() })),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key, defaultValue) => defaultValue),
		})),
	},
	ProgressLocation: {
		Notification: 15,
	},
}))

// Now import the modules after mocking
import * as fs from "fs/promises"
import * as vscode from "vscode"
import {
	detectEnvironment,
	installChromeDependencies,
	getSystemChromePath,
	getDockerBrowserConfig,
	startDockerBrowser,
	stopDockerBrowser,
} from "../browserEnvironment"

describe("browserEnvironment", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Reset environment variables
		delete process.env.CODESPACES
		// Mock platform
		Object.defineProperty(process, "platform", {
			value: "linux",
			writable: true,
		})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("detectEnvironment", () => {
		it("should detect Codespaces environment", async () => {
			process.env.CODESPACES = "true"
			vi.mocked(fs.access).mockRejectedValue(new Error("No .dockerenv"))
			vi.mocked(fs.readFile).mockRejectedValue(new Error("No cgroup"))
			execAsync.mockRejectedValue(new Error("No docker"))

			const env = await detectEnvironment()

			expect(env.isCodespaces).toBe(true)
			expect(env.isLinux).toBe(true)
		})

		it("should detect container environment via .dockerenv", async () => {
			vi.mocked(fs.access).mockResolvedValue(undefined)
			execAsync.mockRejectedValue(new Error("No docker"))

			const env = await detectEnvironment()

			expect(env.isContainer).toBe(true)
		})

		it("should detect container environment via cgroup", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("No .dockerenv"))
			vi.mocked(fs.readFile).mockResolvedValue("1:name=systemd:/docker/abc123")
			execAsync.mockRejectedValue(new Error("No docker"))

			const env = await detectEnvironment()

			expect(env.isContainer).toBe(true)
		})

		it("should detect Docker availability", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("No .dockerenv"))
			vi.mocked(fs.readFile).mockRejectedValue(new Error("No cgroup"))
			execAsync.mockImplementation((cmd: string) => {
				if (cmd === "docker --version") {
					return Promise.resolve({ stdout: "Docker version 20.10.0", stderr: "" })
				}
				if (cmd.includes("ldconfig")) {
					return Promise.resolve({ stdout: "", stderr: "" })
				}
				return Promise.reject(new Error("Command not found"))
			})

			const env = await detectEnvironment()

			expect(env.hasDocker).toBe(true)
		})

		it("should detect system Chrome", async () => {
			vi.mocked(fs.access).mockImplementation((path) => {
				if (path === "/usr/bin/google-chrome") {
					return Promise.resolve(undefined)
				}
				return Promise.reject(new Error("Not found"))
			})
			execAsync.mockRejectedValue(new Error("No docker"))

			const env = await detectEnvironment()

			expect(env.hasSystemChrome).toBe(true)
		})

		it("should detect missing dependencies on Linux", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("No .dockerenv"))
			vi.mocked(fs.readFile).mockRejectedValue(new Error("No cgroup"))
			execAsync.mockImplementation((cmd: string) => {
				if (cmd.includes("ldconfig")) {
					// Simulate missing libatk-1.0.so.0
					if (cmd.includes("libatk-1.0.so.0")) {
						return Promise.reject(new Error("Not found"))
					}
					return Promise.resolve({ stdout: "library found", stderr: "" })
				}
				return Promise.reject(new Error("Command not found"))
			})

			const env = await detectEnvironment()

			expect(env.missingDependencies).toContain("libatk-1.0.so.0")
		})

		it("should not check dependencies on non-Linux platforms", async () => {
			Object.defineProperty(process, "platform", {
				value: "darwin",
				writable: true,
			})
			vi.mocked(fs.access).mockRejectedValue(new Error("No .dockerenv"))
			vi.mocked(fs.readFile).mockRejectedValue(new Error("No cgroup"))
			execAsync.mockRejectedValue(new Error("No docker"))

			const env = await detectEnvironment()

			expect(env.isLinux).toBe(false)
			expect(env.missingDependencies).toEqual([])
		})
	})

	describe("getSystemChromePath", () => {
		it("should return path to Google Chrome if found", async () => {
			vi.mocked(fs.access).mockImplementation((path) => {
				if (path === "/usr/bin/google-chrome") {
					return Promise.resolve(undefined)
				}
				return Promise.reject(new Error("Not found"))
			})

			const path = await getSystemChromePath()

			expect(path).toBe("/usr/bin/google-chrome")
		})

		it("should return path to Chromium if Chrome not found", async () => {
			vi.mocked(fs.access).mockImplementation((path) => {
				if (path === "/usr/bin/chromium") {
					return Promise.resolve(undefined)
				}
				return Promise.reject(new Error("Not found"))
			})

			const path = await getSystemChromePath()

			expect(path).toBe("/usr/bin/chromium")
		})

		it("should return null if no Chrome/Chromium found", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("Not found"))

			const path = await getSystemChromePath()

			expect(path).toBeNull()
		})
	})

	describe("installChromeDependencies", () => {
		it("should skip installation on non-Linux", async () => {
			Object.defineProperty(process, "platform", {
				value: "darwin",
				writable: true,
			})
			// Mock execAsync for detectEnvironment calls
			execAsync.mockRejectedValue(new Error("Command not found"))

			const mockContext = {} as vscode.ExtensionContext

			const result = await installChromeDependencies(mockContext)

			expect(result).toBe(true)
			// execAsync may be called for environment detection, but not for installation
			expect(execAsync).not.toHaveBeenCalledWith(expect.stringContaining("apt-get"))
			expect(execAsync).not.toHaveBeenCalledWith(expect.stringContaining("sudo"))
		})

		it("should skip installation if no dependencies missing", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("No .dockerenv"))
			vi.mocked(fs.readFile).mockRejectedValue(new Error("No cgroup"))
			execAsync.mockImplementation((cmd: string) => {
				if (cmd.includes("ldconfig")) {
					return Promise.resolve({ stdout: "library found", stderr: "" })
				}
				return Promise.reject(new Error("Command not found"))
			})
			const mockContext = {} as vscode.ExtensionContext

			const result = await installChromeDependencies(mockContext)

			expect(result).toBe(true)
		})

		it("should show error if no sudo access", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("No .dockerenv"))
			vi.mocked(fs.readFile).mockRejectedValue(new Error("No cgroup"))
			execAsync.mockImplementation((cmd: string) => {
				if (cmd === "sudo -n true") {
					return Promise.reject(new Error("No sudo"))
				}
				if (cmd.includes("ldconfig")) {
					if (cmd.includes("libatk-1.0.so.0")) {
						return Promise.reject(new Error("Not found"))
					}
					return Promise.resolve({ stdout: "library found", stderr: "" })
				}
				return Promise.reject(new Error("Command not found"))
			})
			const mockContext = {} as vscode.ExtensionContext

			const result = await installChromeDependencies(mockContext)

			expect(result).toBe(false)
			expect(vscode.window.showErrorMessage).toHaveBeenCalled()
		})

		it("should install dependencies with sudo access", async () => {
			vi.mocked(fs.access).mockRejectedValue(new Error("No .dockerenv"))
			vi.mocked(fs.readFile).mockRejectedValue(new Error("No cgroup"))
			execAsync.mockImplementation((cmd: string) => {
				if (cmd === "sudo -n true") {
					return Promise.resolve({ stdout: "", stderr: "" })
				}
				if (cmd.includes("ldconfig")) {
					if (cmd.includes("libatk-1.0.so.0")) {
						return Promise.reject(new Error("Not found"))
					}
					return Promise.resolve({ stdout: "library found", stderr: "" })
				}
				if (cmd.includes("apt-get")) {
					return Promise.resolve({ stdout: "", stderr: "" })
				}
				if (cmd.includes("which google-chrome")) {
					return Promise.reject(new Error("Not found"))
				}
				return Promise.resolve({ stdout: "", stderr: "" })
			})
			const mockContext = {} as vscode.ExtensionContext

			const result = await installChromeDependencies(mockContext)

			expect(result).toBe(true)
			expect(execAsync).toHaveBeenCalledWith("sudo apt-get update")
			expect(execAsync).toHaveBeenCalledWith(expect.stringContaining("sudo apt-get install -y"))
			expect(vscode.window.showInformationMessage).toHaveBeenCalled()
		})
	})

	describe("getDockerBrowserConfig", () => {
		it("should return default configuration", () => {
			const mockContext = {} as vscode.ExtensionContext

			const config = getDockerBrowserConfig(mockContext)

			expect(config).toEqual({
				enabled: false,
				image: "browserless/chrome:latest",
				autoStart: true,
			})
		})

		it("should return custom configuration from settings", () => {
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
				get: vi.fn((key, defaultValue) => {
					if (key === "browserDocker.enabled") return true
					if (key === "browserDocker.image") return "custom/chrome:v1"
					if (key === "browserDocker.autoStart") return false
					return defaultValue
				}),
			} as any)
			const mockContext = {} as vscode.ExtensionContext

			const config = getDockerBrowserConfig(mockContext)

			expect(config).toEqual({
				enabled: true,
				image: "custom/chrome:v1",
				autoStart: false,
			})
		})
	})

	describe("startDockerBrowser", () => {
		it("should start new Docker container", async () => {
			execAsync.mockImplementation((cmd: string) => {
				if (cmd.includes("docker ps -a")) {
					return Promise.resolve({ stdout: "", stderr: "" })
				}
				if (cmd.includes("docker run")) {
					return Promise.resolve({ stdout: "", stderr: "" })
				}
				return Promise.resolve({ stdout: "", stderr: "" })
			})

			const endpoint = await startDockerBrowser({
				enabled: true,
				image: "browserless/chrome:latest",
				autoStart: true,
			})

			expect(endpoint).toBe("ws://localhost:3000")
			expect(execAsync).toHaveBeenCalledWith(expect.stringContaining("docker run"))
		})

		it("should start existing Docker container", async () => {
			execAsync.mockImplementation((cmd: string) => {
				if (cmd.includes("docker ps -a")) {
					return Promise.resolve({ stdout: "roo-browser", stderr: "" })
				}
				if (cmd.includes("docker start")) {
					return Promise.resolve({ stdout: "", stderr: "" })
				}
				return Promise.resolve({ stdout: "", stderr: "" })
			})

			const endpoint = await startDockerBrowser({
				enabled: true,
				image: "browserless/chrome:latest",
				autoStart: true,
			})

			expect(endpoint).toBe("ws://localhost:3000")
			expect(execAsync).toHaveBeenCalledWith("docker start roo-browser")
			expect(execAsync).not.toHaveBeenCalledWith(expect.stringContaining("docker run"))
		})

		it("should return null on error", async () => {
			execAsync.mockRejectedValue(new Error("Docker error"))

			const endpoint = await startDockerBrowser({
				enabled: true,
				image: "browserless/chrome:latest",
				autoStart: true,
			})

			expect(endpoint).toBeNull()
		})
	})

	describe("stopDockerBrowser", () => {
		it("should stop Docker container", async () => {
			execAsync.mockResolvedValue({ stdout: "", stderr: "" })

			await stopDockerBrowser()

			expect(execAsync).toHaveBeenCalledWith("docker stop roo-browser")
		})

		it("should not throw on error", async () => {
			execAsync.mockRejectedValue(new Error("Container not running"))

			await expect(stopDockerBrowser()).resolves.not.toThrow()
		})
	})
})
