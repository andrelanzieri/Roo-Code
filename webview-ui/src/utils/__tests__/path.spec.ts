import { describe, it, expect, beforeEach, vi } from "vitest"
import * as path from "path"
import * as os from "os"
import { arePathsEqual } from "../path"

describe("arePathsEqual", () => {
	const originalPlatform = process.platform

	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
		})
	})

	describe("cross-platform path comparison", () => {
		it("should return true for identical paths", () => {
			expect(arePathsEqual("/home/user/project", "/home/user/project")).toBe(true)
			expect(arePathsEqual("C:\\Users\\project", "C:\\Users\\project")).toBe(true)
		})

		it("should return true for paths with different separators", () => {
			expect(arePathsEqual("/home/user/project", "/home/user/project/")).toBe(true)
			expect(arePathsEqual("C:\\Users\\project", "C:\\Users\\project\\")).toBe(true)
		})

		it("should normalize paths with . and .. segments", () => {
			expect(arePathsEqual("/home/user/../user/project", "/home/user/project")).toBe(true)
			expect(arePathsEqual("/home/./user/project", "/home/user/project")).toBe(true)
		})

		it("should handle undefined and null paths", () => {
			expect(arePathsEqual(undefined, undefined)).toBe(true)
			expect(arePathsEqual(null as any, null as any)).toBe(true)
			expect(arePathsEqual(undefined, "/home/user")).toBe(false)
			expect(arePathsEqual("/home/user", undefined)).toBe(false)
		})

		it("should handle empty strings", () => {
			expect(arePathsEqual("", "")).toBe(true)
			expect(arePathsEqual("", "/home/user")).toBe(false)
			expect(arePathsEqual("/home/user", "")).toBe(false)
		})
	})

	describe("Windows-specific behavior", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", {
				value: "win32",
				configurable: true,
			})
		})

		it("should perform case-insensitive comparison on Windows", () => {
			expect(arePathsEqual("C:\\Users\\Project", "c:\\users\\project")).toBe(true)
			expect(arePathsEqual("C:\\USERS\\PROJECT", "c:\\Users\\Project")).toBe(true)
		})

		it("should handle mixed separators on Windows", () => {
			expect(arePathsEqual("C:\\Users\\Project", "C:/Users/Project")).toBe(true)
			expect(arePathsEqual("C:/Users/Project", "C:\\Users\\Project")).toBe(true)
		})
	})

	describe("POSIX-specific behavior", () => {
		beforeEach(() => {
			Object.defineProperty(process, "platform", {
				value: "darwin",
				configurable: true,
			})
		})

		it("should perform case-sensitive comparison on POSIX systems", () => {
			expect(arePathsEqual("/Users/Project", "/users/project")).toBe(false)
			expect(arePathsEqual("/Users/Project", "/Users/Project")).toBe(true)
		})
	})

	describe("Desktop directory handling", () => {
		it("should correctly compare Desktop paths on macOS", () => {
			Object.defineProperty(process, "platform", {
				value: "darwin",
				configurable: true,
			})

			const desktopPath = "/Users/testuser/Desktop"
			const desktopPathWithSlash = "/Users/testuser/Desktop/"
			const desktopPathNormalized = path.normalize("/Users/testuser/Desktop")

			expect(arePathsEqual(desktopPath, desktopPath)).toBe(true)
			expect(arePathsEqual(desktopPath, desktopPathWithSlash)).toBe(true)
			expect(arePathsEqual(desktopPath, desktopPathNormalized)).toBe(true)
		})

		it("should correctly compare Desktop paths on Windows", () => {
			Object.defineProperty(process, "platform", {
				value: "win32",
				configurable: true,
			})

			const desktopPath = "C:\\Users\\testuser\\Desktop"
			const desktopPathWithSlash = "C:\\Users\\testuser\\Desktop\\"
			const desktopPathMixedCase = "c:\\users\\testuser\\desktop"
			const desktopPathForwardSlash = "C:/Users/testuser/Desktop"

			expect(arePathsEqual(desktopPath, desktopPath)).toBe(true)
			expect(arePathsEqual(desktopPath, desktopPathWithSlash)).toBe(true)
			expect(arePathsEqual(desktopPath, desktopPathMixedCase)).toBe(true)
			expect(arePathsEqual(desktopPath, desktopPathForwardSlash)).toBe(true)
		})

		it("should handle relative Desktop paths", () => {
			const homeDir = os.homedir()
			const desktopRelative = path.join("~", "Desktop").replace("~", homeDir)
			const desktopAbsolute = path.join(homeDir, "Desktop")

			expect(arePathsEqual(desktopRelative, desktopAbsolute)).toBe(true)
		})
	})

	describe("edge cases", () => {
		it("should handle paths with multiple slashes", () => {
			expect(arePathsEqual("/home//user///project", "/home/user/project")).toBe(true)
			expect(arePathsEqual("C:\\\\Users\\\\\\project", "C:\\Users\\project")).toBe(true)
		})

		it("should handle root paths", () => {
			expect(arePathsEqual("/", "/")).toBe(true)
			expect(arePathsEqual("C:\\", "C:\\")).toBe(true)

			// Root paths should keep their trailing slash
			Object.defineProperty(process, "platform", {
				value: "win32",
				configurable: true,
			})
			expect(arePathsEqual("C:\\", "c:/")).toBe(true)
		})

		it("should return false for different paths", () => {
			expect(arePathsEqual("/home/user/project1", "/home/user/project2")).toBe(false)
			expect(arePathsEqual("/home/user", "/home/user/project")).toBe(false)
		})
	})
})
