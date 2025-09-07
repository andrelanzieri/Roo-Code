import { z } from "zod"
import { LlmClient } from "./llm-client"
import { RerankResult } from "./types"
import { VectorStoreSearchResult } from "../code-index/interfaces"

// Schema for reranking response
const rerankResponseSchema = z.object({
	results: z.array(
		z.object({
			id: z.union([z.string(), z.number()]),
			score: z.number().min(0).max(1),
			reason: z.string().optional(),
		}),
	),
})

/**
 * LLM-based reranker for search results
 */
export class Reranker {
	constructor(private readonly llmClient: LlmClient) {}

	/**
	 * Rerank search results based on relevance to query
	 */
	async rerank(
		query: string,
		candidates: VectorStoreSearchResult[],
		options: RerankOptions = {},
	): Promise<RerankResult[]> {
		if (candidates.length === 0) {
			return []
		}

		const maxCandidates = options.maxCandidates || 50
		const topCandidates = candidates.slice(0, maxCandidates)

		const systemPrompt = `You are a code search relevance expert. Score each code snippet's relevance to the query.

Scoring criteria:
- 1.0: Perfect match - exactly what the query is looking for
- 0.8-0.9: Highly relevant - directly addresses the query
- 0.6-0.7: Relevant - related to the query but not exact
- 0.4-0.5: Somewhat relevant - tangentially related
- 0.2-0.3: Minimally relevant - only loosely connected
- 0.0-0.1: Not relevant

Consider:
- Semantic similarity to the query intent
- Code functionality and purpose
- Symbol names and identifiers
- Comments and documentation
- Error messages or patterns

Respond with JSON only.`

		const userPrompt = this.buildPrompt(query, topCandidates, options)

		try {
			const response = await this.llmClient.generateJson<z.infer<typeof rerankResponseSchema>>(userPrompt, {
				schema: rerankResponseSchema,
				systemPrompt,
				maxTokens: 1000,
				temperature: 0.1,
			})

			return response.results
		} catch (error) {
			console.error("[Reranker] Failed to rerank results:", error)
			// Fallback to original scores
			return topCandidates.map((candidate, index) => ({
				id: candidate.id,
				score: candidate.score,
				reason: "Fallback to embedding score",
			}))
		}
	}

	/**
	 * Build the prompt for reranking
	 */
	private buildPrompt(query: string, candidates: VectorStoreSearchResult[], options: RerankOptions): string {
		const candidateTexts = candidates
			.map((c, i) => {
				const payload = c.payload
				if (!payload) return `[${i}]: No content`

				// Truncate code to reasonable length
				const code = this.truncateCode(payload.codeChunk || "", options.maxCodeLength || 350)

				return `[${c.id}]:
File: ${payload.filePath || "unknown"}
Lines: ${payload.startLine || 0}-${payload.endLine || 0}
Code:
${code}
---`
			})
			.join("\n\n")

		return `Query: "${query}"

Candidates to score:

${candidateTexts}

Score each candidate's relevance to the query. Return JSON with format:
{
  "results": [
    {"id": "candidate_id", "score": 0.95, "reason": "Contains exact function"},
    ...
  ]
}`
	}

	/**
	 * Truncate code snippet to maximum length while preserving structure
	 */
	private truncateCode(code: string, maxLength: number): string {
		if (code.length <= maxLength) {
			return code
		}

		// Try to truncate at a natural boundary
		const truncated = code.substring(0, maxLength)
		const lastNewline = truncated.lastIndexOf("\n")

		if (lastNewline > maxLength * 0.8) {
			return truncated.substring(0, lastNewline) + "\n..."
		}

		return truncated + "..."
	}

	/**
	 * Blend reranked scores with original embedding scores
	 */
	blendScores(
		rerankResults: RerankResult[],
		originalResults: VectorStoreSearchResult[],
		blendWeight: number = 0.7,
	): VectorStoreSearchResult[] {
		// Create a map of rerank scores
		const rerankMap = new Map<string | number, RerankResult>()
		rerankResults.forEach((r) => rerankMap.set(r.id, r))

		// Blend scores
		const blended = originalResults.map((original) => {
			const reranked = rerankMap.get(original.id)

			if (!reranked) {
				return original
			}

			// Blend: weight * rerank + (1-weight) * embedding
			const blendedScore = blendWeight * reranked.score + (1 - blendWeight) * original.score

			return {
				...original,
				score: blendedScore,
				// Add rerank reason to payload if available
				payload: original.payload
					? {
							...original.payload,
							rerankReason: reranked.reason,
						}
					: undefined,
			} as VectorStoreSearchResult
		})

		// Sort by blended score
		return blended.sort((a, b) => b.score - a.score)
	}
}

/**
 * Options for reranking
 */
export interface RerankOptions {
	/** Maximum number of candidates to rerank */
	maxCandidates?: number
	/** Maximum code length per candidate */
	maxCodeLength?: number
	/** Include reasoning in results */
	includeReason?: boolean
	/** Additional context for reranking */
	context?: {
		language?: string
		framework?: string
	}
}
