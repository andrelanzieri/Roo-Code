import { parseAssistantMessageV2 } from "../parseAssistantMessageV2"
import { ToolUse } from "../../../shared/tools"

describe("parseAssistantMessageV2 - Issue #7664", () => {
	describe("handling malformed XML structure from LLMs", () => {
		it("should handle the exact structure from juliettefournier-econ's example", () => {
			// This is the exact structure that was causing issues
			const message = `I'll read that file for you.

<read_file>
<args>
<file>
<path>src/shared/infrastructure/supabase/factory.py</path>
<line_range>10-20</line_range>
</file>
</args>
</read_file>`

			const result = parseAssistantMessageV2(message)

			// Should have text and tool use
			expect(result).toHaveLength(2)
			expect(result[0].type).toBe("text")
			expect(result[1].type).toBe("tool_use")

			const toolUse = result[1] as ToolUse
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.args).toBeDefined()
			expect(toolUse.params.args).toContain("<file>")
			expect(toolUse.params.args).toContain("<path>src/shared/infrastructure/supabase/factory.py</path>")
			expect(toolUse.params.args).toContain("<line_range>10-20</line_range>")
		})

		it("should handle structure with no spaces between XML tags", () => {
			const message = `<read_file><args><file><path>test.py</path><line_range>1-10</line_range></file></args></read_file>`

			const result = parseAssistantMessageV2(message)

			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.args).toBeDefined()
			expect(toolUse.params.args).toContain("<path>test.py</path>")
			expect(toolUse.params.args).toContain("<line_range>1-10</line_range>")
		})

		it("should handle structure with mixed spacing and newlines", () => {
			const message = `<read_file>
  <args>
    <file><path>  src/test.py  </path>
      <line_range>1-10</line_range>
    </file>
  </args>
</read_file>`

			const result = parseAssistantMessageV2(message)

			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.args).toBeDefined()
			// The args should preserve the internal structure
			expect(toolUse.params.args).toContain("<file>")
			expect(toolUse.params.args).toContain("<path>")
			expect(toolUse.params.args).toContain("src/test.py")
			expect(toolUse.params.args).toContain("</path>")
			expect(toolUse.params.args).toContain("<line_range>1-10</line_range>")
		})

		it("should handle empty path element", () => {
			const message = `<read_file>
<args>
<file>
<path></path>
<line_range>10-20</line_range>
</file>
</args>
</read_file>`

			const result = parseAssistantMessageV2(message)

			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.args).toBeDefined()
			expect(toolUse.params.args).toContain("<path></path>")
		})

		it("should handle self-closing path element", () => {
			const message = `<read_file>
<args>
<file>
<path/>
<line_range>10-20</line_range>
</file>
</args>
</read_file>`

			const result = parseAssistantMessageV2(message)

			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.args).toBeDefined()
			expect(toolUse.params.args).toContain("<path/>")
		})

		it("should handle multiple files with varying structures", () => {
			const message = `<read_file>
<args>
<file>
<path> ./file1.ts </path>
</file>
<file>
<path>
  ./file2.ts
</path>
<line_range>10-20</line_range>
</file>
</args>
</read_file>`

			const result = parseAssistantMessageV2(message)

			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.args).toBeDefined()
			// Check that both files are present
			expect(toolUse.params.args).toContain("./file1.ts")
			expect(toolUse.params.args).toContain("./file2.ts")
			expect(toolUse.params.args).toContain("<line_range>10-20</line_range>")
		})

		it("should handle partial/incomplete tool use", () => {
			const message = `<read_file>
<args>
<file>
<path>test.py</path>`
			// Message ends abruptly

			const result = parseAssistantMessageV2(message)

			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.partial).toBe(true)
			expect(toolUse.params.args).toBeDefined()
			expect(toolUse.params.args).toContain("<path>test.py</path>")
		})
	})

	describe("args parameter trimming behavior", () => {
		it("should trim args parameter content", () => {
			const message = `<read_file>
<args>
  
  <file>
    <path>test.py</path>
  </file>
  
</args>
</read_file>`

			const result = parseAssistantMessageV2(message)

			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.params.args).toBeDefined()
			// args should be trimmed
			expect(toolUse.params.args).not.toMatch(/^\s+/)
			expect(toolUse.params.args).not.toMatch(/\s+$/)
			expect(toolUse.params.args).toMatch(/^<file>/)
			expect(toolUse.params.args).toMatch(/<\/file>$/)
		})
	})
})
