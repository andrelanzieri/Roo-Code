import { Ignore } from "ignore"
import * as vscode from "vscode"
import { DirectoryScanner } from "./scanner"
import { ICodeParser, IEmbedder, IVectorStore, IDirectoryScanner, CodeBlock } from "../interfaces"
import { CacheManager } from "../cache-manager"
import { LlmClient, Summarizer, SubLlmConfig } from "../../llm-utils"
import { Package } from "../../../shared/package"

/**
 * Factory for creating enhanced directory scanners with optional LLM features
 */
export class EnhancedScannerFactory {
	/**
	 * Create a directory scanner with optional LLM-based summarization
	 */
	static async create(
		embedder: IEmbedder,
		qdrantClient: IVectorStore,
		codeParser: ICodeParser,
		cacheManager: CacheManager,
		ignoreInstance: Ignore,
		context: vscode.ExtensionContext,
		batchSegmentThreshold?: number,
	): Promise<IDirectoryScanner> {
		const config = vscode.workspace.getConfiguration(Package.name)

		// Check if LLM features are enabled
		const summariesEnabled = config.get<boolean>("codeIndex.llm.summaries", false)
		const tagsEnabled = config.get<boolean>("codeIndex.llm.tags", false)

		if (summariesEnabled || tagsEnabled) {
			// Create enhanced scanner with LLM features
			return new EnhancedDirectoryScanner(
				embedder,
				qdrantClient,
				codeParser,
				cacheManager,
				ignoreInstance,
				context,
				summariesEnabled,
				tagsEnabled,
				batchSegmentThreshold,
			)
		}

		// Return standard scanner
		return new DirectoryScanner(
			embedder,
			qdrantClient,
			codeParser,
			cacheManager,
			ignoreInstance,
			batchSegmentThreshold,
		)
	}
}

/**
 * Enhanced directory scanner with LLM-based summarization
 * This is a wrapper around DirectoryScanner that adds summarization capabilities
 */
class EnhancedDirectoryScanner implements IDirectoryScanner {
	private scanner: DirectoryScanner
	private llmClient: LlmClient | null = null
	private summarizer: Summarizer | null = null

	constructor(
		private readonly embedder: IEmbedder,
		private readonly qdrantClient: IVectorStore,
		private readonly codeParser: ICodeParser,
		private readonly cacheManager: CacheManager,
		private readonly ignoreInstance: Ignore,
		private readonly context: vscode.ExtensionContext,
		private readonly summariesEnabled: boolean,
		private readonly tagsEnabled: boolean,
		batchSegmentThreshold?: number,
	) {
		// Create wrapped scanner
		this.scanner = new DirectoryScanner(
			new EnhancedEmbedder(embedder, this),
			qdrantClient,
			codeParser,
			cacheManager,
			ignoreInstance,
			batchSegmentThreshold,
		)

		this.initializeLlmComponents()
	}

	/**
	 * Initialize LLM components
	 */
	private async initializeLlmComponents(): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration(Package.name)

			// Initialize sub-LLM configuration
			const subLlmConfig: SubLlmConfig = {
				enabled: config.get<boolean>("subLlm.enabled", false),
				modelMode: config.get<"mirror" | "custom">("subLlm.model.mode", "mirror"),
				maxTokensPerOp: config.get<number>("subLlm.maxTokensPerOp", 500),
				dailyCostCapUSD: config.get<number>("subLlm.dailyCostCapUSD", 1.0),
				timeout: config.get<number>("subLlm.timeout", 5000),
			}

			if (subLlmConfig.enabled) {
				this.llmClient = new LlmClient(this.context, subLlmConfig)
				await this.llmClient.initialize()
				this.summarizer = new Summarizer(this.llmClient)
			}
		} catch (error) {
			console.error("[EnhancedScanner] Failed to initialize LLM components:", error)
		}
	}

	/**
	 * Scan directory with enhanced features
	 */
	async scanDirectory(
		directory: string,
		onError?: (error: Error) => void,
		onBlocksIndexed?: (indexedCount: number) => void,
		onFileParsed?: (fileBlockCount: number) => void,
	): Promise<{
		stats: { processed: number; skipped: number }
		totalBlockCount: number
	}> {
		return this.scanner.scanDirectory(directory, onError, onBlocksIndexed, onFileParsed)
	}

	/**
	 * Get summarizer for external use
	 */
	getSummarizer(): Summarizer | null {
		return this.summarizer
	}

	/**
	 * Check if summaries are enabled
	 */
	isSummariesEnabled(): boolean {
		return this.summariesEnabled
	}

	/**
	 * Check if tags are enabled
	 */
	isTagsEnabled(): boolean {
		return this.tagsEnabled
	}
}

/**
 * Enhanced embedder that augments text with summaries
 */
class EnhancedEmbedder implements IEmbedder {
	constructor(
		private readonly baseEmbedder: IEmbedder,
		private readonly enhancedScanner: EnhancedDirectoryScanner,
	) {}

	get embedderInfo() {
		return this.baseEmbedder.embedderInfo
	}

	async createEmbeddings(texts: string[], model?: string) {
		// Check if we should augment with summaries
		const summarizer = this.enhancedScanner.getSummarizer()

		if (!summarizer || (!this.enhancedScanner.isSummariesEnabled() && !this.enhancedScanner.isTagsEnabled())) {
			// No augmentation needed
			return this.baseEmbedder.createEmbeddings(texts, model)
		}

		// For now, pass through to base embedder
		// In a full implementation, we would parse the text to extract code blocks,
		// generate summaries, and augment the text before embedding
		return this.baseEmbedder.createEmbeddings(texts, model)
	}

	async validateConfiguration() {
		return this.baseEmbedder.validateConfiguration()
	}
}
