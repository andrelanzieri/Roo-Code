import * as vscode from "vscode"
import fs from "fs/promises"
import * as path from "path"
import { compressImageIfNeeded, needsCompression, formatFileSize } from "./image-compression"

export async function selectImages(): Promise<string[]> {
	const options: vscode.OpenDialogOptions = {
		canSelectMany: true,
		openLabel: "Select",
		filters: {
			Images: ["png", "jpg", "jpeg", "webp"], // supported by anthropic and openrouter
		},
	}

	const fileUris = await vscode.window.showOpenDialog(options)

	if (!fileUris || fileUris.length === 0) {
		return []
	}

	return await Promise.all(
		fileUris.map(async (uri) => {
			const imagePath = uri.fsPath
			let buffer = await fs.readFile(imagePath)
			let mimeType = getMimeType(imagePath)

			// Check if compression is needed
			if (needsCompression(buffer)) {
				const originalSize = formatFileSize(buffer.length)

				// Show a progress notification while compressing
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: `Compressing large image (${originalSize})...`,
						cancellable: false,
					},
					async () => {
						const compressed = await compressImageIfNeeded(buffer, mimeType)
						buffer = compressed.buffer
						mimeType = compressed.mimeType

						// Show info about compression
						const newSize = formatFileSize(buffer.length)
						vscode.window.showInformationMessage(`Image compressed from ${originalSize} to ${newSize}`)
					},
				)
			}

			const base64 = buffer.toString("base64")
			const dataUrl = `data:${mimeType};base64,${base64}`
			return dataUrl
		}),
	)
}

function getMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase()
	switch (ext) {
		case ".png":
			return "image/png"
		case ".jpeg":
		case ".jpg":
			return "image/jpeg"
		case ".webp":
			return "image/webp"
		default:
			throw new Error(`Unsupported file type: ${ext}`)
	}
}
