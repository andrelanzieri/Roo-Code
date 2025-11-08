import { useQuery } from "@tanstack/react-query"
import type { ModelInfo } from "@roo-code/types"
import { vscode } from "@src/utils/vscode"

export type OpenAiNativeModelsRecord = Record<string, ModelInfo>

/**
 * Hook to fetch OpenAI Native models (built-in + custom from ~/.roo/models/openai-native.json)
 * from the extension host.
 */
export function useOpenAiNativeModels(enabled: boolean = true) {
	return useQuery<OpenAiNativeModelsRecord | undefined>({
		queryKey: ["openAiNativeModels"],
		queryFn: () => {
			return new Promise<OpenAiNativeModelsRecord | undefined>((resolve) => {
				const handleMessage = (event: MessageEvent) => {
					const message = event.data
					if (message.type === "openAiNativeModels") {
						window.removeEventListener("message", handleMessage)
						resolve(message.openAiNativeModels || undefined)
					}
				}

				window.addEventListener("message", handleMessage)

				// Request the models from the host
				vscode.postMessage({ type: "requestOpenAiNativeModels" })

				// Timeout after 5 seconds
				setTimeout(() => {
					window.removeEventListener("message", handleMessage)
					resolve(undefined)
				}, 5000)
			})
		},
		enabled,
		staleTime: Infinity, // Models don't change frequently
		retry: false,
	})
}
