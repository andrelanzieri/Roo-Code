import { useCallback, useEffect, useRef, useState } from "react"
import { useAppTranslation } from "@src/i18n/TranslationContext"

// Extend the Window interface to include the Web Speech API
interface IWindow extends Window {
	webkitSpeechRecognition: any
	SpeechRecognition: any
}

declare const window: IWindow

// Type definitions for the Web Speech API
interface SpeechRecognitionEvent extends Event {
	results: SpeechRecognitionResultList
	resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
	error: string
	message?: string
}

interface SpeechRecognitionResult {
	isFinal: boolean
	[index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
	transcript: string
	confidence: number
}

interface SpeechRecognitionResultList {
	length: number
	item(index: number): SpeechRecognitionResult
	[index: number]: SpeechRecognitionResult
}

export interface UseSpeechRecognitionReturn {
	isListening: boolean
	isSupported: boolean
	transcript: string
	interimTranscript: string
	error: string | null
	startListening: () => void
	stopListening: () => void
	toggleListening: () => void
	clearTranscript: () => void
}

export const useSpeechRecognition = (): UseSpeechRecognitionReturn => {
	const { t } = useAppTranslation()
	const [isListening, setIsListening] = useState(false)
	const [transcript, setTranscript] = useState("")
	const [interimTranscript, setInterimTranscript] = useState("")
	const [error, setError] = useState<string | null>(null)
	const recognitionRef = useRef<any>(null)
	const [isSupported, setIsSupported] = useState(false)

	// Check for browser support
	useEffect(() => {
		if (typeof window !== "undefined") {
			const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
			setIsSupported(!!SpeechRecognition)
		}
	}, [])

	// Initialize speech recognition
	useEffect(() => {
		if (!isSupported) return

		const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
		const recognition = new SpeechRecognition()

		// Configure recognition
		recognition.continuous = true
		recognition.interimResults = true
		recognition.maxAlternatives = 1

		// Set language based on user settings (defaulting to browser language)
		recognition.lang = navigator.language || "en-US"

		// Handle results
		recognition.onresult = (event: SpeechRecognitionEvent) => {
			let interimText = ""
			let finalText = ""

			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i]
				const transcriptText = result[0].transcript

				if (result.isFinal) {
					finalText += transcriptText
				} else {
					interimText += transcriptText
				}
			}

			if (finalText) {
				setTranscript((prev) => prev + finalText)
				setInterimTranscript("")
			} else {
				setInterimTranscript(interimText)
			}
			setError(null)
		}

		// Handle errors
		recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
			let errorMessage = ""

			switch (event.error) {
				case "no-speech":
					errorMessage = t("chat:voiceToText.errors.noSpeech")
					break
				case "audio-capture":
					errorMessage = t("chat:voiceToText.errors.audioCapture")
					break
				case "not-allowed":
					errorMessage = t("chat:voiceToText.errors.notAllowed")
					break
				case "network":
					errorMessage = t("chat:voiceToText.errors.network")
					break
				case "aborted":
					errorMessage = t("chat:voiceToText.errors.aborted")
					break
				default:
					errorMessage = t("chat:voiceToText.errors.generic") + `: ${event.error}`
			}

			setError(errorMessage)
			setIsListening(false)
		}

		// Handle end event
		recognition.onend = () => {
			setIsListening(false)
			setInterimTranscript("")
		}

		// Handle start event
		recognition.onstart = () => {
			setIsListening(true)
			setError(null)
		}

		recognitionRef.current = recognition

		// Cleanup
		return () => {
			if (recognitionRef.current) {
				recognitionRef.current.stop()
			}
		}
	}, [isSupported, t])

	const startListening = useCallback(() => {
		if (!isSupported) {
			setError(t("chat:voiceToText.errors.notSupported"))
			return
		}

		if (recognitionRef.current && !isListening) {
			try {
				recognitionRef.current.start()
			} catch (_err) {
				// Recognition is already started
				console.warn("Speech recognition already started")
			}
		}
	}, [isSupported, isListening, t])

	const stopListening = useCallback(() => {
		if (recognitionRef.current && isListening) {
			recognitionRef.current.stop()
			// Combine any interim transcript with the final transcript
			if (interimTranscript) {
				setTranscript((prev) => prev + interimTranscript)
				setInterimTranscript("")
			}
		}
	}, [isListening, interimTranscript])

	const toggleListening = useCallback(() => {
		if (isListening) {
			stopListening()
		} else {
			startListening()
		}
	}, [isListening, startListening, stopListening])

	const clearTranscript = useCallback(() => {
		setTranscript("")
		setInterimTranscript("")
		setError(null)
	}, [])

	return {
		isListening,
		isSupported,
		transcript,
		interimTranscript,
		error,
		startListening,
		stopListening,
		toggleListening,
		clearTranscript,
	}
}
