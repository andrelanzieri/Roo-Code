import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useSpeechRecognition } from "../useSpeechRecognition"

// Mock the TranslationContext
vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

// Mock SpeechRecognition API
class MockSpeechRecognition {
	continuous = false
	interimResults = false
	maxAlternatives = 1
	lang = ""
	onstart: ((event: Event) => void) | null = null
	onend: ((event: Event) => void) | null = null
	onresult: ((event: any) => void) | null = null
	onerror: ((event: any) => void) | null = null

	start = vi.fn()
	stop = vi.fn()
	abort = vi.fn()
}

describe("useSpeechRecognition", () => {
	let mockSpeechRecognition: MockSpeechRecognition

	beforeEach(() => {
		mockSpeechRecognition = new MockSpeechRecognition()

		// Mock window.SpeechRecognition
		Object.defineProperty(window, "SpeechRecognition", {
			writable: true,
			value: vi.fn().mockImplementation(() => mockSpeechRecognition),
		})

		Object.defineProperty(window, "webkitSpeechRecognition", {
			writable: true,
			value: vi.fn().mockImplementation(() => mockSpeechRecognition),
		})
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("should initialize with default values", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		expect(result.current.isListening).toBe(false)
		expect(result.current.isSupported).toBe(true)
		expect(result.current.transcript).toBe("")
		expect(result.current.interimTranscript).toBe("")
		expect(result.current.error).toBe(null)
	})

	it("should detect when speech recognition is not supported", () => {
		// Remove SpeechRecognition API
		Object.defineProperty(window, "SpeechRecognition", {
			writable: true,
			value: undefined,
		})
		Object.defineProperty(window, "webkitSpeechRecognition", {
			writable: true,
			value: undefined,
		})

		const { result } = renderHook(() => useSpeechRecognition())

		expect(result.current.isSupported).toBe(false)
	})

	it("should start listening when startListening is called", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		act(() => {
			result.current.startListening()
		})

		expect(mockSpeechRecognition.start).toHaveBeenCalled()
	})

	it("should stop listening when stopListening is called", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		// Start listening first
		act(() => {
			result.current.startListening()
		})

		// Simulate onstart event
		act(() => {
			mockSpeechRecognition.onstart?.(new Event("start"))
		})

		expect(result.current.isListening).toBe(true)

		// Stop listening
		act(() => {
			result.current.stopListening()
		})

		expect(mockSpeechRecognition.stop).toHaveBeenCalled()
	})

	it("should toggle listening state", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		// Start listening
		act(() => {
			result.current.toggleListening()
		})

		expect(mockSpeechRecognition.start).toHaveBeenCalled()

		// Simulate onstart event
		act(() => {
			mockSpeechRecognition.onstart?.(new Event("start"))
		})

		expect(result.current.isListening).toBe(true)

		// Stop listening
		act(() => {
			result.current.toggleListening()
		})

		expect(mockSpeechRecognition.stop).toHaveBeenCalled()
	})

	it("should handle speech recognition results", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		// Start listening
		act(() => {
			result.current.startListening()
		})

		// Simulate speech recognition result
		const mockEvent = {
			resultIndex: 0,
			results: [
				{
					isFinal: true,
					0: { transcript: "Hello world", confidence: 0.9 },
					length: 1,
				},
			],
		}

		act(() => {
			mockSpeechRecognition.onresult?.(mockEvent)
		})

		expect(result.current.transcript).toBe("Hello world")
		expect(result.current.interimTranscript).toBe("")
	})

	it("should handle interim results", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		// Start listening
		act(() => {
			result.current.startListening()
		})

		// Simulate interim result
		const mockEvent = {
			resultIndex: 0,
			results: [
				{
					isFinal: false,
					0: { transcript: "Hello", confidence: 0.8 },
					length: 1,
				},
			],
		}

		act(() => {
			mockSpeechRecognition.onresult?.(mockEvent)
		})

		expect(result.current.transcript).toBe("")
		expect(result.current.interimTranscript).toBe("Hello")
	})

	it("should handle errors", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		// Start listening
		act(() => {
			result.current.startListening()
		})

		// Simulate error
		const mockError = {
			error: "network",
			message: "Network error",
		}

		act(() => {
			mockSpeechRecognition.onerror?.(mockError)
		})

		expect(result.current.error).toBe("chat:voiceToText.errors.network")
		expect(result.current.isListening).toBe(false)
	})

	it("should clear transcript", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		// Set some transcript
		act(() => {
			result.current.startListening()
		})

		const mockEvent = {
			resultIndex: 0,
			results: [
				{
					isFinal: true,
					0: { transcript: "Test message", confidence: 0.9 },
					length: 1,
				},
			],
		}

		act(() => {
			mockSpeechRecognition.onresult?.(mockEvent)
		})

		expect(result.current.transcript).toBe("Test message")

		// Clear transcript
		act(() => {
			result.current.clearTranscript()
		})

		expect(result.current.transcript).toBe("")
		expect(result.current.interimTranscript).toBe("")
		expect(result.current.error).toBe(null)
	})

	it("should handle no-speech error", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		act(() => {
			result.current.startListening()
		})

		const mockError = {
			error: "no-speech",
		}

		act(() => {
			mockSpeechRecognition.onerror?.(mockError)
		})

		expect(result.current.error).toBe("chat:voiceToText.errors.noSpeech")
	})

	it("should handle audio-capture error", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		act(() => {
			result.current.startListening()
		})

		const mockError = {
			error: "audio-capture",
		}

		act(() => {
			mockSpeechRecognition.onerror?.(mockError)
		})

		expect(result.current.error).toBe("chat:voiceToText.errors.audioCapture")
	})

	it("should handle not-allowed error", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		act(() => {
			result.current.startListening()
		})

		const mockError = {
			error: "not-allowed",
		}

		act(() => {
			mockSpeechRecognition.onerror?.(mockError)
		})

		expect(result.current.error).toBe("chat:voiceToText.errors.notAllowed")
	})

	it("should handle generic error", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		act(() => {
			result.current.startListening()
		})

		const mockError = {
			error: "unknown-error",
		}

		act(() => {
			mockSpeechRecognition.onerror?.(mockError)
		})

		expect(result.current.error).toBe("chat:voiceToText.errors.generic: unknown-error")
	})

	it("should set error when trying to start on unsupported browser", () => {
		// Remove SpeechRecognition API
		Object.defineProperty(window, "SpeechRecognition", {
			writable: true,
			value: undefined,
		})
		Object.defineProperty(window, "webkitSpeechRecognition", {
			writable: true,
			value: undefined,
		})

		const { result } = renderHook(() => useSpeechRecognition())

		act(() => {
			result.current.startListening()
		})

		expect(result.current.error).toBe("chat:voiceToText.errors.notSupported")
	})

	it("should handle multiple sequential transcripts", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		act(() => {
			result.current.startListening()
		})

		// First transcript
		const mockEvent1 = {
			resultIndex: 0,
			results: [
				{
					isFinal: true,
					0: { transcript: "First message", confidence: 0.9 },
					length: 1,
				},
			],
		}

		act(() => {
			mockSpeechRecognition.onresult?.(mockEvent1)
		})

		expect(result.current.transcript).toBe("First message")

		// Second transcript
		const mockEvent2 = {
			resultIndex: 1,
			results: [
				{
					isFinal: true,
					0: { transcript: "First message", confidence: 0.9 },
					length: 1,
				},
				{
					isFinal: true,
					0: { transcript: " Second message", confidence: 0.9 },
					length: 1,
				},
			],
		}

		act(() => {
			mockSpeechRecognition.onresult?.(mockEvent2)
		})

		expect(result.current.transcript).toBe("First message Second message")
	})

	it("should combine interim transcript with final on stop", () => {
		const { result } = renderHook(() => useSpeechRecognition())

		act(() => {
			result.current.startListening()
		})

		// Simulate onstart
		act(() => {
			mockSpeechRecognition.onstart?.(new Event("start"))
		})

		// Add interim transcript
		const mockEvent = {
			resultIndex: 0,
			results: [
				{
					isFinal: false,
					0: { transcript: "Interim text", confidence: 0.8 },
					length: 1,
				},
			],
		}

		act(() => {
			mockSpeechRecognition.onresult?.(mockEvent)
		})

		expect(result.current.interimTranscript).toBe("Interim text")

		// Stop listening
		act(() => {
			result.current.stopListening()
		})

		expect(result.current.transcript).toBe("Interim text")
		expect(result.current.interimTranscript).toBe("")
	})
})
