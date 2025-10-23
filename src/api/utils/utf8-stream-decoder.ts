/**
 * UTF-8 Stream Decoder
 *
 * This utility handles proper UTF-8 decoding for streaming responses,
 * ensuring that multi-byte UTF-8 characters split across chunk boundaries
 * are properly handled without producing garbled output.
 *
 * This fixes issues with large outputs from models like vLLM where
 * characters can be split across streaming chunks.
 */
export class UTF8StreamDecoder {
	private buffer: Uint8Array = new Uint8Array(0)
	private decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true })

	/**
	 * Decodes a chunk of data, handling partial UTF-8 sequences
	 * @param chunk - The chunk to decode (string or Uint8Array)
	 * @returns The decoded string, with partial sequences buffered
	 */
	decode(chunk: string | Uint8Array): string {
		// If chunk is already a string, check if it needs special handling
		if (typeof chunk === "string") {
			// Check for potential UTF-8 issues in the string
			// This can happen when the OpenAI SDK doesn't properly handle chunk boundaries
			return this.handleStringChunk(chunk)
		}

		// Convert to Uint8Array if needed
		const bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(chunk)

		// Combine with any buffered bytes from previous chunks
		const combined = this.combineBuffers(this.buffer, bytes)

		// Find the last complete UTF-8 character boundary
		const lastCompleteIndex = this.findLastCompleteCharBoundary(combined)

		if (lastCompleteIndex === -1) {
			// No complete characters, buffer everything
			this.buffer = combined
			return ""
		}

		// Decode the complete portion
		const complete = combined.slice(0, lastCompleteIndex)
		const decoded = this.decoder.decode(complete, { stream: true })

		// Buffer the incomplete portion
		this.buffer = combined.slice(lastCompleteIndex)

		return decoded
	}

	/**
	 * Handles string chunks that might contain garbled characters
	 * @param chunk - The string chunk to process
	 * @returns The cleaned string
	 */
	private handleStringChunk(chunk: string): string {
		// For string chunks, we mainly need to handle cases where
		// the chunk ends with an incomplete UTF-8 sequence
		// We'll be conservative and only buffer incomplete sequences at the end

		// If the chunk appears to end with a partial UTF-8 sequence
		// (indicated by specific byte patterns when re-encoded)
		try {
			const encoder = new TextEncoder()
			const bytes = encoder.encode(chunk)

			// Check if the last few bytes could be a partial UTF-8 sequence
			const lastValid = this.findLastCompleteCharBoundary(bytes)
			if (lastValid > 0 && lastValid < bytes.length) {
				// We have a partial sequence at the end
				// Decode only the complete portion
				const validBytes = bytes.slice(0, lastValid)
				const decoded = this.decoder.decode(validBytes, { stream: true })

				// Buffer the incomplete portion for the next chunk
				this.buffer = bytes.slice(lastValid)
				return decoded
			}
		} catch (e) {
			// If re-encoding fails, just return the chunk as-is
			// The OpenAI SDK should already be handling most encoding properly
		}

		return chunk
	}

	/**
	 * Finalizes decoding, processing any remaining buffered bytes
	 * @returns Any remaining decoded text
	 */
	finalize(): string {
		if (this.buffer.length === 0) {
			return ""
		}

		// Decode whatever is left in the buffer
		// Use 'replace' mode to handle any incomplete sequences
		const decoded = new TextDecoder("utf-8", { fatal: false }).decode(this.buffer)
		this.buffer = new Uint8Array(0)
		return decoded
	}

	/**
	 * Combines two Uint8Arrays
	 */
	private combineBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
		const combined = new Uint8Array(a.length + b.length)
		combined.set(a, 0)
		combined.set(b, a.length)
		return combined
	}

	/**
	 * Finds the last complete UTF-8 character boundary in a byte array
	 * @param bytes - The byte array to check
	 * @returns The index after the last complete character, or -1 if none
	 */
	private findLastCompleteCharBoundary(bytes: Uint8Array): number {
		if (bytes.length === 0) return -1

		// Work backwards to find the last complete UTF-8 character
		for (let i = bytes.length; i > 0; i--) {
			const byte = bytes[i - 1]

			// Check if this is a valid UTF-8 sequence start or single byte
			if ((byte & 0x80) === 0) {
				// Single byte character (0xxxxxxx)
				return i
			} else if ((byte & 0xe0) === 0xc0) {
				// 2-byte sequence start (110xxxxx)
				if (i + 1 <= bytes.length && this.isValidContinuation(bytes, i, 1)) {
					return i + 1
				}
			} else if ((byte & 0xf0) === 0xe0) {
				// 3-byte sequence start (1110xxxx)
				if (i + 2 <= bytes.length && this.isValidContinuation(bytes, i, 2)) {
					return i + 2
				}
			} else if ((byte & 0xf8) === 0xf0) {
				// 4-byte sequence start (11110xxx)
				if (i + 3 <= bytes.length && this.isValidContinuation(bytes, i, 3)) {
					return i + 3
				}
			}
			// If we hit a continuation byte (10xxxxxx), keep going back
		}

		return -1
	}

	/**
	 * Checks if the continuation bytes are valid
	 */
	private isValidContinuation(bytes: Uint8Array, start: number, count: number): boolean {
		for (let i = 0; i < count; i++) {
			if (start + i >= bytes.length) return false
			const byte = bytes[start + i]
			// Continuation bytes must match 10xxxxxx
			if ((byte & 0xc0) !== 0x80) return false
		}
		return true
	}

	/**
	 * Resets the decoder state
	 */
	reset(): void {
		this.buffer = new Uint8Array(0)
	}
}
