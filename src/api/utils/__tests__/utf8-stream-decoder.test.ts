import { describe, it, expect, beforeEach } from "vitest"
import { UTF8StreamDecoder } from "../utf8-stream-decoder"

describe("UTF8StreamDecoder", () => {
	let decoder: UTF8StreamDecoder

	beforeEach(() => {
		decoder = new UTF8StreamDecoder()
	})

	describe("decode", () => {
		it("should handle complete ASCII strings", () => {
			const result = decoder.decode("Hello World")
			expect(result).toBe("Hello World")
		})

		it("should handle complete UTF-8 strings", () => {
			const result = decoder.decode("Hello 世界 🌍")
			expect(result).toBe("Hello 世界 🌍")
		})

		it("should handle multi-byte UTF-8 characters split across chunks", () => {
			// "世" (U+4E16) in UTF-8 is 0xE4 0xB8 0x96
			// Split it across two chunks
			const chunk1 = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0xe4]) // "Hello " + first byte of "世"
			const chunk2 = new Uint8Array([0xb8, 0x96]) // remaining bytes of "世"

			const result1 = decoder.decode(chunk1)
			expect(result1).toBe("Hello ") // Should only decode complete characters

			const result2 = decoder.decode(chunk2)
			expect(result2).toBe("世") // Should complete the character
		})

		it("should handle 4-byte emoji split across chunks", () => {
			// "🌍" (U+1F30D) in UTF-8 is 0xF0 0x9F 0x8C 0x8D
			// Split it across multiple chunks
			const chunk1 = new Uint8Array([0x48, 0x69, 0x20, 0xf0]) // "Hi " + first byte
			const chunk2 = new Uint8Array([0x9f, 0x8c]) // middle bytes
			const chunk3 = new Uint8Array([0x8d, 0x21]) // last byte + "!"

			const result1 = decoder.decode(chunk1)
			expect(result1).toBe("Hi ") // Should only decode complete characters

			const result2 = decoder.decode(chunk2)
			expect(result2).toBe("") // Still incomplete

			const result3 = decoder.decode(chunk3)
			expect(result3).toBe("🌍!") // Should complete the emoji and include the exclamation
		})

		it("should handle string chunks with potential partial sequences", () => {
			// Simulate a string that ends with a partial UTF-8 sequence marker
			const chunk1 = "Hello 世"
			const chunk2 = "界 World"

			const result1 = decoder.decode(chunk1)
			const result2 = decoder.decode(chunk2)

			expect(result1 + result2).toBe("Hello 世界 World")
		})

		it("should handle replacement characters properly", () => {
			// Test with actual replacement characters (U+FFFD)
			const chunk = "Hello \uFFFD World"
			const result = decoder.decode(chunk)
			expect(result).toBe("Hello \uFFFD World")
		})

		it("should handle replacement characters in the middle of text", () => {
			// Replacement characters in the middle should be preserved
			const chunk = "Hello \uFFFD World"
			const result = decoder.decode(chunk)
			expect(result).toBe("Hello \uFFFD World")
		})

		it("should handle multiple replacement characters", () => {
			// Multiple replacement characters might indicate encoding issues
			// but we should preserve them as they might be intentional
			const chunk1 = "Hello World"
			const chunk2 = " Test"

			const result1 = decoder.decode(chunk1)
			expect(result1).toBe("Hello World")

			const result2 = decoder.decode(chunk2)
			expect(result2).toBe(" Test")
		})

		it("should handle empty chunks", () => {
			const result = decoder.decode("")
			expect(result).toBe("")
		})

		it("should handle Uint8Array empty chunks", () => {
			const result = decoder.decode(new Uint8Array(0))
			expect(result).toBe("")
		})
	})

	describe("finalize", () => {
		it("should return empty string when no buffered content", () => {
			const result = decoder.finalize()
			expect(result).toBe("")
		})

		it("should decode remaining buffered content", () => {
			// Send an incomplete sequence
			const chunk = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0xe4, 0xb8]) // "Hello " + partial "世"
			decoder.decode(chunk)

			// Finalize should attempt to decode what's left (may produce replacement character)
			const result = decoder.finalize()
			expect(result.length).toBeGreaterThan(0) // Should produce something (likely with replacement char)
		})

		it("should clear buffer after finalize", () => {
			const chunk = new Uint8Array([0xe4]) // Partial character
			decoder.decode(chunk)

			decoder.finalize()
			const secondFinalize = decoder.finalize()
			expect(secondFinalize).toBe("") // Buffer should be empty
		})
	})

	describe("reset", () => {
		it("should clear the buffer", () => {
			// Add some partial data
			const chunk = new Uint8Array([0xe4, 0xb8]) // Partial character
			decoder.decode(chunk)

			// Reset
			decoder.reset()

			// Should start fresh
			const result = decoder.decode("Hello")
			expect(result).toBe("Hello")

			// Finalize should return nothing
			const final = decoder.finalize()
			expect(final).toBe("")
		})
	})

	describe("large file handling", () => {
		it("should handle large text with many UTF-8 characters", () => {
			// Simulate a large file with mixed content
			const largeText = "初めまして、私は人工知能です。" + "世界は美しい。".repeat(100) + "🌍🌎🌏"

			// Split into random chunks to simulate streaming
			const chunkSize = 17 // Prime number to ensure we split across character boundaries
			const chunks: string[] = []
			for (let i = 0; i < largeText.length; i += chunkSize) {
				chunks.push(largeText.slice(i, i + chunkSize))
			}

			// Decode all chunks
			let result = ""
			for (const chunk of chunks) {
				result += decoder.decode(chunk)
			}
			result += decoder.finalize()

			// Should reconstruct the original text
			expect(result).toBe(largeText)
		})

		it("should handle simulated vLLM output with potential garbling", () => {
			// Simulate what might come from vLLM with large outputs
			const chunks = [
				"def process_data(items):\n",
				'    """Process a list of items',
				" with special handling for UTF-8",
				" characters like 你好", // Chinese characters might be split
				'世界"""\n    result = []\n',
				"    for item in items:\n",
				"        # Handle special chars: €£¥",
				"🔧🔨\n",
				"        result.append(transform(item))\n",
				"    return result",
			]

			let decoded = ""
			for (const chunk of chunks) {
				decoded += decoder.decode(chunk)
			}
			decoded += decoder.finalize()

			// Should contain all the expected content without garbling
			expect(decoded).toContain("你好世界")
			expect(decoded).toContain("€£¥")
			expect(decoded).toContain("🔧🔨")
			expect(decoded).not.toContain("\uFFFD") // Should not have replacement characters
		})
	})
})
