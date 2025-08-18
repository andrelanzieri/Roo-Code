import { MultiSearchReplaceDiffStrategy } from "../multi-search-replace"
import { MultiFileSearchReplaceDiffStrategy } from "../multi-file-search-replace"

describe("Identical diff handling", () => {
	describe("MultiSearchReplaceDiffStrategy", () => {
		let strategy: MultiSearchReplaceDiffStrategy

		beforeEach(() => {
			strategy = new MultiSearchReplaceDiffStrategy()
		})

		it("should treat identical search and replace content as successful no-op", async () => {
			const originalContent = `function test() {
    console.log("hello");
    return true;
}`
			const diffContent = `test.ts
<<<<<<< SEARCH
    console.log("hello");
=======
    console.log("hello");
>>>>>>> REPLACE`

			const result = await strategy.applyDiff(originalContent, diffContent)
			expect(result.success).toBe(true)
			if (result.success) {
				// Content should remain unchanged
				expect(result.content).toBe(originalContent)
			}
		})

		it("should handle multiple diffs where some are identical (no-op)", async () => {
			const originalContent = `function test() {
    console.log("hello");
    console.log("world");
    return true;
}`
			const diffContent = `test.ts
<<<<<<< SEARCH
    console.log("hello");
=======
    console.log("hello");
>>>>>>> REPLACE

<<<<<<< SEARCH
    console.log("world");
=======
    console.log("universe");
>>>>>>> REPLACE`

			const result = await strategy.applyDiff(originalContent, diffContent)
			expect(result.success).toBe(true)
			if (result.success) {
				// First diff is no-op, second diff should apply
				expect(result.content).toBe(`function test() {
    console.log("hello");
    console.log("universe");
    return true;
}`)
			}
		})

		it("should handle all identical diffs as successful no-op", async () => {
			const originalContent = `class Example {
    constructor() {
        this.value = 0;
    }
}`
			const diffContent = `test.ts
<<<<<<< SEARCH
    constructor() {
        this.value = 0;
    }
=======
    constructor() {
        this.value = 0;
    }
>>>>>>> REPLACE

<<<<<<< SEARCH
class Example {
=======
class Example {
>>>>>>> REPLACE`

			const result = await strategy.applyDiff(originalContent, diffContent)
			expect(result.success).toBe(true)
			if (result.success) {
				// All diffs are no-op, content should remain unchanged
				expect(result.content).toBe(originalContent)
			}
		})

		it("should handle identical diffs with line numbers as no-op", async () => {
			const originalContent = `function test() {
    const x = 1;
    return x;
}`
			const diffContent = `test.ts
<<<<<<< SEARCH
:start_line:2
-------
    const x = 1;
=======
    const x = 1;
>>>>>>> REPLACE`

			const result = await strategy.applyDiff(originalContent, diffContent)
			expect(result.success).toBe(true)
			if (result.success) {
				// Content should remain unchanged
				expect(result.content).toBe(originalContent)
			}
		})
	})

	describe("MultiFileSearchReplaceDiffStrategy", () => {
		let strategy: MultiFileSearchReplaceDiffStrategy

		beforeEach(() => {
			strategy = new MultiFileSearchReplaceDiffStrategy()
		})

		it("should treat identical search and replace content as successful no-op", async () => {
			const originalContent = `function test() {
    console.log("hello");
    return true;
}`
			const diffContent = `test.ts
<<<<<<< SEARCH
    console.log("hello");
=======
    console.log("hello");
>>>>>>> REPLACE`

			const result = await strategy.applyDiff(originalContent, diffContent)
			expect(result.success).toBe(true)
			if (result.success) {
				// Content should remain unchanged
				expect(result.content).toBe(originalContent)
			}
		})

		it("should handle array of diffs with identical content as no-op", async () => {
			const originalContent = `function test() {
    console.log("hello");
    console.log("world");
    return true;
}`
			const diffItems = [
				{
					content: `<<<<<<< SEARCH
    console.log("hello");
=======
    console.log("hello");
>>>>>>> REPLACE`,
					startLine: undefined,
				},
				{
					content: `<<<<<<< SEARCH
    console.log("world");
=======
    console.log("universe");
>>>>>>> REPLACE`,
					startLine: undefined,
				},
			]

			const result = await strategy.applyDiff(originalContent, diffItems)
			expect(result.success).toBe(true)
			if (result.success) {
				// First diff is no-op, second diff should apply
				expect(result.content).toBe(`function test() {
    console.log("hello");
    console.log("universe");
    return true;
}`)
			}
		})

		it("should handle all identical diffs in array as successful no-op", async () => {
			const originalContent = `class Example {
    constructor() {
        this.value = 0;
    }
}`
			const diffItems = [
				{
					content: `<<<<<<< SEARCH
    constructor() {
        this.value = 0;
    }
=======
    constructor() {
        this.value = 0;
    }
>>>>>>> REPLACE`,
					startLine: undefined,
				},
				{
					content: `<<<<<<< SEARCH
class Example {
=======
class Example {
>>>>>>> REPLACE`,
					startLine: undefined,
				},
			]

			const result = await strategy.applyDiff(originalContent, diffItems)
			expect(result.success).toBe(true)
			if (result.success) {
				// All diffs are no-op, content should remain unchanged
				expect(result.content).toBe(originalContent)
			}
		})
	})
})
