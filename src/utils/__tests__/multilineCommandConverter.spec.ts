// npx vitest run src/utils/__tests__/multilineCommandConverter.spec.ts

import { describe, it, expect } from "vitest"
import { convertMultilineToSingleLine, shouldConvertCommand } from "../multilineCommandConverter"

describe("multilineCommandConverter", () => {
	describe("shouldConvertCommand", () => {
		it("should return false for single-line commands", () => {
			expect(shouldConvertCommand('echo "hello world"')).toBe(false)
			expect(shouldConvertCommand("ls -la")).toBe(false)
		})

		it("should return true for multiline commands", () => {
			expect(shouldConvertCommand('echo "hello"\necho "world"')).toBe(true)
		})

		it("should return false for Here Documents", () => {
			const hereDoc = `cat <<EOF
Hello World
EOF`
			expect(shouldConvertCommand(hereDoc)).toBe(false)
		})
	})

	describe("convertMultilineToSingleLine", () => {
		describe("Basic functionality", () => {
			it("should handle simple multiline commands", () => {
				const input = `echo "hello"
echo "world"`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toBe('echo "hello" ; echo "world"')
			})

			it("should handle line continuations with backslash", () => {
				const input = `echo "This is a very \\
long command that \\
spans multiple lines"`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toBe('echo "This is a very long command that spans multiple lines"')
			})

			it("should handle pipes at end of line", () => {
				const input = `cat file.txt |
grep "pattern" |
sort`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				// Pipes don't need semicolons
				expect(result.command).toBe('cat file.txt | grep "pattern" | sort')
			})

			it("should handle logical operators", () => {
				const input = `command1 &&
command2 ||
command3`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				// Logical operators don't need semicolons
				expect(result.command).toBe("command1 && command2 || command3")
			})

			it("should handle empty lines", () => {
				const input = `echo "start"

echo "middle"

echo "end"`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toBe('echo "start" ; echo "middle" ; echo "end"')
			})

			it("should return original for single-line commands", () => {
				const input = 'echo "hello world"'
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toBe(input)
			})
		})

		describe("Shell constructs", () => {
			it("should handle if statements", () => {
				const input = `if [ -f file.txt ]
then
  echo "File exists"
else
  echo "File not found"
fi`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				// Basic conversion joins with semicolons
				expect(result.command).toContain("if [ -f file.txt ]")
				expect(result.command).toContain("then")
				expect(result.command).toContain('echo "File exists"')
				expect(result.command).toContain("else")
				expect(result.command).toContain('echo "File not found"')
				expect(result.command).toContain("fi")
			})

			it("should handle for loops", () => {
				const input = `for i in 1 2 3
do
  echo $i
done`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toContain("for i in 1 2 3")
				expect(result.command).toContain("do")
				expect(result.command).toContain("echo $i")
				expect(result.command).toContain("done")
			})

			it("should handle while loops", () => {
				const input = `while [ $count -lt 10 ]
do
  echo $count
  count=$((count + 1))
done`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toContain("while [ $count -lt 10 ]")
				expect(result.command).toContain("do")
				expect(result.command).toContain("echo $count")
				expect(result.command).toContain("count=$((count + 1))")
				expect(result.command).toContain("done")
			})

			it("should handle functions", () => {
				const input = `function myFunc() {
  echo "Hello"
  return 0
}`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toContain("function myFunc() {")
				expect(result.command).toContain('echo "Hello"')
				expect(result.command).toContain("return 0")
				expect(result.command).toContain("}")
			})

			it("should handle command grouping", () => {
				const input = `(
  cd /tmp
  ls -la
)`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toContain("(")
				expect(result.command).toContain("cd /tmp")
				expect(result.command).toContain("ls -la")
				expect(result.command).toContain(")")
			})
		})

		describe("PowerShell", () => {
			it("should handle simple PowerShell commands", () => {
				const input = `Write-Host "Hello"
Write-Host "World"`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toBe('Write-Host "Hello" ; Write-Host "World"')
			})

			it("should handle line continuations with backtick", () => {
				const input = `Get-ChildItem \`
  -Path "C:\\Users" \`
  -Recurse`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toBe('Get-ChildItem -Path "C:\\Users" -Recurse')
			})

			it("should handle pipes in PowerShell", () => {
				const input = `Get-Process |
  Where-Object {$_.CPU -gt 10} |
  Sort-Object CPU`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toBe("Get-Process | Where-Object {$_.CPU -gt 10} | Sort-Object CPU")
			})

			it("should handle PowerShell if statements", () => {
				const input = `if ($true) {
  Write-Host "True"
} else {
  Write-Host "False"
}`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toContain("if ($true) {")
				expect(result.command).toContain('Write-Host "True"')
				expect(result.command).toContain("} else {")
				expect(result.command).toContain('Write-Host "False"')
			})

			it("should handle PowerShell foreach loops", () => {
				const input = `foreach ($item in $items) {
  Write-Host $item
}`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toContain("foreach ($item in $items) {")
				expect(result.command).toContain("Write-Host $item")
				expect(result.command).toContain("}")
			})
		})

		describe("Here Documents", () => {
			it("should not convert Here Documents", () => {
				const input = `cat <<EOF
This is a here document
It should not be converted
EOF`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(false)
				expect(result.command).toBe(input)
				expect(result.reason).toContain("Here Document")
			})

			it("should detect various Here Document formats", () => {
				const inputs = [
					`cat <<-EOF\nContent\nEOF`,
					`cat <<"END"\nContent\nEND`,
					`cat <<'MARKER'\nContent\nMARKER`,
					`python <<SCRIPT\nprint("hello")\nSCRIPT`,
				]

				inputs.forEach((input) => {
					const result = convertMultilineToSingleLine(input)
					expect(result.success).toBe(false)
					expect(result.reason).toContain("Here Document")
				})
			})
		})

		describe("Edge cases", () => {
			it("should handle commands with semicolons already present", () => {
				const input = `echo "one";
echo "two";
echo "three"`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				// Should not add extra semicolons
				expect(result.command).toBe('echo "one"; echo "two"; echo "three"')
			})

			it("should handle mixed line endings", () => {
				const input = 'echo "one"\r\necho "two"\necho "three"'
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toContain('echo "one"')
				expect(result.command).toContain('echo "two"')
				expect(result.command).toContain('echo "three"')
			})

			it("should handle very long commands", () => {
				const lines = []
				for (let i = 0; i < 100; i++) {
					lines.push(`echo "Line ${i}"`)
				}
				const input = lines.join("\n")
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toContain('echo "Line 0"')
				expect(result.command).toContain('echo "Line 99"')
				expect(result.command.split(";").length).toBeGreaterThan(50)
			})
		})

		describe("Real-world examples", () => {
			it("should handle a complex bash script", () => {
				const input = `if [ -d "$DIR" ]; then
  echo "Processing directory: $DIR"
  for file in "$DIR"/*.txt; do
    if [ -f "$file" ]; then
      echo "Found: $(basename "$file")"
      cat "$file" |
        grep -E "pattern" |
        sort > output.txt
    fi
  done
else
  echo "Directory not found"
fi`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toContain('if [ -d "$DIR" ]')
				expect(result.command).toContain('for file in "$DIR"/*.txt')
				expect(result.command).toContain('grep -E "pattern"')
				expect(result.command).toContain("sort > output.txt")
			})

			it("should handle a git command with multiple lines", () => {
				const input = `git log --oneline \\
  --graph \\
  --decorate \\
  --all`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toBe("git log --oneline --graph --decorate --all")
			})

			it("should handle a docker command", () => {
				const input = `docker run \\
  -d \\
  --name mycontainer \\
  -p 8080:80 \\
  -v /host/path:/container/path \\
  nginx:latest`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toBe(
					"docker run -d --name mycontainer -p 8080:80 -v /host/path:/container/path nginx:latest",
				)
			})

			it("should handle a curl command", () => {
				const input = `curl -X POST \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer token" \\
  -d '{"key": "value"}' \\
  https://api.example.com/endpoint`
				const result = convertMultilineToSingleLine(input)
				expect(result.success).toBe(true)
				expect(result.command).toBe(
					'curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer token" -d \'{"key": "value"}\' https://api.example.com/endpoint',
				)
			})
		})
	})
})
