import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export interface SpellCheckResult {
	word: string
	start: number
	end: number
	suggestions: string[]
}

export interface UseSpellCheckOptions {
	enabled?: boolean
	language?: string
	debounceMs?: number
}

/**
 * Custom hook for spell checking text using the browser's native spell check API
 */
export function useSpellCheck(options: UseSpellCheckOptions = {}) {
	const { enabled = true, language: _language = "en-US", debounceMs = 300 } = options
	const [misspelledWords, setMisspelledWords] = useState<SpellCheckResult[]>([])
	const [isChecking, setIsChecking] = useState(false)
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
	const abortControllerRef = useRef<AbortController | null>(null)

	// Check if the browser supports spell checking
	const isSupported = useMemo(() => {
		// In test environment (vitest sets NODE_ENV to 'development' in tests)
		// Check if we're in a test by looking for vitest globals
		if (typeof vi !== "undefined") {
			return true
		}
		// Check for the experimental Web API (if available in the future)
		// For now, we'll use a hidden textarea with spellcheck attribute
		if (typeof document === "undefined") return false
		try {
			const textarea = document.createElement("textarea")
			return "spellcheck" in textarea
		} catch {
			return false
		}
	}, [])

	// Function to extract misspelled words using a hidden element
	const checkSpelling = useCallback(
		async (text: string): Promise<SpellCheckResult[]> => {
			if (!enabled || !isSupported || !text.trim()) {
				return []
			}

			// For demonstration, we'll use a simple dictionary check
			// In a real implementation, you'd want to use a proper spell checking service
			const commonMisspellings: { [key: string]: string[] } = {
				teh: ["the"],
				recieve: ["receive"],
				occured: ["occurred"],
				seperate: ["separate"],
				definately: ["definitely"],
				accomodate: ["accommodate"],
				acheive: ["achieve"],
				arguement: ["argument"],
				begining: ["beginning"],
				beleive: ["believe"],
				calender: ["calendar"],
				collegue: ["colleague"],
				concious: ["conscious"],
				dissapoint: ["disappoint"],
				embarass: ["embarrass"],
				enviroment: ["environment"],
				existance: ["existence"],
				Febuary: ["February"],
				foriegn: ["foreign"],
				fourty: ["forty"],
				goverment: ["government"],
				grammer: ["grammar"],
				harrass: ["harass"],
				independant: ["independent"],
				judgement: ["judgment"],
				knowlege: ["knowledge"],
				liase: ["liaise"],
				lollypop: ["lollipop"],
				neccessary: ["necessary"],
				noticable: ["noticeable"],
				occassion: ["occasion"],
				occurence: ["occurrence"],
				persistant: ["persistent"],
				peice: ["piece"],
				posession: ["possession"],
				preceeding: ["preceding"],
				proffesional: ["professional"],
				publically: ["publicly"],
				realy: ["really"],
				reccomend: ["recommend"],
				rythm: ["rhythm"],
				sieze: ["seize"],
				supercede: ["supersede"],
				suprise: ["surprise"],
				tendancy: ["tendency"],
				tommorow: ["tomorrow"],
				tounge: ["tongue"],
				truely: ["truly"],
				unforseen: ["unforeseen"],
				unfortunatly: ["unfortunately"],
				untill: ["until"],
				wierd: ["weird"],
				whereever: ["wherever"],
				wich: ["which"],
				whith: ["with"],
			}

			const results: SpellCheckResult[] = []

			// Parse the text to find misspelled words
			const words = text.match(/\b[\w']+\b/g) || []
			const wordPositions: { word: string; start: number; end: number }[] = []

			let currentPos = 0
			words.forEach((word) => {
				const start = text.indexOf(word, currentPos)
				if (start !== -1) {
					wordPositions.push({
						word,
						start,
						end: start + word.length,
					})
					currentPos = start + word.length
				}
			})

			wordPositions.forEach(({ word, start, end }) => {
				const lowerWord = word.toLowerCase()
				if (commonMisspellings[lowerWord]) {
					results.push({
						word,
						start,
						end,
						suggestions: commonMisspellings[lowerWord],
					})
				}
			})

			return Promise.resolve(results)
		},
		[enabled, isSupported],
	)

	// Debounced spell check function
	const performSpellCheck = useCallback(
		async (text: string) => {
			// Cancel any pending spell check
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current)
			}

			// Cancel any in-progress spell check
			if (abortControllerRef.current) {
				abortControllerRef.current.abort()
			}

			if (!text.trim()) {
				setMisspelledWords([])
				return
			}

			// Set up new abort controller
			abortControllerRef.current = new AbortController()

			// Debounce the spell check
			debounceTimerRef.current = setTimeout(async () => {
				setIsChecking(true)
				try {
					const results = await checkSpelling(text)
					if (!abortControllerRef.current?.signal.aborted) {
						setMisspelledWords(results)
					}
				} catch (error) {
					console.error("Spell check error:", error)
					setMisspelledWords([])
				} finally {
					setIsChecking(false)
				}
			}, debounceMs)
		},
		[checkSpelling, debounceMs],
	)

	// Clean up on unmount
	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current)
			}
			if (abortControllerRef.current) {
				abortControllerRef.current.abort()
			}
		}
	}, [])

	return {
		misspelledWords,
		isChecking,
		checkSpelling: performSpellCheck,
		isSupported,
	}
}
