import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs"
import * as os from "os"
import { isWSL, getWindowsHomeFromWSL } from "../wsl"

// Mock fs module
vi.mock("fs", () => ({
	readFileSync: vi.fn(),
	accessSync: vi.fn(),
	constants: {
		F_OK: 0,
	},
}))

// Mock os module
vi.mock("os", () => ({
	userInfo: vi.fn(() => ({ username: "testuser" })),
}))

describe("WSL Detection", () => {
	const originalEnv = process.env
	const originalPlatform = process.platform

	beforeEach(() => {
		// Reset environment variables
		process.env = { ...originalEnv }
		// Reset platform
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
			writable: true,
		})
		// Clear all mocks
		vi.clearAllMocks()
	})

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
			writable: false,
		})
	})

	describe("isWSL", () => {
		it("should detect WSL when WSL_DISTRO_NAME is set", () => {
			process.env.WSL_DISTRO_NAME = "Ubuntu"
			expect(isWSL()).toBe(true)
		})

		it("should detect WSL when WSL_INTEROP is set", () => {
			process.env.WSL_INTEROP = "/run/WSL/123_interop"
			expect(isWSL()).toBe(true)
		})

		it("should detect WSL when /proc/version contains Microsoft", () => {
			Object.defineProperty(process, "platform", { value: "linux", writable: true })
			vi.mocked(fs.readFileSync).mockReturnValue(
				"Linux version 5.10.16.3-microsoft-standard-WSL2 (gcc version 9.3.0)",
			)
			expect(isWSL()).toBe(true)
		})

		it("should detect WSL when /proc/version contains WSL", () => {
			Object.defineProperty(process, "platform", { value: "linux", writable: true })
			vi.mocked(fs.readFileSync).mockReturnValue("Linux version 5.10.16.3-WSL2")
			expect(isWSL()).toBe(true)
		})

		it("should detect WSL when /proc/sys/fs/binfmt_misc/WSLInterop exists", () => {
			Object.defineProperty(process, "platform", { value: "linux", writable: true })
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			// accessSync should not throw for WSLInterop file
			vi.mocked(fs.accessSync).mockImplementation((path) => {
				if (path === "/proc/sys/fs/binfmt_misc/WSLInterop") {
					return undefined
				}
				throw new Error("File not found")
			})
			expect(isWSL()).toBe(true)
		})

		it("should detect WSL when PATH contains /mnt/c/", () => {
			Object.defineProperty(process, "platform", { value: "linux", writable: true })
			process.env.PATH = "/usr/bin:/mnt/c/Windows/System32:/mnt/c/Windows"
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			vi.mocked(fs.accessSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			expect(isWSL()).toBe(true)
		})

		it("should detect WSL when WSLENV is set", () => {
			Object.defineProperty(process, "platform", { value: "linux", writable: true })
			process.env.WSLENV = "WT_SESSION:WT_PROFILE_ID"
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			vi.mocked(fs.accessSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			expect(isWSL()).toBe(true)
		})

		it("should return false on native Windows", () => {
			Object.defineProperty(process, "platform", { value: "win32", writable: true })
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			vi.mocked(fs.accessSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			expect(isWSL()).toBe(false)
		})

		it("should return false on native Linux without WSL indicators", () => {
			Object.defineProperty(process, "platform", { value: "linux", writable: true })
			process.env.PATH = "/usr/bin:/usr/local/bin"
			vi.mocked(fs.readFileSync).mockReturnValue("Linux version 5.10.0-generic")
			vi.mocked(fs.accessSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			expect(isWSL()).toBe(false)
		})

		it("should return false on macOS", () => {
			Object.defineProperty(process, "platform", { value: "darwin", writable: true })
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			vi.mocked(fs.accessSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			expect(isWSL()).toBe(false)
		})
	})

	describe("getWindowsHomeFromWSL", () => {
		beforeEach(() => {
			// Set up WSL environment
			Object.defineProperty(process, "platform", { value: "linux", writable: true })
			process.env.WSL_DISTRO_NAME = "Ubuntu"
		})

		it("should return null when not in WSL", () => {
			delete process.env.WSL_DISTRO_NAME
			delete process.env.WSL_INTEROP
			Object.defineProperty(process, "platform", { value: "win32", writable: true })
			expect(getWindowsHomeFromWSL()).toBe(null)
		})

		it("should find Windows home directory at /mnt/c/Users/username", () => {
			process.env.USER = "testuser"
			vi.mocked(fs.accessSync).mockImplementation((path) => {
				if (path === "/mnt/c/Users/testuser") {
					return undefined
				}
				throw new Error("File not found")
			})
			expect(getWindowsHomeFromWSL()).toBe("/mnt/c/Users/testuser")
		})

		it("should find Windows home directory at /mnt/c/users/username (lowercase)", () => {
			process.env.USER = "testuser"
			vi.mocked(fs.accessSync).mockImplementation((path) => {
				if (path === "/mnt/c/users/testuser") {
					return undefined
				}
				throw new Error("File not found")
			})
			expect(getWindowsHomeFromWSL()).toBe("/mnt/c/users/testuser")
		})

		it("should check D: drive if C: drive not found", () => {
			process.env.USER = "testuser"
			vi.mocked(fs.accessSync).mockImplementation((path) => {
				if (path === "/mnt/d/Users/testuser") {
					return undefined
				}
				throw new Error("File not found")
			})
			expect(getWindowsHomeFromWSL()).toBe("/mnt/d/Users/testuser")
		})

		it("should use WSL_USER_NAME if available", () => {
			process.env.WSL_USER_NAME = "wsluser"
			vi.mocked(fs.accessSync).mockImplementation((path) => {
				if (path === "/mnt/c/Users/wsluser") {
					return undefined
				}
				throw new Error("File not found")
			})
			expect(getWindowsHomeFromWSL()).toBe("/mnt/c/Users/wsluser")
		})

		it("should convert USERPROFILE Windows path to WSL path", () => {
			process.env.USERPROFILE = "C:\\Users\\winuser"
			vi.mocked(fs.accessSync).mockImplementation((path) => {
				if (path === "/mnt/c/Users/winuser") {
					return undefined
				}
				throw new Error("File not found")
			})
			expect(getWindowsHomeFromWSL()).toBe("/mnt/c/Users/winuser")
		})

		it("should handle USERPROFILE with different drive letter", () => {
			process.env.USERPROFILE = "D:\\Users\\winuser"
			vi.mocked(fs.accessSync).mockImplementation((path) => {
				if (path === "/mnt/d/Users/winuser") {
					return undefined
				}
				throw new Error("File not found")
			})
			expect(getWindowsHomeFromWSL()).toBe("/mnt/d/Users/winuser")
		})

		it("should return null when no Windows home directory is found", () => {
			process.env.USER = "testuser"
			delete process.env.USERPROFILE
			vi.mocked(fs.accessSync).mockImplementation(() => {
				throw new Error("File not found")
			})
			expect(getWindowsHomeFromWSL()).toBe(null)
		})
	})
})
