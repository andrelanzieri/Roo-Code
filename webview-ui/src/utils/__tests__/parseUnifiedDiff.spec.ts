import { parseUnifiedDiff } from "@/utils/parseUnifiedDiff"

describe("parseUnifiedDiff - collapse identical -/+ pairs", () => {
	it("collapses deletion+addition of identical text into a single context line", () => {
		// Typical trailing-newline-only change at EOF with an additional appended line
		const diff = ["@@ -1,1 +1,2 @@", "-old", "+old", "+new", ""].join("\n")

		const lines = parseUnifiedDiff(diff)

		// Should normalize the replace of identical line into context, plus the appended line
		expect(lines.map((l) => l.type)).toEqual(["context", "addition"])
		expect(lines[0].content).toBe("old")
		expect(lines[1].content).toBe("new")
		// Line numbers should be preserved appropriately
		expect(lines[0].oldLineNum).toBe(1)
		expect(lines[0].newLineNum).toBe(1)
		expect(lines[1].oldLineNum).toBeNull()
		expect(lines[1].newLineNum).toBe(2)
	})

	it("does not collapse when content differs (true replacement)", () => {
		const diff = ["@@ -1,1 +1,1 @@", "-old", "+new", ""].join("\n")

		const lines = parseUnifiedDiff(diff)

		// Keep as deletion + addition for a real replacement
		expect(lines.map((l) => l.type)).toEqual(["deletion", "addition"])
		expect(lines[0].content).toBe("old")
		expect(lines[1].content).toBe("new")
	})
})
