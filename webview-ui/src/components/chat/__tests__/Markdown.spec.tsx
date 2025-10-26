import { render, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { Markdown } from "../Markdown"
import React from "react"

// Mock vscode API
const mockPostMessage = vi.fn()
const vscodeApi = {
	postMessage: mockPostMessage,
}

// @ts-expect-error - Mocking global window API for testing
global.window.acquireVsCodeApi = vi.fn(() => vscodeApi)

describe("Markdown Quote Selection", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Mock getSelection
		global.window.getSelection = vi.fn(
			() =>
				({
					toString: vi.fn(() => ""),
					removeAllRanges: vi.fn(),
					getRangeAt: vi.fn(() => ({
						getBoundingClientRect: vi.fn(() => ({
							top: 100,
							left: 50,
							bottom: 120,
							right: 200,
							width: 150,
							height: 20,
						})),
					})),
					rangeCount: 1,
				}) as any,
		)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should show quote button when text is selected", async () => {
		const { container } = render(
			<Markdown markdown="This is some test content that can be selected" messageTs={123456} />,
		)

		// Mock text selection
		const mockSelection = {
			toString: vi.fn(() => "test content"),
			removeAllRanges: vi.fn(),
			getRangeAt: vi.fn(() => ({
				getBoundingClientRect: vi.fn(() => ({
					top: 100,
					left: 50,
					bottom: 120,
					right: 200,
					width: 150,
					height: 20,
				})),
			})),
			rangeCount: 1,
		}
		global.window.getSelection = vi.fn(() => mockSelection as any)

		// Trigger selection change event
		const selectionEvent = new Event("selectionchange", { bubbles: true })
		document.dispatchEvent(selectionEvent)

		// Wait for the quote button to appear
		await waitFor(() => {
			const quoteButton = container.querySelector('[aria-label="Quote selected text"]')
			expect(quoteButton).toBeTruthy()
		})
	})

	it("should send addQuoteToComposer message when quote button is clicked", async () => {
		const { container } = render(
			<Markdown markdown="This is some test content that can be selected" messageTs={123456} />,
		)

		// Mock text selection
		const selectedText = "test content"
		const mockSelection = {
			toString: vi.fn(() => selectedText),
			removeAllRanges: vi.fn(),
			getRangeAt: vi.fn(() => ({
				getBoundingClientRect: vi.fn(() => ({
					top: 100,
					left: 50,
					bottom: 120,
					right: 200,
					width: 150,
					height: 20,
				})),
			})),
			rangeCount: 1,
		}
		global.window.getSelection = vi.fn(() => mockSelection as any)

		// Trigger selection change event
		const selectionEvent = new Event("selectionchange", { bubbles: true })
		document.dispatchEvent(selectionEvent)

		// Wait for the quote button to appear
		await waitFor(() => {
			const quoteButton = container.querySelector('[aria-label="Quote selected text"]')
			expect(quoteButton).toBeTruthy()
		})

		// Click the quote button
		const quoteButton = container.querySelector('[aria-label="Quote selected text"]') as HTMLElement
		fireEvent.click(quoteButton)

		// Verify the message was sent
		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "addQuoteToComposer",
			text: selectedText,
			messageTs: 123456,
		})
	})

	it("should hide quote button when selection is cleared", async () => {
		const { container } = render(
			<Markdown markdown="This is some test content that can be selected" messageTs={123456} />,
		)

		// Mock text selection
		const mockSelection = {
			toString: vi.fn(() => "test content"),
			removeAllRanges: vi.fn(),
			getRangeAt: vi.fn(() => ({
				getBoundingClientRect: vi.fn(() => ({
					top: 100,
					left: 50,
					bottom: 120,
					right: 200,
					width: 150,
					height: 20,
				})),
			})),
			rangeCount: 1,
		}
		global.window.getSelection = vi.fn(() => mockSelection as any)

		// Trigger selection change event
		const selectionEvent = new Event("selectionchange", { bubbles: true })
		document.dispatchEvent(selectionEvent)

		// Wait for the quote button to appear
		await waitFor(() => {
			const quoteButton = container.querySelector('[aria-label="Quote selected text"]')
			expect(quoteButton).toBeTruthy()
		})

		// Clear the selection
		mockSelection.toString = vi.fn(() => "")
		mockSelection.rangeCount = 0

		// Trigger selection change event again
		document.dispatchEvent(selectionEvent)

		// Wait for the quote button to disappear
		await waitFor(() => {
			const quoteButton = container.querySelector('[aria-label="Quote selected text"]')
			expect(quoteButton).toBeFalsy()
		})
	})

	it("should not show quote button when messageTs is not provided", async () => {
		const { container } = render(<Markdown markdown="This is some test content that can be selected" />)

		// Mock text selection
		const mockSelection = {
			toString: vi.fn(() => "test content"),
			removeAllRanges: vi.fn(),
			getRangeAt: vi.fn(() => ({
				getBoundingClientRect: vi.fn(() => ({
					top: 100,
					left: 50,
					bottom: 120,
					right: 200,
					width: 150,
					height: 20,
				})),
			})),
			rangeCount: 1,
		}
		global.window.getSelection = vi.fn(() => mockSelection as any)

		// Trigger selection change event
		const selectionEvent = new Event("selectionchange", { bubbles: true })
		document.dispatchEvent(selectionEvent)

		// Wait a bit and verify no quote button appears
		await waitFor(
			() => {
				const quoteButton = container.querySelector('[aria-label="Quote selected text"]')
				expect(quoteButton).toBeFalsy()
			},
			{ timeout: 100 },
		)
	})
})
