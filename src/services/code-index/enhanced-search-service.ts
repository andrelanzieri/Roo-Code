import * as path from "path"
import * as vscode from "vscode"
import { VectorStoreSearchResult } from "./interfaces"
import { IEmbedder } from "./interfaces/embedder"
import { IVectorStore } from "./interfaces/vector-store"
import { CodeIndexConfigManager } from "./config-manager"
import { CodeIndexStateManager } from "./state-manager"
import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"
import { LlmClient, QueryRewriter, Reranker, SubLlmConfig, QueryVariant } from "../llm-utils"
import { Package } from "../../shared/package"

/**
 * Enhanced search service with LLM-assisted query rewriting and reranking
 */
export class EnhancedCodeIndexSearchService {
	private llmClient: LlmClient | null = null
	private queryRewriter: QueryRewriter | null = null
	private reranker: Reranker | null = null
	private subLlmConfig: SubLlmConfig | null = null

	constructor(
		private readonly configManager: CodeIndexConfigManager,
		private readonly stateManager: CodeIndexStateManager,
		private readonly embedder: IEmbedder,
		private readonly vectorStore: IVectorStore,
		private readonly context: vscode.ExtensionContext,
	) {
		this.initializeLlmComponents()
	}

	/**
	 * Initialize LLM components if enabled
	 */
	private async initializeLlmComponents(): Promise<void> {
		try {
			// Get sub-LLM configuration from VSCode settings
			const config = vscode.workspace.getConfiguration(Package.name)

			this.subLlmConfig = {
				enabled: config.get<boolean>("subLlm.enabled", false),
				modelMode: config.get<"mirror" | "custom">("subLlm.model.mode", "mirror"),
				maxTokensPerOp: config.get<number>("subLlm.maxTokensPerOp", 1000),
				dailyCostCapUSD: config.get<number>("subLlm.dailyCostCapUSD", 1.0),
				timeout: config.get<number>("subLlm.timeout", 5000),
			}

			if (this.subLlmConfig.enabled) {
				// Initialize LLM client
				this.llmClient = new LlmClient(this.context, this.subLlmConfig)
				await this.llmClient.initialize()

				// Initialize components
				this.queryRewriter = new QueryRewriter(this.llmClient)
				this.reranker = new Reranker(this.llmClient)
			}
		} catch (error) {
			console.error("[EnhancedSearchService] Failed to initialize LLM components:", error)
			// Continue without LLM features
		}
	}

	/**
	 * Enhanced search with optional query rewriting and reranking
	 */
	public async searchIndex(query: string, directoryPrefix?: string): Promise<VectorStoreSearchResult[]> {
		if (!this.configManager.isFeatureEnabled || !this.configManager.isFeatureConfigured) {
			throw new Error("Code index feature is disabled or not configured.")
		}

		const minScore = this.configManager.currentSearchMinScore
		const maxResults = this.configManager.currentSearchMaxResults

		const currentState = this.stateManager.getCurrentStatus().systemStatus
		if (currentState !== "Indexed" && currentState !== "Indexing") {
			throw new Error(`Code index is not ready for search. Current state: ${currentState}`)
		}

		try {
			// Step 1: Query Rewriting (if enabled)
			const queries = await this.getSearchQueries(query)

			// Step 2: Perform searches for all query variants
			const allResults = await this.performMultiSearch(queries, directoryPrefix, minScore, maxResults)

			// Step 3: Deduplicate and merge results
			const mergedResults = this.mergeSearchResults(allResults)

			// Step 4: Rerank results (if enabled)
			const finalResults = await this.rerankResults(query, mergedResults)

			// Step 5: Apply final filtering and limit
			return this.filterAndLimitResults(finalResults, minScore, maxResults)
		} catch (error) {
			console.error("[EnhancedSearchService] Error during search:", error)
			this.stateManager.setSystemState("Error", `Search failed: ${(error as Error).message}`)

			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: (error as Error).message,
				stack: (error as Error).stack,
				location: "enhancedSearchIndex",
			})

			throw error
		}
	}

	/**
	 * Get search queries (original + rewritten variants if enabled)
	 */
	private async getSearchQueries(query: string): Promise<string[]> {
		const queries = [query] // Always include original

		// Check if query rewriting is enabled
		const rewriterEnabled = vscode.workspace
			.getConfiguration(Package.name)
			.get<boolean>("codeIndex.llm.rewriter", false)

		if (rewriterEnabled && this.queryRewriter) {
			try {
				const variants = await this.queryRewriter.rewrite(query)
				// Add variant queries (excluding the original which is already included)
				variants
					.filter((v: QueryVariant) => v.type !== "original")
					.forEach((v: QueryVariant) => queries.push(v.query))
			} catch (error) {
				console.warn("[EnhancedSearchService] Query rewriting failed, using original only:", error)
			}
		}

		return queries
	}

	/**
	 * Perform searches for multiple query variants
	 */
	private async performMultiSearch(
		queries: string[],
		directoryPrefix: string | undefined,
		minScore: number,
		maxResults: number,
	): Promise<VectorStoreSearchResult[][]> {
		const normalizedPrefix = directoryPrefix ? path.normalize(directoryPrefix) : undefined

		const searchPromises = queries.map(async (q) => {
			try {
				// Generate embedding for query
				const embeddingResponse = await this.embedder.createEmbeddings([q])
				const vector = embeddingResponse?.embeddings[0]

				if (!vector) {
					console.warn(`Failed to generate embedding for query variant: ${q}`)
					return []
				}

				// Perform search
				return await this.vectorStore.search(vector, normalizedPrefix, minScore, maxResults)
			} catch (error) {
				console.warn(`Search failed for query variant: ${q}`, error)
				return []
			}
		})

		return Promise.all(searchPromises)
	}

	/**
	 * Merge and deduplicate search results from multiple queries
	 */
	private mergeSearchResults(allResults: VectorStoreSearchResult[][]): VectorStoreSearchResult[] {
		const resultMap = new Map<string | number, VectorStoreSearchResult>()

		// Merge results, keeping the highest score for duplicates
		for (const results of allResults) {
			for (const result of results) {
				const existing = resultMap.get(result.id)
				if (!existing || result.score > existing.score) {
					resultMap.set(result.id, result)
				}
			}
		}

		// Convert back to array and sort by score
		return Array.from(resultMap.values()).sort((a, b) => b.score - a.score)
	}

	/**
	 * Rerank results using LLM if enabled
	 */
	private async rerankResults(query: string, results: VectorStoreSearchResult[]): Promise<VectorStoreSearchResult[]> {
		// Check if reranking is enabled
		const rerankerEnabled = vscode.workspace
			.getConfiguration(Package.name)
			.get<boolean>("codeIndex.llm.reranker", false)

		if (!rerankerEnabled || !this.reranker || results.length === 0) {
			return results
		}

		try {
			// Get max candidates for reranking
			const maxKForRerank = vscode.workspace
				.getConfiguration(Package.name)
				.get<number>("codeIndex.llm.maxKForRerank", 50)

			// Rerank top-K candidates
			const rerankResults = await this.reranker.rerank(query, results, {
				maxCandidates: maxKForRerank,
				includeReason: true,
			})

			// Blend reranked scores with original scores
			return this.reranker.blendScores(rerankResults, results, 0.7)
		} catch (error) {
			console.warn("[EnhancedSearchService] Reranking failed, using original scores:", error)
			return results
		}
	}

	/**
	 * Apply final filtering and limit to results
	 */
	private filterAndLimitResults(
		results: VectorStoreSearchResult[],
		minScore: number,
		maxResults: number,
	): VectorStoreSearchResult[] {
		return results.filter((r) => r.score >= minScore).slice(0, maxResults)
	}

	/**
	 * Get LLM budget status
	 */
	public getLlmBudgetStatus(): { enabled: boolean; dailyCost?: number; remaining?: number } {
		if (!this.llmClient) {
			return { enabled: false }
		}

		const status = this.llmClient.getBudgetStatus()
		return {
			enabled: true,
			dailyCost: status.dailyCost,
			remaining: status.remaining || undefined,
		}
	}
}
