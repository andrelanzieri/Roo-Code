import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { DebouncedSave } from "../debouncedSave"

describe("DebouncedSave", () => {
	let debouncedSave: DebouncedSave

	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
		if (debouncedSave) {
			debouncedSave.dispose()
		}
	})

	describe("basic functionality", () => {
		it("should debounce multiple save calls", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 1000 })

			// Schedule multiple saves
			debouncedSave.schedule(saveFunction)
			debouncedSave.schedule(saveFunction)
			debouncedSave.schedule(saveFunction)

			// Should not have been called yet
			expect(saveFunction).not.toHaveBeenCalled()

			// Advance time to trigger the debounced save
			await vi.advanceTimersByTimeAsync(1000)

			// Should have been called only once
			expect(saveFunction).toHaveBeenCalledTimes(1)
		})

		it("should reset timer when new save is scheduled", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 1000, maxWait: 5000 })

			debouncedSave.schedule(saveFunction)

			// Advance time partially
			await vi.advanceTimersByTimeAsync(500)
			expect(saveFunction).not.toHaveBeenCalled()

			// Schedule another save - should reset the debounce timer but not maxWait
			debouncedSave.schedule(saveFunction)

			// Advance time by 500ms more (total 1000ms from start)
			await vi.advanceTimersByTimeAsync(500)
			// Should still not be called because debounce timer was reset
			expect(saveFunction).not.toHaveBeenCalled()

			// Advance by another 500ms (1000ms from second schedule)
			await vi.advanceTimersByTimeAsync(500)
			expect(saveFunction).toHaveBeenCalledTimes(1)
		})

		it("should enforce maxWait limit", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 1000, maxWait: 2000 })

			// Schedule first save
			debouncedSave.schedule(saveFunction)

			// Keep scheduling saves to reset the debounce timer
			// but maxWait timer should still fire after 2000ms
			await vi.advanceTimersByTimeAsync(500)
			debouncedSave.schedule(saveFunction)

			await vi.advanceTimersByTimeAsync(500)
			debouncedSave.schedule(saveFunction)

			await vi.advanceTimersByTimeAsync(500)
			debouncedSave.schedule(saveFunction)

			// Total time: 1500ms, not yet at maxWait
			expect(saveFunction).not.toHaveBeenCalled()

			// Advance to 2000ms total - should trigger maxWait
			await vi.advanceTimersByTimeAsync(500)
			expect(saveFunction).toHaveBeenCalledTimes(1)
		})
	})

	describe("flush functionality", () => {
		it("should execute pending save immediately when flushed", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 1000 })

			debouncedSave.schedule(saveFunction)
			expect(saveFunction).not.toHaveBeenCalled()

			// Flush immediately
			await debouncedSave.flush()
			expect(saveFunction).toHaveBeenCalledTimes(1)
		})

		it("should do nothing when flush is called with no pending save", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 1000 })

			// Flush without scheduling
			await debouncedSave.flush()
			expect(saveFunction).not.toHaveBeenCalled()
		})

		it("should clear timers after flush", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 1000 })

			debouncedSave.schedule(saveFunction)
			await debouncedSave.flush()

			// Advance time - should not trigger another save
			await vi.advanceTimersByTimeAsync(1000)
			expect(saveFunction).toHaveBeenCalledTimes(1)
		})
	})

	describe("cancel functionality", () => {
		it("should cancel pending save operations", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 1000 })

			debouncedSave.schedule(saveFunction)
			debouncedSave.cancel()

			// Advance time - should not trigger save
			await vi.advanceTimersByTimeAsync(1000)
			expect(saveFunction).not.toHaveBeenCalled()
		})

		it("should clear all timers when cancelled", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 1000, maxWait: 2000 })

			debouncedSave.schedule(saveFunction)
			debouncedSave.cancel()

			// Advance time past maxWait - should not trigger save
			await vi.advanceTimersByTimeAsync(3000)
			expect(saveFunction).not.toHaveBeenCalled()
		})
	})

	describe("error handling", () => {
		it("should handle errors in save function without throwing", async () => {
			const error = new Error("Save failed")
			const saveFunction = vi.fn().mockRejectedValue(error)
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			debouncedSave = new DebouncedSave({ delay: 100 })

			debouncedSave.schedule(saveFunction)

			// Advance time to trigger save
			await vi.advanceTimersByTimeAsync(100)

			expect(saveFunction).toHaveBeenCalledTimes(1)
			// The error should be logged but not thrown for scheduled saves
			expect(consoleErrorSpy).toHaveBeenCalledWith("Error during debounced save:", error)

			consoleErrorSpy.mockRestore()
		})

		it("should re-throw errors from flush", async () => {
			const error = new Error("Save failed")
			const saveFunction = vi.fn().mockRejectedValue(error)
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			debouncedSave = new DebouncedSave({ delay: 1000 })

			debouncedSave.schedule(saveFunction)

			// Flush should re-throw the error
			await expect(debouncedSave.flush()).rejects.toThrow("Save failed")

			expect(consoleErrorSpy).toHaveBeenCalledWith("Error during debounced save:", error)
			consoleErrorSpy.mockRestore()
		})
	})

	describe("dispose functionality", () => {
		it("should cancel pending operations when disposed", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 1000 })

			debouncedSave.schedule(saveFunction)
			debouncedSave.dispose()

			// Advance time - should not trigger save
			await vi.advanceTimersByTimeAsync(1000)
			expect(saveFunction).not.toHaveBeenCalled()
		})
	})

	describe("multiple save functions", () => {
		it("should use the latest save function", async () => {
			const saveFunction1 = vi.fn().mockResolvedValue(undefined)
			const saveFunction2 = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 1000 })

			debouncedSave.schedule(saveFunction1)
			debouncedSave.schedule(saveFunction2)

			await vi.advanceTimersByTimeAsync(1000)

			// Only the latest save function should be called
			expect(saveFunction1).not.toHaveBeenCalled()
			expect(saveFunction2).toHaveBeenCalledTimes(1)
		})
	})

	describe("edge cases", () => {
		it("should handle zero delay", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 0 })

			debouncedSave.schedule(saveFunction)

			// Even with 0 delay, it's still async
			expect(saveFunction).not.toHaveBeenCalled()

			await vi.advanceTimersByTimeAsync(0)
			expect(saveFunction).toHaveBeenCalledTimes(1)
		})

		it("should handle maxWait smaller than delay", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 2000, maxWait: 1000 })

			debouncedSave.schedule(saveFunction)

			// Should trigger at maxWait (1000ms) not delay (2000ms)
			await vi.advanceTimersByTimeAsync(1000)
			expect(saveFunction).toHaveBeenCalledTimes(1)
		})

		it("should handle rapid successive schedules", async () => {
			const saveFunction = vi.fn().mockResolvedValue(undefined)
			debouncedSave = new DebouncedSave({ delay: 100 })

			// Schedule many saves rapidly
			for (let i = 0; i < 100; i++) {
				debouncedSave.schedule(saveFunction)
			}

			await vi.advanceTimersByTimeAsync(100)

			// Should still only call once
			expect(saveFunction).toHaveBeenCalledTimes(1)
		})
	})
})
