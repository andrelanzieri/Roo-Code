import { Anthropic } from "@anthropic-ai/sdk"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import { CacheControlEphemeral } from "@anthropic-ai/sdk/resources"
import { AzureOpenAI } from "openai"
import type OpenAI from "openai"

import {
\ttype ModelInfo,
\ttype AzureModelId,
\tazureDefaultModelId,
\tazureModels,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { XmlMatcher } from "../../utils/xml-matcher"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { DEFAULT_HEADERS } from "./constants"
import { handleOpenAIError } from "./utils/openai-error-handler"

export class AzureHandler extends BaseProvider implements SingleCompletionHandler {
\tprivate options: ApiHandlerOptions
\tprivate claudeClient?: any // AnthropicFoundry - will be dynamically imported
\tprivate openaiClient?: AzureOpenAI

\tconstructor(options: ApiHandlerOptions) {
\t\tsuper()
\t\tthis.options = options

\t\t// Initialize OpenAI client for GPT models
\t\tconst baseURL = this.options.azureBaseUrl || "https://your-endpoint.cognitiveservices.azure.com/"
\t\tconst apiKey = this.options.azureApiKey || this.options.apiKey || "not-provided"
\t\tconst apiVersion = this.options.azureApiVersion || "2024-12-01-preview"

\t\tthis.openaiClient = new AzureOpenAI({
\t\t\tbaseURL,
\t\t\tapiKey,
\t\t\tapiVersion,
\t\t\tdefaultHeaders: DEFAULT_HEADERS,
\t\t})
\t}

\tprivate async initClaudeClient() {
\t\tif (this.claudeClient) return

\t\t// Dynamically import AnthropicFoundry only when needed
\t\ttry {
\t\t\tconst { default: AnthropicFoundry } = await import("@anthropic-ai/foundry-sdk")
\t\t\tconst baseURL = this.options.azureBaseUrl || "https://your-endpoint.services.ai.azure.com/anthropic/"
\t\t\tconst apiKey = this.options.azureApiKey || this.options.apiKey || "not-provided"
\t\t\tconst apiVersion = this.options.azureApiVersion || "2023-06-01"

\t\t\tthis.claudeClient = new AnthropicFoundry({
\t\t\t\tapiKey,
\t\t\t\tbaseURL,
\t\t\t\tapiVersion,
\t\t\t})
\t\t} catch (error) {
\t\t\tthrow new Error("Failed to initialize Azure Claude client: " + (error as Error).message)
\t\t}
\t}

\tprivate isClaudeModel(modelId: string): boolean {
\t\treturn modelId.includes("claude")
\t}

\toverride async *createMessage(
\t\tsystemPrompt: string,
\t\tmessages: Anthropic.Messages.MessageParam[],
\t\tmetadata?: ApiHandlerCreateMessageMetadata,
\t): ApiStream {
\t\tconst { id: modelId } = this.getModel()

\t\tif (this.isClaudeModel(modelId)) {
\t\t\tyield* this.createClaudeMessage(systemPrompt, messages, metadata)
\t\t} else {
\t\t\tyield* this.createOpenAIMessage(systemPrompt, messages, metadata)
\t\t}
\t}

\tprivate async *createClaudeMessage(
\t\tsystemPrompt: string,
\t\tmessages: Anthropic.Messages.MessageParam[],
\t\tmetadata?: ApiHandlerCreateMessageMetadata,
\t): ApiStream {
\t\tawait this.initClaudeClient()

\t\tconst { id: modelId, maxTokens, temperature } = this.getModel()
\t\tconst deploymentName = this.options.azureDeploymentName || modelId
\t\tconst cacheControl: CacheControlEphemeral = { type: "ephemeral" }

\t\t// Apply prompt caching to system and last two user messages
\t\tconst userMsgIndices = messages.reduce(
\t\t\t(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
\t\t\t[] as number[],
\t\t)

\t\tconst lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
\t\tconst secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

\t\tconst stream: AnthropicStream<any> = await this.claudeClient.messages.create({
\t\t\tmodel: deploymentName,
\t\t\tmax_tokens: maxTokens ?? 64_000,
\t\t\ttemperature,
\t\t\tsystem: [{ text: systemPrompt, type: "text", cache_control: cacheControl }],
\t\t\tmessages: messages.map((message, index) => {
\t\t\t\tif (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
\t\t\t\t\treturn {
\t\t\t\t\t\t...message,
\t\t\t\t\t\tcontent:
\t\t\t\t\t\t\ttypeof message.content === "string"
\t\t\t\t\t\t\t\t? [{ type: "text", text: message.content, cache_control: cacheControl }]
\t\t\t\t\t\t\t\t: message.content.map((content, contentIndex) =>
\t\t\t\t\t\t\t\t\t\tcontentIndex === message.content.length - 1
\t\t\t\t\t\t\t\t\t\t\t? { ...content, cache_control: cacheControl }
\t\t\t\t\t\t\t\t\t\t\t: content,
\t\t\t\t\t\t\t\t\t),
\t\t\t\t\t\t}
\t\t\t\t}
\t\t\t\treturn message
\t\t\t}),
\t\t\tstream: true,
\t\t})

\t\tlet inputTokens = 0
\t\tlet outputTokens = 0
\t\tlet cacheWriteTokens = 0
\t\tlet cacheReadTokens = 0

\t\tfor await (const chunk of stream) {
\t\t\tswitch (chunk.type) {
\t\t\t\tcase "message_start": {
\t\t\t\t\tconst {
\t\t\t\t\t\tinput_tokens = 0,
\t\t\t\t\t\toutput_tokens = 0,
\t\t\t\t\t\tcache_creation_input_tokens,
\t\t\t\t\t\tcache_read_input_tokens,
\t\t\t\t\t} = chunk.message.usage

\t\t\t\t\tyield {
\t\t\t\t\t\ttype: "usage",
\t\t\t\t\t\tinputTokens: input_tokens,
\t\t\t\t\t\toutputTokens: output_tokens,
\t\t\t\t\t\tcacheWriteTokens: cache_creation_input_tokens || undefined,
\t\t\t\t\t\tcacheReadTokens: cache_read_input_tokens || undefined,
\t\t\t\t\t}

\t\t\t\t\tinputTokens += input_tokens
\t\t\t\t\toutputTokens += output_tokens
\t\t\t\t\tcacheWriteTokens += cache_creation_input_tokens || 0
\t\t\t\t\tcacheReadTokens += cache_read_input_tokens || 0

\t\t\t\t\tbreak
\t\t\t\t}
\t\t\t\tcase "message_delta\":
\t\t\t\t\tyield {
\t\t\t\t\t\ttype: "usage",
\t\t\t\t\t\tinputTokens: 0,
\t\t\t\t\t\toutputTokens: chunk.usage.output_tokens || 0,
\t\t\t\t\t}
\t\t\t\t\tbreak
\t\t\t\tcase "content_block_start":
\t\t\t\t\tswitch (chunk.content_block.type) {
\t\t\t\t\t\tcase "thinking":
\t\t\t\t\t\t\tif (chunk.index > 0) {
\t\t\t\t\t\t\t\tyield { type: "reasoning", text: "\\n" }
\t\t\t\t\t\t\t}
\t\t\t\t\t\t\tyield { type: "reasoning", text: chunk.content_block.thinking }
\t\t\t\t\t\t\tbreak
\t\t\t\t\t\tcase "text":
\t\t\t\t\t\t\tif (chunk.index > 0) {
\t\t\t\t\t\t\t\tyield { type: "text", text: "\\n" }
\t\t\t\t\t\t\t}
\t\t\t\t\t\t\tyield { type: "text", text: chunk.content_block.text }
\t\t\t\t\t\t\tbreak
\t\t\t\t\t}
\t\t\t\t\tbreak
\t\t\t\tcase "content_block_delta":
\t\t\t\t\tswitch (chunk.delta.type) {
\t\t\t\t\t\tcase "thinking_delta":
\t\t\t\t\t\t\tyield { type: "reasoning", text: chunk.delta.thinking }
\t\t\t\t\t\t\tbreak
\t\t\t\t\t\tcase "text_delta":
\t\t\t\t\t\t\tyield { type: "text", text: chunk.delta.text }
\t\t\t\t\t\t\tbreak
\t\t\t\t\t}
\t\t\t\t\tbreak
\t\t\t}
\t\t}
\t}

\tprivate async *createOpenAIMessage(
\t\tsystemPrompt: string,
\t\tmessages: Anthropic.Messages.MessageParam[],
\t\tmetadata?: ApiHandlerCreateMessageMetadata,
\t): ApiStream {
\t\tif (!this.openaiClient) {
\t\t\tthrow new Error("Azure OpenAI client not initialized")
\t\t}

\t\tconst { id: modelId, info: modelInfo, reasoning } = this.getModel()
\t\tconst deploymentName = this.options.azureDeploymentName || modelId
\t\tconst temperature = this.options.modelTemperature ?? (modelInfo.supportsTemperature ? 0 : undefined)

\t\tconst requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
\t\t\tmodel: deploymentName,
\t\t\ttemperature,
\t\t\tmessages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
\t\t\tstream: true as const,
\t\t\tstream_options: { include_usage: true },
\t\t\t...(reasoning && reasoning),
\t\t\t...(metadata?.tools && { tools: this.convertToolsForOpenAI(metadata.tools) }),
\t\t\t...(metadata?.tool_choice && { tool_choice: metadata.tool_choice }),
\t\t}

\t\t// Add max_completion_tokens if needed
\t\tif (this.options.includeMaxTokens === true) {
\t\t\trequestOptions.max_completion_tokens = this.options.modelMaxTokens || modelInfo.maxTokens
\t\t}

\t\tlet stream
\t\ttry {
\t\t\tstream = await this.openaiClient.chat.completions.create(requestOptions)
\t\t} catch (error) {
\t\t\tthrow handleOpenAIError(error, "Azure OpenAI")
\t\t}

\t\tconst matcher = new XmlMatcher(
\t\t\t"think",
\t\t\t(chunk) =>
\t\t\t\t({
\t\t\t\t\ttype: chunk.matched ? "reasoning" : "text",
\t\t\t\t\ttext: chunk.data,
\t\t\t\t}) as const,
\t\t)

\t\tconst toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>()

\t\tfor await (const chunk of stream) {
\t\t\tconst delta = chunk.choices?.[0]?.delta
\t\t\tconst finishReason = chunk.choices?.[0]?.finish_reason

\t\t\tif (delta?.content) {
\t\t\t\tfor (const processedChunk of matcher.update(delta.content)) {
\t\t\t\t\tyield processedChunk
\t\t\t\t}
\t\t\t}

\t\t\tif (delta && "reasoning_content" in delta) {
\t\t\t\tconst reasoning_content = (delta.reasoning_content as string | undefined) || ""
\t\t\t\tif (reasoning_content?.trim()) {
\t\t\t\t\tyield { type: "reasoning", text: reasoning_content }
\t\t\t\t}
\t\t\t}

\t\t\tif (delta?.tool_calls) {
\t\t\t\tfor (const toolCall of delta.tool_calls) {
\t\t\t\t\tconst index = toolCall.index
\t\t\t\t\tconst existing = toolCallAccumulator.get(index)

\t\t\t\t\tif (existing) {
\t\t\t\t\t\tif (toolCall.function?.arguments) {
\t\t\t\t\t\t\texisting.arguments += toolCall.function.arguments
\t\t\t\t\t\t}
\t\t\t\t\t} else {
\t\t\t\t\t\ttoolCallAccumulator.set(index, {
\t\t\t\t\t\t\tid: toolCall.id || "",
\t\t\t\t\t\t\tname: toolCall.function?.name || "",
\t\t\t\t\t\t\targuments: toolCall.function?.arguments || "",
\t\t\t\t\t\t})
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}

\t\t\tif (finishReason === "tool_calls") {
\t\t\t\tfor (const toolCall of toolCallAccumulator.values()) {
\t\t\t\t\tyield {
\t\t\t\t\t\ttype: "tool_call",
\t\t\t\t\t\tid: toolCall.id,
\t\t\t\t\t\tname: toolCall.name,
\t\t\t\t\t\targuments: toolCall.arguments,
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\ttoolCallAccumulator.clear()
\t\t\t}

\t\t\tif (chunk.usage) {
\t\t\t\tyield {
\t\t\t\t\ttype: "usage",
\t\t\t\t\tinputTokens: chunk.usage.prompt_tokens || 0,
\t\t\t\t\toutputTokens: chunk.usage.completion_tokens || 0,
\t\t\t\t\tcacheWriteTokens: chunk.usage.cache_creation_input_tokens || undefined,
\t\t\t\t\tcacheReadTokens: chunk.usage.cache_read_input_tokens || undefined,
\t\t\t\t}
\t\t\t}
\t\t}

\t\tfor (const processedChunk of matcher.final()) {
\t\t\tyield processedChunk
\t\t}
\t}

\toverride getModel() {
\t\tconst modelId = this.options.apiModelId
\t\tconst id = modelId && modelId in azureModels ? (modelId as AzureModelId) :azureDefaultModelId
\t\tconst info: ModelInfo = azureModels[id]

\t\tconst params = getModelParams({
\t\t\tformat: this.isClaudeModel(id) ? "anthropic" : "openai",
\t\t\tmodelId: id,
\t\t\tmodel: info,
\t\t\tsettings: this.options,
\t\t})

\t\treturn { id, info, ...params }
\t}

\tasync completePrompt(prompt: string): Promise<string> {
\t\tconst { id: modelId } = this.getModel()

\t\tif (this. isClaudeModel(modelId)) {
\t\t\tawait this.initClaudeClient()
\t\t\tconst deploymentName = this.options.azureDeploymentName || modelId

\t\t\tconst message = await this.claudeClient.messages.create({
\t\t\t\tmodel: deploymentName,
\t\t\t\tmax_tokens: 8192,
\t\t\t\tmessages: [{ role: "user", content: prompt }],
\t\t\t\tstream: false,
\t\t\t})

\t\t\tconst content = message.content.find(({ type }: any) => type === "text")
\t\t\treturn content?.type === "text" ? content.text : ""
\t\t} else {
\t\t\tif (!this.openaiClient) {
\t\t\t\tthrow new Error("Azure OpenAI client not initialized")
\t\t\t}

\t\t\tconst deploymentName = this.options.azureDeploymentName || modelId

\t\t\tconst response = await this.openaiClient.chat.completions.create({
\t\t\t\tmodel: deploymentName,
\t\t\t\tmessages: [{ role: "user", content: prompt }],
\t\t\t})

\t\t\treturn response.choices?.[0]?.message.content || ""
\t\t}
\t}
}
