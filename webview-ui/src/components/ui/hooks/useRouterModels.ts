import { useQuery } from "@tanstack/react-query"

import { RouterModels } from "@roo/api"
import { ExtensionMessage } from "@roo/ExtensionMessage"

import { vscode } from "@src/utils/vscode"

type UseRouterModelsOptions = {
	providers?: string[] // subset filter (e.g. ["roo"])
	enabled?: boolean // gate fetching entirely
}

let __routerModelsRequestCount = 0

const getRouterModels = async (providers?: string[]) =>
	new Promise<RouterModels>((resolve, reject) => {
		const requestId = ++__routerModelsRequestCount
		const cleanup = () => {
			window.removeEventListener("message", handler)
		}

		const timeout = setTimeout(() => {
			cleanup()
			reject(new Error("Router models request timed out"))
		}, 10000)

		const handler = (event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "routerModels") {
				clearTimeout(timeout)
				cleanup()

				if (message.routerModels) {
					const keys = Object.keys(message.routerModels || {})
					console.debug(
						`[useRouterModels] response #${requestId} providers=${JSON.stringify(providers || "all")} keys=${keys.join(",")}`,
					)
					resolve(message.routerModels)
				} else {
					reject(new Error("No router models in response"))
				}
			}
		}

		window.addEventListener("message", handler)
		console.debug(
			`[useRouterModels] request #${requestId} providers=${JSON.stringify(providers && providers.length ? providers : "all")}`,
		)
		if (providers && providers.length > 0) {
			vscode.postMessage({ type: "requestRouterModels", values: { providers } })
		} else {
			vscode.postMessage({ type: "requestRouterModels" })
		}
	})

export const useRouterModels = (opts: UseRouterModelsOptions = {}) => {
	const providers = opts.providers && opts.providers.length ? [...opts.providers] : undefined
	return useQuery({
		queryKey: ["routerModels", providers?.slice().sort().join(",") || "all"],
		queryFn: () => getRouterModels(providers),
		enabled: opts.enabled !== false,
	})
}
