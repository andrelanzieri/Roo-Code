import { z } from "zod"
import { LlmClient } from "./llm-client"
import { JsonRunner } from "./json-runner"
import { QueryVariant } from "./types"

// Schema for query rewriting response
const queryRewriteSchema = z.object({
	variants: z.array(
		z.object({
			query: z.string(),
			type: z.enum(["original", "synonym", "symbol", "natural", "error_signature"]),
			reason: z.string().optional(),
		}),
	),
})

/**
 * Rewrites natural language queries into multiple code-aware variants
 */
export class QueryRewriter {
	constructor(private readonly llmClient: LlmClient) {}

	/**
	 * Expand a single query into multiple variants for better search coverage
	 */
	async rewrite(query: string, context?: RewriteContext): Promise<QueryVariant[]> {
		const systemPrompt = `You are a code search query optimizer. Your task is to rewrite natural language queries into multiple variants that will help find relevant code.

Consider:
- Synonyms and alternative phrasings
- Technical terms vs natural language
- Symbol names and identifiers
- Common code patterns
- Error messages and signatures

Always include the original query as the first variant.
Limit to 3 variants total.
Respond with JSON only.`

		const userPrompt = this.buildPrompt(query, context)

		try {
			const response = await this.llmClient.generateJson<z.infer<typeof queryRewriteSchema>>(userPrompt, {
				schema: queryRewriteSchema,
				systemPrompt,
				maxTokens: 500,
				temperature: 0.3,
			})

			return response.variants
		} catch (error) {
			console.error("[QueryRewriter] Failed to rewrite query:", error)
			// Fallback to original query only
			return [{ query, type: "original" }]
		}
	}

	/**
	 * Build the prompt for query rewriting
	 */
	private buildPrompt(query: string, context?: RewriteContext): string {
		let prompt = `Rewrite this code search query into variants:
Query: "${query}"

${context?.language ? `Language: ${context.language}` : ""}
${context?.framework ? `Framework: ${context.framework}` : ""}

Example response format:
{
  "variants": [
    {"query": "${query}", "type": "original"},
    {"query": "alternative query 1", "type": "synonym", "reason": "uses technical terms"},
    {"query": "alternative query 2", "type": "symbol", "reason": "likely function name"}
  ]
}`

		return prompt
	}

	/**
	 * Batch rewrite multiple queries
	 */
	async rewriteBatch(queries: string[], context?: RewriteContext): Promise<Map<string, QueryVariant[]>> {
		const results = new Map<string, QueryVariant[]>()

		// Process in parallel with concurrency limit
		const batchSize = 3
		for (let i = 0; i < queries.length; i += batchSize) {
			const batch = queries.slice(i, i + batchSize)
			const batchResults = await Promise.all(batch.map((q) => this.rewrite(q, context)))

			batch.forEach((query, index) => {
				results.set(query, batchResults[index])
			})
		}

		return results
	}
}

/**
 * Context for query rewriting
 */
export interface RewriteContext {
	/** Programming language context */
	language?: string
	/** Framework or library context */
	framework?: string
	/** File types to search */
	fileTypes?: string[]
	/** Additional context about the codebase */
	additionalContext?: string
}
