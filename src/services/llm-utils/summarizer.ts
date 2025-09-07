import { z } from "zod"
import { LlmClient } from "./llm-client"
import { SummaryResult } from "./types"
import { CodeBlock } from "../code-index/interfaces"

// Schema for summarization response
const summaryResponseSchema = z.object({
	title: z.string().optional(),
	summary: z.string(),
	tags: z.array(z.string()).optional(),
})

/**
 * Generates summaries and tags for code blocks
 */
export class Summarizer {
	constructor(private readonly llmClient: LlmClient) {}

	/**
	 * Generate a summary for a code block
	 */
	async summarize(codeBlock: CodeBlock, options: SummarizeOptions = {}): Promise<SummaryResult> {
		const systemPrompt = `You are a code documentation expert. Generate concise summaries for code blocks.

Requirements:
- Title: One-line description (optional, only for functions/classes)
- Summary: 1-2 sentences describing what the code does
- Tags: 2-5 relevant keywords for searchability

Focus on:
- Main functionality and purpose
- Key algorithms or patterns used
- Dependencies and relationships
- Error handling or edge cases

Be concise and factual. Respond with JSON only.`

		const userPrompt = this.buildPrompt(codeBlock, options)

		try {
			const response = await this.llmClient.generateJson<z.infer<typeof summaryResponseSchema>>(userPrompt, {
				schema: summaryResponseSchema,
				systemPrompt,
				maxTokens: 300,
				temperature: 0.2,
			})

			return response
		} catch (error) {
			console.error("[Summarizer] Failed to generate summary:", error)
			// Fallback to empty summary
			return {
				summary: "Code block",
				tags: [],
			}
		}
	}

	/**
	 * Build the prompt for summarization
	 */
	private buildPrompt(codeBlock: CodeBlock, options: SummarizeOptions): string {
		const language = options.language || this.detectLanguage(codeBlock.file_path)
		const codeSnippet = this.truncateCode(codeBlock.content, options.maxCodeLength || 500)

		return `Summarize this ${language} code:

File: ${codeBlock.file_path}
Lines: ${codeBlock.start_line}-${codeBlock.end_line}
${codeBlock.identifier ? `Identifier: ${codeBlock.identifier}` : ""}

Code:
\`\`\`${language}
${codeSnippet}
\`\`\`

Generate a JSON response with:
- title (optional): One-line description if it's a function/class
- summary: 1-2 sentences about what this code does
- tags: 2-5 relevant keywords

Example:
{
  "title": "Calculate user authentication token",
  "summary": "Generates a JWT token for user authentication with expiration and refresh logic.",
  "tags": ["auth", "jwt", "token", "security"]
}`
	}

	/**
	 * Batch summarize multiple code blocks
	 */
	async summarizeBatch(codeBlocks: CodeBlock[], options: SummarizeOptions = {}): Promise<Map<string, SummaryResult>> {
		const results = new Map<string, SummaryResult>()

		// Process in parallel with concurrency limit
		const batchSize = options.batchSize || 5
		for (let i = 0; i < codeBlocks.length; i += batchSize) {
			const batch = codeBlocks.slice(i, i + batchSize)
			const batchResults = await Promise.all(batch.map((block) => this.summarize(block, options)))

			batch.forEach((block, index) => {
				// Use segmentHash as unique identifier
				results.set(block.segmentHash, batchResults[index])
			})
		}

		return results
	}

	/**
	 * Detect language from file path
	 */
	private detectLanguage(filePath: string): string {
		const ext = filePath.split(".").pop()?.toLowerCase()

		const languageMap: Record<string, string> = {
			ts: "typescript",
			tsx: "typescript",
			js: "javascript",
			jsx: "javascript",
			py: "python",
			java: "java",
			cpp: "cpp",
			c: "c",
			cs: "csharp",
			go: "go",
			rs: "rust",
			rb: "ruby",
			php: "php",
			swift: "swift",
			kt: "kotlin",
			scala: "scala",
			r: "r",
			sql: "sql",
			sh: "bash",
			yaml: "yaml",
			yml: "yaml",
			json: "json",
			xml: "xml",
			html: "html",
			css: "css",
			scss: "scss",
			sass: "sass",
			less: "less",
		}

		return languageMap[ext || ""] || "text"
	}

	/**
	 * Truncate code to maximum length
	 */
	private truncateCode(code: string, maxLength: number): string {
		if (code.length <= maxLength) {
			return code
		}

		// Try to truncate at a natural boundary
		const truncated = code.substring(0, maxLength)
		const lastNewline = truncated.lastIndexOf("\n")

		if (lastNewline > maxLength * 0.8) {
			return truncated.substring(0, lastNewline) + "\n// ..."
		}

		return truncated + "..."
	}

	/**
	 * Generate augmented embedding text with summary and tags
	 */
	generateAugmentedText(codeBlock: CodeBlock, summary: SummaryResult): string {
		const language = this.detectLanguage(codeBlock.file_path)
		const relPath = codeBlock.file_path
		const identifier = codeBlock.identifier || ""
		const span = `${codeBlock.start_line}-${codeBlock.end_line}`

		// Build augmented text for embedding
		const parts = [
			language,
			relPath,
			identifier,
			span,
			summary.title || "",
			summary.summary,
			...(summary.tags || []),
			codeBlock.content,
		].filter(Boolean)

		return parts.join(" | ")
	}
}

/**
 * Options for summarization
 */
export interface SummarizeOptions {
	/** Programming language override */
	language?: string
	/** Maximum code length to process */
	maxCodeLength?: number
	/** Batch size for parallel processing */
	batchSize?: number
	/** Focus on specific aspects */
	focus?: "functionality" | "api" | "implementation"
	/** Include specific metadata */
	includeMetadata?: boolean
}
