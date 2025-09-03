import { describe, it, expect, beforeEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { JupyterNotebookHandler, JupyterNotebook } from "../jupyter-notebook-handler"

describe("JupyterNotebookHandler", () => {
	let handler: JupyterNotebookHandler
	let sampleNotebook: JupyterNotebook

	beforeEach(() => {
		sampleNotebook = {
			cells: [
				{
					cell_type: "markdown",
					source: ["# Test Notebook\n", "This is a test notebook"],
					metadata: {},
				},
				{
					cell_type: "code",
					source: ["import numpy as np\n", "import pandas as pd"],
					metadata: {},
					outputs: [],
					execution_count: 1,
				},
				{
					cell_type: "code",
					source: ["def hello():\n", "    print('Hello, World!')"],
					metadata: {},
					outputs: [],
					execution_count: 2,
				},
			],
			metadata: {
				kernelspec: {
					display_name: "Python 3",
					language: "python",
					name: "python3",
				},
			},
			nbformat: 4,
			nbformat_minor: 4,
		}

		handler = new JupyterNotebookHandler("test.ipynb", JSON.stringify(sampleNotebook))
	})

	describe("Cell Operations", () => {
		it("should get cell by index", () => {
			const cell = handler.getCellByIndex(0)
			expect(cell).toBeDefined()
			expect(cell?.cell_type).toBe("markdown")
		})

		it("should return undefined for invalid cell index", () => {
			const cell = handler.getCellByIndex(10)
			expect(cell).toBeUndefined()
		})

		it("should get cell count", () => {
			expect(handler.getCellCount()).toBe(3)
		})

		it("should get cells by type", () => {
			const codeCells = handler.getCellsByType("code")
			expect(codeCells).toHaveLength(2)
			expect(codeCells[0].index).toBe(1)
			expect(codeCells[1].index).toBe(2)

			const markdownCells = handler.getCellsByType("markdown")
			expect(markdownCells).toHaveLength(1)
			expect(markdownCells[0].index).toBe(0)
		})
	})

	describe("Cell Modification", () => {
		it("should update cell content", () => {
			const newContent = "# Updated Title\nNew content here"
			const success = handler.updateCell(0, newContent)

			expect(success).toBe(true)
			const updatedCell = handler.getCellByIndex(0)
			// Jupyter format adds newline to each line except possibly the last
			expect(updatedCell?.source).toEqual(["# Updated Title\n", "New content here\n"])
		})

		it("should insert a new cell", () => {
			const success = handler.insertCell(1, "code", "print('New cell')")

			expect(success).toBe(true)
			expect(handler.getCellCount()).toBe(4)

			const newCell = handler.getCellByIndex(1)
			expect(newCell?.cell_type).toBe("code")
			// Single line cells get a newline appended
			expect(newCell?.source).toEqual(["print('New cell')\n"])
		})

		it("should delete a cell", () => {
			const success = handler.deleteCell(1)

			expect(success).toBe(true)
			expect(handler.getCellCount()).toBe(2)

			// Check that the second code cell is now at index 1
			const cell = handler.getCellByIndex(1)
			expect(cell?.source).toEqual(["def hello():\n", "    print('Hello, World!')"])
		})

		it("should return false for invalid cell operations", () => {
			expect(handler.updateCell(-1, "content")).toBe(false)
			expect(handler.updateCell(10, "content")).toBe(false)
			expect(handler.insertCell(-1, "code", "content")).toBe(false)
			expect(handler.deleteCell(10)).toBe(false)
		})
	})

	describe("Text Extraction", () => {
		it("should extract text with cell markers", () => {
			const text = handler.extractTextWithCellMarkers()

			expect(text).toContain("# %%% Cell 1 [markdown]")
			expect(text).toContain("# %%% Cell 2 [code]")
			expect(text).toContain("# %%% Cell 3 [code]")
			expect(text).toContain("# Test Notebook")
			expect(text).toContain("import numpy as np")
			expect(text).toContain("def hello():")
		})

		it("should extract specific cells text", () => {
			const text = handler.extractCellsText([0, 2])

			expect(text).toContain("# Cell 1 [markdown]")
			expect(text).toContain("# Test Notebook")
			expect(text).toContain("# Cell 3 [code]")
			expect(text).toContain("def hello():")
			expect(text).not.toContain("import numpy")
		})

		it("should extract all cells text when no indices provided", () => {
			const text = handler.extractCellsText()

			expect(text).toContain("# Cell 1 [markdown]")
			expect(text).toContain("# Cell 2 [code]")
			expect(text).toContain("# Cell 3 [code]")
		})
	})

	describe("Cell Search", () => {
		it("should search for content in cells", () => {
			const results = handler.searchInCells("import")

			expect(results).toHaveLength(1)
			expect(results[0].cellIndex).toBe(1)
			expect(results[0].matches).toHaveLength(2)
			expect(results[0].matches[0]).toBe("import numpy as np")
		})

		it("should return empty array when no matches found", () => {
			const results = handler.searchInCells("nonexistent")
			expect(results).toHaveLength(0)
		})
	})

	describe("Cell Diff", () => {
		it("should apply diff to a specific cell", () => {
			const success = handler.applyCellDiff(2, "def hello():", "def greet(name):")

			expect(success).toBe(true)
			const cell = handler.getCellByIndex(2)
			// Check the actual content after replacement
			const sourceStr = Array.isArray(cell?.source) ? cell.source.join("") : cell?.source
			expect(sourceStr).toContain("def greet(name):")
		})

		it("should return false when search content not found", () => {
			const success = handler.applyCellDiff(2, "nonexistent", "replacement")

			expect(success).toBe(false)
		})
	})

	describe("Line Number Mapping", () => {
		it("should get cell at specific line number", () => {
			const cellRef = handler.getCellAtLine(1)
			expect(cellRef).toBeDefined()
			expect(cellRef?.index).toBe(0)
			expect(cellRef?.type).toBe("markdown")

			const cellRef2 = handler.getCellAtLine(4)
			expect(cellRef2).toBeDefined()
			expect(cellRef2?.index).toBe(1)
			expect(cellRef2?.type).toBe("code")
		})

		it("should return undefined for invalid line number", () => {
			const cellRef = handler.getCellAtLine(100)
			expect(cellRef).toBeUndefined()
		})
	})

	describe("JSON Serialization", () => {
		it("should serialize to JSON", () => {
			const json = handler.toJSON()
			const parsed = JSON.parse(json)

			expect(parsed.cells).toHaveLength(3)
			expect(parsed.metadata).toBeDefined()
			expect(parsed.nbformat).toBe(4)
		})
	})

	describe("Checkpoint Support", () => {
		it("should create checkpoint representation", () => {
			const checkpoint = handler.getCheckpointRepresentation()

			expect(checkpoint).toContain("# %%% Cell")
			expect(checkpoint).toContain("# Test Notebook")
			expect(checkpoint).toContain("import numpy as np")
		})

		it("should restore from checkpoint representation", () => {
			const checkpoint = handler.getCheckpointRepresentation()
			const restored = JupyterNotebookHandler.fromCheckpointRepresentation(checkpoint, sampleNotebook)

			expect(restored.cells).toHaveLength(3)
			expect(restored.cells[0].cell_type).toBe("markdown")
			expect(restored.cells[1].cell_type).toBe("code")
			expect(restored.cells[2].cell_type).toBe("code")
		})
	})

	describe("Edge Cases", () => {
		it("should handle empty notebook", () => {
			const emptyHandler = new JupyterNotebookHandler(
				"empty.ipynb",
				JSON.stringify({
					cells: [],
					metadata: {},
				}),
			)

			expect(emptyHandler.getCellCount()).toBe(0)
			expect(emptyHandler.extractTextWithCellMarkers()).toBe("")
			expect(emptyHandler.searchInCells("test")).toHaveLength(0)
		})

		it("should handle cells with string source instead of array", () => {
			const notebook = {
				cells: [
					{
						cell_type: "code" as const,
						source: "print('single line')",
						metadata: {},
					},
				],
			}

			const handler = new JupyterNotebookHandler("test.ipynb", JSON.stringify(notebook))
			expect(handler.getCellByIndex(0)?.source).toBe("print('single line')")

			// Update should preserve the format
			handler.updateCell(0, "print('updated')")
			expect(handler.getCellByIndex(0)?.source).toBe("print('updated')")
		})

		it("should handle cells with empty source", () => {
			const notebook = {
				cells: [
					{
						cell_type: "code" as const,
						source: [],
						metadata: {},
					},
				],
			}

			const handler = new JupyterNotebookHandler("test.ipynb", JSON.stringify(notebook))
			const text = handler.extractTextWithCellMarkers()
			expect(text).toContain("# %%% Cell 1 [code]")
		})
	})
})
