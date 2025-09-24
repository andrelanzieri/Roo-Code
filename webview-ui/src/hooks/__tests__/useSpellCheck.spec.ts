import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useSpellCheck } from "../useSpellCheck"

describe("useSpellCheck", () => {
	beforeEach(() => {
		// Mock DOM methods
		document.body.innerHTML = ""
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("should initialize with empty misspelled words", () => {
		const { result } = renderHook(() => useSpellCheck())

		expect(result.current.misspelledWords).toEqual([])
		expect(result.current.isChecking).toBe(false)
		expect(result.current.isSupported).toBe(true)
	})

	it("should detect common misspellings", async () => {
		const { result } = renderHook(() => useSpellCheck())

		await act(async () => {
			result.current.checkSpelling("I recieve teh email")
			// Fast-forward debounce timer
			vi.advanceTimersByTime(300)
			// Fast-forward mutation observer timeout
			vi.advanceTimersByTime(100)
		})

		expect(result.current.misspelledWords).toHaveLength(2)
		expect(result.current.misspelledWords[0]).toMatchObject({
			word: "recieve",
			start: 2,
			end: 9,
			suggestions: ["receive"],
		})
		expect(result.current.misspelledWords[1]).toMatchObject({
			word: "teh",
			start: 10,
			end: 13,
			suggestions: ["the"],
		})
	})

	it("should debounce spell checking", async () => {
		const { result } = renderHook(() => useSpellCheck({ debounceMs: 500 }))

		await act(async () => {
			result.current.checkSpelling("First text")
			vi.advanceTimersByTime(200)
			result.current.checkSpelling("Second text")
			vi.advanceTimersByTime(200)
			result.current.checkSpelling("Third text with teh mistake")
			vi.advanceTimersByTime(500)
			vi.advanceTimersByTime(100)
		})

		// Only the last text should be checked
		expect(result.current.misspelledWords).toHaveLength(1)
		expect(result.current.misspelledWords[0].word).toBe("teh")
	})

	it("should clear misspelled words when text is empty", async () => {
		const { result } = renderHook(() => useSpellCheck())

		// First add some misspellings
		await act(async () => {
			result.current.checkSpelling("teh mistake")
			vi.advanceTimersByTime(300)
			vi.advanceTimersByTime(100)
		})

		expect(result.current.misspelledWords).toHaveLength(1)

		// Clear the text
		await act(async () => {
			result.current.checkSpelling("")
			vi.advanceTimersByTime(300)
		})

		expect(result.current.misspelledWords).toEqual([])
	})

	it("should respect enabled option", async () => {
		const { result } = renderHook(() => useSpellCheck({ enabled: false }))

		await act(async () => {
			result.current.checkSpelling("teh mistake")
			vi.advanceTimersByTime(300)
			vi.advanceTimersByTime(100)
		})

		expect(result.current.misspelledWords).toEqual([])
	})

	it("should handle multiple misspellings in a sentence", async () => {
		const { result } = renderHook(() => useSpellCheck())

		await act(async () => {
			result.current.checkSpelling("I beleive we should recieve the calender tommorow")
			vi.advanceTimersByTime(300)
			vi.advanceTimersByTime(100)
		})

		expect(result.current.misspelledWords).toHaveLength(4)
		expect(result.current.misspelledWords.map((w) => w.word)).toEqual([
			"beleive",
			"recieve",
			"calender",
			"tommorow",
		])
	})

	it("should provide correct word positions", async () => {
		const { result } = renderHook(() => useSpellCheck())

		await act(async () => {
			result.current.checkSpelling("The word teh is misspelled")
			vi.advanceTimersByTime(300)
			vi.advanceTimersByTime(100)
		})

		const misspelling = result.current.misspelledWords[0]
		expect(misspelling.start).toBe(9)
		expect(misspelling.end).toBe(12)

		// Verify the position is correct
		const text = "The word teh is misspelled"
		expect(text.substring(misspelling.start, misspelling.end)).toBe("teh")
	})

	it("should handle case-insensitive matching", async () => {
		const { result } = renderHook(() => useSpellCheck())

		await act(async () => {
			result.current.checkSpelling("I Recieve THE email")
			vi.advanceTimersByTime(300)
			vi.advanceTimersByTime(100)
		})

		// Should detect 'Recieve' even with capital R
		expect(result.current.misspelledWords).toHaveLength(1)
		expect(result.current.misspelledWords[0].word).toBe("Recieve")
		expect(result.current.misspelledWords[0].suggestions).toEqual(["receive"])
	})

	it("should cancel previous spell check when new one starts", async () => {
		const { result } = renderHook(() => useSpellCheck({ debounceMs: 100 }))

		await act(async () => {
			result.current.checkSpelling("First text with teh")
			vi.advanceTimersByTime(50)
			// Start new check before previous completes
			result.current.checkSpelling("Second text with wierd")
			vi.advanceTimersByTime(100)
			vi.advanceTimersByTime(100)
		})

		// Should only have results from second text
		expect(result.current.misspelledWords).toHaveLength(1)
		expect(result.current.misspelledWords[0].word).toBe("wierd")
	})

	it("should clean up timers on unmount", async () => {
		const { result, unmount } = renderHook(() => useSpellCheck())

		// Start a spell check to create a timer
		await act(async () => {
			result.current.checkSpelling("test text")
			// Don't advance timers, leave it pending
		})

		const clearTimeoutSpy = vi.spyOn(global, "clearTimeout")

		unmount()

		expect(clearTimeoutSpy).toHaveBeenCalled()
	})
})
