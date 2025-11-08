/* eslint-disable */
import fs from "fs/promises"
import path from "path"
import os from "os"
import { getOpenAiNativeModels, openAiNativeModels } from "../openai.js"

describe("getOpenAiNativeModels()", () => {
	test("returns built-ins when no user file exists", () => {
		delete (process as any).env.ROO_OPENAI_NATIVE_MODELS_PATH
		const models = getOpenAiNativeModels()
		// Should at least contain all built-ins
		for (const key of Object.keys(openAiNativeModels)) {
			expect(models).toHaveProperty(key)
		}
	})

	test("merges extras from ROO_OPENAI_NATIVE_MODELS_JSON env", () => {
		const extras = {
			"custom/openai-native-test": {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsPromptCache: false,
				supportsImages: false,
				description: "Custom OpenAI Native test model",
			},
		}

		;(process as any).env.ROO_OPENAI_NATIVE_MODELS_JSON = JSON.stringify(extras)

		const models = getOpenAiNativeModels()
		expect(models["custom/openai-native-test"]).toBeDefined()
		expect(models["custom/openai-native-test"]?.description).toBe("Custom OpenAI Native test model")

		delete (process as any).env.ROO_OPENAI_NATIVE_MODELS_JSON
	})

	test("ignores invalid JSON and returns built-ins", async () => {
		const tmp = path.join(os.tmpdir(), `openai-native-invalid-${Date.now()}.json`)
		;(process as any).env.ROO_OPENAI_NATIVE_MODELS_PATH = tmp
		await fs.writeFile(tmp, "{not-json", "utf8")

		const models = getOpenAiNativeModels()
		// Should not throw and should still include built-ins
		for (const key of Object.keys(openAiNativeModels)) {
			expect(models).toHaveProperty(key)
		}

		await fs.unlink(tmp).catch(() => {})
		delete (process as any).env.ROO_OPENAI_NATIVE_MODELS_PATH
	})
})
