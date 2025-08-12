import axios, { AxiosRequestConfig, AxiosResponse } from "axios"
import { Readable } from "stream"

/**
 * Creates a fetch-compatible wrapper around axios for use with OpenAI SDK.
 * This adapter allows axios to be used instead of the native fetch API,
 * which is important for proxy support in VSCode extensions where the
 * patched fetch may not work correctly with certain proxy configurations
 * (particularly SOCKS5 proxies).
 *
 * @param useAxiosForProxy - If true, uses axios instead of native fetch
 * @returns A fetch-compatible function
 */
export function createAxiosFetchAdapter(useAxiosForProxy: boolean = false): typeof fetch {
	// If not using axios for proxy, return native fetch
	if (!useAxiosForProxy) {
		return fetch
	}

	// Return an axios-based fetch implementation
	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url

		// Convert RequestInit to AxiosRequestConfig
		const config: AxiosRequestConfig = {
			url,
			method: (init?.method || "GET") as any,
			headers: init?.headers as any,
			data: init?.body,
			// Important: Set responseType to 'stream' for streaming responses
			responseType: "stream",
			// Disable automatic decompression to let the consumer handle it
			decompress: false,
			// Don't throw on HTTP error status codes
			validateStatus: () => true,
		}

		try {
			const axiosResponse: AxiosResponse<Readable> = await axios(config)

			// Convert axios response to fetch Response
			return createResponseFromAxios(axiosResponse)
		} catch (error: any) {
			// Handle network errors
			throw new TypeError(`Failed to fetch: ${error.message}`)
		}
	}
}

/**
 * Converts an Axios response to a fetch Response object
 */
function createResponseFromAxios(axiosResponse: AxiosResponse<Readable>): Response {
	const { status, statusText, headers, data } = axiosResponse

	// Convert Node.js Readable stream to Web ReadableStream
	const readableStream = nodeStreamToWebStream(data)

	// Create Response with proper headers
	const responseHeaders = new Headers()
	Object.entries(headers).forEach(([key, value]) => {
		if (value !== undefined) {
			responseHeaders.set(key, String(value))
		}
	})

	return new Response(readableStream, {
		status,
		statusText,
		headers: responseHeaders,
	})
}

/**
 * Converts a Node.js Readable stream to a Web ReadableStream
 */
function nodeStreamToWebStream(nodeStream: Readable): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			nodeStream.on("data", (chunk) => {
				// Ensure chunk is a Uint8Array
				if (typeof chunk === "string") {
					controller.enqueue(new TextEncoder().encode(chunk))
				} else if (chunk instanceof Buffer) {
					controller.enqueue(new Uint8Array(chunk))
				} else {
					controller.enqueue(chunk)
				}
			})

			nodeStream.on("end", () => {
				controller.close()
			})

			nodeStream.on("error", (err) => {
				controller.error(err)
			})
		},
		cancel() {
			nodeStream.destroy()
		},
	})
}

/**
 * Checks if the current environment suggests that axios should be used
 * instead of fetch for proxy support. This can be based on:
 * - Presence of proxy environment variables
 * - VSCode proxy settings
 * - User configuration
 */
export function shouldUseAxiosForProxy(): boolean {
	// Check for common proxy environment variables
	const proxyVars = [
		"HTTP_PROXY",
		"http_proxy",
		"HTTPS_PROXY",
		"https_proxy",
		"ALL_PROXY",
		"all_proxy",
		"NO_PROXY",
		"no_proxy",
	]

	const hasProxyEnvVars = proxyVars.some((varName) => process.env[varName])

	// For now, we'll enable axios for proxy support if proxy env vars are detected
	// This can be extended to check VSCode settings or user preferences
	return hasProxyEnvVars
}
