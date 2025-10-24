import { Anthropic } from "@anthropic-ai/sdk"
import type { ModelInfo } from "@roo-code/types"
import type { ApiMessage } from "../task-persistence"

export interface ImageTrimResult {
	messages: ApiMessage[]
	trimmedCount: number
	warningMessage?: string
}

/**
 * Count the total number of images in the conversation history
 */
export function countImagesInConversation(messages: ApiMessage[]): number {
	let imageCount = 0

	for (const message of messages) {
		if (Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block.type === "image") {
					imageCount++
				}
			}
		}
	}

	return imageCount
}

/**
 * Trim the oldest images from the conversation history to stay within the model's image limit
 */
export function trimImagesFromConversation(messages: ApiMessage[], modelInfo: ModelInfo): ImageTrimResult {
	// If model doesn't support images or doesn't have a limit, return as-is
	if (!modelInfo.supportsImages || !modelInfo.maxImages) {
		return {
			messages,
			trimmedCount: 0,
		}
	}

	const maxImages = modelInfo.maxImages
	const currentImageCount = countImagesInConversation(messages)

	// If within limit, no trimming needed
	if (currentImageCount <= maxImages) {
		return {
			messages,
			trimmedCount: 0,
		}
	}

	// Calculate how many images to trim
	const imagesToTrim = currentImageCount - maxImages
	let trimmedCount = 0

	// Create a deep copy of messages to avoid modifying the original
	const trimmedMessages: ApiMessage[] = JSON.parse(JSON.stringify(messages))

	// Iterate through messages from oldest to newest and remove images
	for (let i = 0; i < trimmedMessages.length && trimmedCount < imagesToTrim; i++) {
		const message = trimmedMessages[i]

		if (Array.isArray(message.content)) {
			const newContent: Anthropic.Messages.ContentBlockParam[] = []
			let addedPlaceholder = false

			for (const block of message.content) {
				if (block.type === "image" && trimmedCount < imagesToTrim) {
					// Replace the first trimmed image with a placeholder text
					if (!addedPlaceholder) {
						newContent.push({
							type: "text",
							text: "[Image removed to stay within model's image limit]",
						})
						addedPlaceholder = true
					}
					trimmedCount++
				} else {
					newContent.push(block)
				}
			}

			// Update the message content
			message.content = newContent

			// If all content was removed, ensure at least one text block remains
			if (newContent.length === 0) {
				message.content = [
					{
						type: "text",
						text: "[Content removed to stay within model's image limit]",
					},
				]
			}
		}
	}

	const warningMessage = `⚠️ Removed ${trimmedCount} image(s) from conversation history to stay within the model's limit of ${maxImages} images. The oldest images were removed first.`

	return {
		messages: trimmedMessages,
		trimmedCount,
		warningMessage,
	}
}

/**
 * Check if adding new content would exceed the image limit
 */
export function wouldExceedImageLimit(
	currentMessages: ApiMessage[],
	newContent: Anthropic.Messages.ContentBlockParam[],
	modelInfo: ModelInfo,
): boolean {
	if (!modelInfo.supportsImages || !modelInfo.maxImages) {
		return false
	}

	const currentImageCount = countImagesInConversation(currentMessages)
	let newImageCount = 0

	if (Array.isArray(newContent)) {
		for (const block of newContent) {
			if (block.type === "image") {
				newImageCount++
			}
		}
	}

	return currentImageCount + newImageCount > modelInfo.maxImages
}
