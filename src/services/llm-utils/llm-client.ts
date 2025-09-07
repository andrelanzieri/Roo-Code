import { Anthropic } from "@anthropic-ai/sdk"
import { ProviderSettings } from "@roo-code/types"
import { buildApiHandler, ApiHandler } from "../../api"
import { SubLlmConfig, SubLlmMode, GenerateOptions, GenerateJsonOptions } from "./types"
import { ProviderSettingsManager } from "../../core/config/ProviderSettingsManager"
import * as vscode from "vscode"

/**
 * Client for sub-LLM operations with provider selection and budget management
 */
export class LlmClient {
	private apiHandler: ApiHandler | null = null
	private config: SubLlmConfig
	private providerSettings: ProviderSettings | null = null
	private dailyCost: number = 0
	private lastCostReset: Date = new Date()

	constructor(
		private readonly context: vscode.ExtensionContext,
		config: SubLlmConfig,
	) {
		this.config = config
	}

	/**
	 * Initialize the LLM client with appropriate provider
	 */
	async initialize(): Promise<void> {
		if (!this.config.enabled) {
			return
		}

		// Get provider settings based on mode
		if (this.config.modelMode === "mirror") {
			// Mirror the chat model settings
			const settingsManager = new ProviderSettingsManager(this.context)
			const profiles = await settingsManager.export()
			const currentProfile = profiles.apiConfigs[profiles.currentApiConfigName]

			if (currentProfile) {
				this.providerSettings = currentProfile as ProviderSettings
			}
		} else if (this.config.modelMode === "custom" && this.config.customProvider) {
			// Use custom provider settings
			this.providerSettings = this.config.customProvider
		}

		if (this.providerSettings) {
			this.apiHandler = buildApiHandler(this.providerSettings)
		}
	}

	/**
	 * Check and update daily cost budget
	 */
	private checkBudget(estimatedCost: number): boolean {
		const now = new Date()

		// Reset daily cost if it's a new day
		if (now.toDateString() !== this.lastCostReset.toDateString()) {
			this.dailyCost = 0
			this.lastCostReset = now
		}

		// Check if adding this cost would exceed the cap
		if (this.config.dailyCostCapUSD && this.dailyCost + estimatedCost > this.config.dailyCostCapUSD) {
			return false
		}

		return true
	}

	/**
	 * Update the daily cost tracker
	 */
	private updateCost(cost: number): void {
		this.dailyCost += cost
	}

	/**
	 * Generate text completion
	 */
	async generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
		if (!this.config.enabled || !this.apiHandler) {
			throw new Error("LLM client not initialized or disabled")
		}

		// Estimate cost (simplified - would need actual token counting)
		const estimatedCost = 0.001 // Placeholder
		if (!this.checkBudget(estimatedCost)) {
			throw new Error("Daily LLM cost budget exceeded")
		}

		const systemPrompt = options.systemPrompt || "You are a helpful assistant."
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: prompt,
			},
		]

		try {
			const stream = this.apiHandler.createMessage(systemPrompt, messages)
			let result = ""

			for await (const chunk of stream) {
				if (chunk.type === "text") {
					result += chunk.text
				} else if (chunk.type === "usage") {
					// Calculate actual cost based on usage
					const actualCost = this.calculateCost(chunk.inputTokens || 0, chunk.outputTokens || 0)
					this.updateCost(actualCost)
				}
			}

			return result
		} catch (error) {
			console.error("[LlmClient] Error generating text:", error)
			throw error
		}
	}

	/**
	 * Generate JSON with validation
	 */
	async generateJson<T>(prompt: string, options: GenerateJsonOptions<T> = {}): Promise<T> {
		const jsonPrompt = `${prompt}\n\nRespond with valid JSON only, no additional text or markdown.`

		let attempts = 0
		const maxRetries = options.maxRetries || 3

		while (attempts < maxRetries) {
			attempts++

			try {
				const response = await this.generateText(jsonPrompt, options)

				// Extract JSON from response (handle markdown fences)
				const jsonStr = this.extractJson(response)
				const parsed = JSON.parse(jsonStr)

				// Validate with schema if provided
				if (options.schema) {
					const result = options.schema.safeParse(parsed)
					if (!result.success) {
						if (options.retryOnValidationFailure && attempts < maxRetries) {
							continue
						}
						throw new Error(`JSON validation failed: ${result.error.message}`)
					}
					return result.data
				}

				return parsed as T
			} catch (error) {
				if (attempts >= maxRetries) {
					throw error
				}
			}
		}

		throw new Error("Failed to generate valid JSON after retries")
	}

	/**
	 * Extract JSON from a string that might contain markdown fences
	 */
	private extractJson(text: string): string {
		// Remove markdown code fences
		const fencePattern = /```(?:json)?\s*([\s\S]*?)```/
		const match = text.match(fencePattern)
		if (match) {
			return match[1].trim()
		}

		// Try to find first complete JSON object
		const firstBrace = text.indexOf("{")
		const firstBracket = text.indexOf("[")

		if (firstBrace === -1 && firstBracket === -1) {
			return text.trim()
		}

		const start =
			firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket) ? firstBrace : firstBracket

		// Simple bracket counting to find end
		let depth = 0
		let inString = false
		let escape = false

		for (let i = start; i < text.length; i++) {
			const char = text[i]

			if (escape) {
				escape = false
				continue
			}

			if (char === "\\") {
				escape = true
				continue
			}

			if (char === '"') {
				inString = !inString
				continue
			}

			if (!inString) {
				if (char === "{" || char === "[") {
					depth++
				} else if (char === "}" || char === "]") {
					depth--
					if (depth === 0) {
						return text.substring(start, i + 1)
					}
				}
			}
		}

		return text.substring(start).trim()
	}

	/**
	 * Calculate cost based on token usage
	 * This is a simplified version - actual costs vary by model
	 */
	private calculateCost(inputTokens: number, outputTokens: number): number {
		// Simplified cost calculation (would need model-specific rates)
		const inputCostPer1k = 0.003
		const outputCostPer1k = 0.015

		return (inputTokens / 1000) * inputCostPer1k + (outputTokens / 1000) * outputCostPer1k
	}

	/**
	 * Get current budget status
	 */
	getBudgetStatus(): { dailyCost: number; remaining: number | null } {
		const now = new Date()

		// Reset if new day
		if (now.toDateString() !== this.lastCostReset.toDateString()) {
			this.dailyCost = 0
			this.lastCostReset = now
		}

		return {
			dailyCost: this.dailyCost,
			remaining: this.config.dailyCostCapUSD ? this.config.dailyCostCapUSD - this.dailyCost : null,
		}
	}
}
