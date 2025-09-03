import { describe, it, expect, beforeEach } from "vitest"
import {
	JupyterNotebookSecurity,
	SecurityConfig,
	SecurityUtils,
	createDefaultSecurity,
} from "../jupyter-notebook-security"
import { JupyterNotebook, JupyterCell } from "../jupyter-notebook-handler"

describe("JupyterNotebookSecurity", () => {
	let security: JupyterNotebookSecurity
	let defaultConfig: SecurityConfig

	beforeEach(() => {
		defaultConfig = {
			allowCodeExecution: false,
			readOnlyMode: true,
			maxCellSize: 1000,
			maxCellCount: 10,
			allowDangerousImports: false,
			enableWarnings: true,
		}
		security = new JupyterNotebookSecurity(defaultConfig)
	})

	describe("Code Cell Analysis", () => {
		it("should detect eval/exec usage", () => {
			const risks = security.analyzeCodeCell("eval('print(1)')")
			// May detect multiple risks (eval pattern and blocked pattern)
			const evalRisks = risks.filter((r) => r.type === "eval")
			expect(evalRisks.length).toBeGreaterThan(0)
			expect(evalRisks[0].type).toBe("eval")
			expect(evalRisks[0].severity).toBe("critical")
		})

		it("should detect dangerous imports", () => {
			const code = `
import subprocess
import os
from socket import *
import pickle
			`
			const risks = security.analyzeCodeCell(code)
			const importRisks = risks.filter((r) => r.type === "import")
			expect(importRisks.length).toBeGreaterThan(0)
			expect(importRisks.some((r) => r.pattern === "subprocess")).toBe(true)
			expect(importRisks.some((r) => r.pattern === "os")).toBe(true)
		})

		it("should detect system command execution", () => {
			const risks1 = security.analyzeCodeCell("!ls -la")
			expect(risks1.some((r) => r.type === "system_command")).toBe(true)

			const risks2 = security.analyzeCodeCell("%system pwd")
			expect(risks2.some((r) => r.type === "system_command")).toBe(true)
		})

		it("should detect file system access", () => {
			const code = `
with open('file.txt', 'r') as f:
    content = f.read()
			`
			const risks = security.analyzeCodeCell(code)
			expect(risks.some((r) => r.type === "file_access")).toBe(true)
		})

		it("should detect network operations", () => {
			const code = `
import urllib.request
response = urllib.request.urlopen('http://example.com')
			`
			const risks = security.analyzeCodeCell(code)
			expect(risks.some((r) => r.type === "network")).toBe(true)
		})

		it("should detect subprocess usage", () => {
			const code = `
import subprocess
result = subprocess.run(['ls', '-l'], capture_output=True)
			`
			const risks = security.analyzeCodeCell(code)
			expect(risks.some((r) => r.severity === "high")).toBe(true)
		})

		it("should allow safe code", () => {
			const code = `
import math
import json
from datetime import datetime

def calculate(x, y):
    return math.sqrt(x**2 + y**2)

result = calculate(3, 4)
print(f"Result: {result}")
			`
			const risks = security.analyzeCodeCell(code)
			// Should only have warnings about imports, not critical/high risks
			const highRisks = risks.filter((r) => r.severity === "high" || r.severity === "critical")
			expect(highRisks).toHaveLength(0)
		})
	})

	describe("Markdown Cell Analysis", () => {
		it("should detect embedded JavaScript", () => {
			const content = `
# Title
<script>alert('XSS')</script>
Some text
			`
			const risks = security.analyzeMarkdownCell(content)
			expect(risks.some((r) => r.type === "code_execution")).toBe(true)
		})

		it("should detect iframes", () => {
			const content = `
<iframe src="http://malicious.com"></iframe>
			`
			const risks = security.analyzeMarkdownCell(content)
			expect(risks.some((r) => r.type === "network")).toBe(true)
		})

		it("should detect data URIs with scripts", () => {
			const content = `
<img src="data:text/html,<script>alert('XSS')</script>">
			`
			const risks = security.analyzeMarkdownCell(content)
			expect(risks.some((r) => r.type === "code_execution")).toBe(true)
		})

		it("should allow safe markdown", () => {
			const content = `
# Safe Markdown
This is **bold** and *italic* text.
- List item 1
- List item 2

[Link](https://example.com)
![Image](image.png)
			`
			const risks = security.analyzeMarkdownCell(content)
			expect(risks).toHaveLength(0)
		})
	})

	describe("Notebook Validation", () => {
		it("should validate cell count", () => {
			const notebook: JupyterNotebook = {
				cells: Array(15).fill({
					cell_type: "code",
					source: "print('test')",
					metadata: {},
				}),
			}

			const result = security.validateNotebook(notebook)
			expect(result.isValid).toBe(false)
			expect(result.errors.some((e) => e.includes("exceeds maximum cell count"))).toBe(true)
		})

		it("should validate cell size", () => {
			const largeContent = "x".repeat(1500)
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: largeContent,
						metadata: {},
					},
				],
			}

			const result = security.validateNotebook(notebook)
			expect(result.isValid).toBe(false)
			expect(result.errors.some((e) => e.includes("exceeds maximum size"))).toBe(true)
		})

		it("should detect dangerous code in cells", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import os\nos.system('rm -rf /')",
						metadata: {},
					},
				],
			}

			const result = security.validateNotebook(notebook)
			expect(result.isValid).toBe(false)
			expect(result.errors.length).toBeGreaterThan(0)
		})

		it("should validate clean notebook", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "markdown",
						source: "# Clean Notebook",
						metadata: {},
					},
					{
						cell_type: "code",
						source: "print('Hello, World!')",
						metadata: {},
					},
				],
			}

			const result = security.validateNotebook(notebook)
			expect(result.isValid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		it("should bypass validation for trusted sources", () => {
			const trustedSecurity = new JupyterNotebookSecurity({
				...defaultConfig,
				trustedSources: ["/trusted/path"],
			})

			const dangerousNotebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import os\nos.system('dangerous')",
						metadata: {},
					},
				],
			}

			const result = trustedSecurity.validateNotebook(dangerousNotebook, "/trusted/path/notebook.ipynb")
			expect(result.isValid).toBe(true)
			expect(result.warnings.some((w) => w.includes("trusted source"))).toBe(true)
		})
	})

	describe("Cell Sanitization", () => {
		it("should sanitize dangerous code cells", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import os\nos.system('rm -rf /')",
						metadata: {},
						outputs: [{ data: { "text/plain": "output" } }],
						execution_count: 1,
					},
				],
			}

			const sanitized = security.sanitizeNotebook(notebook)
			const cell = sanitized.cells[0] as JupyterCell

			// Should add warning comment
			const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source
			expect(source).toContain("SECURITY WARNING")

			// Should clear outputs
			expect(cell.outputs).toEqual([])
			expect(cell.execution_count).toBeNull()
		})

		it("should sanitize markdown cells with scripts", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "markdown",
						source: "# Title\n<script>alert('XSS')</script>\nText",
						metadata: {},
					},
				],
			}

			const sanitized = security.sanitizeNotebook(notebook)
			const cell = sanitized.cells[0]
			const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source

			expect(source).not.toContain("<script>")
			expect(source).toContain("Script removed for security")
		})

		it("should sanitize iframes in markdown", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "markdown",
						source: "<iframe src='http://evil.com'></iframe>",
						metadata: {},
					},
				],
			}

			const sanitized = security.sanitizeNotebook(notebook)
			const cell = sanitized.cells[0]
			const source = Array.isArray(cell.source) ? cell.source.join("") : cell.source

			expect(source).not.toContain("<iframe")
			expect(source).toContain("Iframe removed for security")
		})

		it("should remove suspicious metadata", () => {
			const notebook: JupyterNotebook = {
				cells: [],
				metadata: {
					kernelspec: { name: "python3" },
					widgets: { some: "data" },
					extensions: { malicious: "code" },
					normal: "metadata",
				},
			}

			const sanitized = security.sanitizeNotebook(notebook)

			expect(sanitized.metadata?.widgets).toBeUndefined()
			expect(sanitized.metadata?.extensions).toBeUndefined()
			expect(sanitized.metadata?.normal).toBe("metadata")
		})
	})

	describe("Operation Permissions", () => {
		it("should always allow read operations", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import os\nos.system('dangerous')",
						metadata: {},
					},
				],
			}

			expect(security.shouldAllowOperation("read", notebook)).toBe(true)
		})

		it("should deny write operations in read-only mode for invalid notebooks", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import os\nos.system('dangerous')",
						metadata: {},
					},
				],
			}

			expect(security.shouldAllowOperation("write", notebook)).toBe(false)
		})

		it("should allow write operations for valid notebooks", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "print('safe')",
						metadata: {},
					},
				],
			}

			expect(security.shouldAllowOperation("write", notebook)).toBe(true)
		})

		it("should deny execution unless explicitly enabled", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "print('safe')",
						metadata: {},
					},
				],
			}

			// Default config has allowCodeExecution: false
			expect(security.shouldAllowOperation("execute", notebook)).toBe(false)

			// Enable code execution
			security.updateConfig({ allowCodeExecution: true })
			expect(security.shouldAllowOperation("execute", notebook)).toBe(true)
		})

		it("should deny execution for notebooks with errors even if enabled", () => {
			security.updateConfig({ allowCodeExecution: true })

			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import os\nos.system('dangerous')",
						metadata: {},
					},
				],
			}

			expect(security.shouldAllowOperation("execute", notebook)).toBe(false)
		})
	})

	describe("Security Recommendations", () => {
		it("should provide recommendations for high-risk notebooks", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import subprocess\nsubprocess.run(['ls'])",
						metadata: {},
					},
				],
			}

			const recommendations = security.getSecurityRecommendations(notebook)

			expect(recommendations.some((r) => r.includes("high-risk"))).toBe(true)
			expect(recommendations.some((r) => r.includes("isolated environment"))).toBe(true)
		})

		it("should recommend reviewing imports", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import os\nimport sys",
						metadata: {},
					},
				],
			}

			const recommendations = security.getSecurityRecommendations(notebook)
			expect(recommendations.some((r) => r.includes("imported modules"))).toBe(true)
		})

		it("should indicate safe notebooks", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "print('Hello')",
						metadata: {},
					},
				],
			}

			const recommendations = security.getSecurityRecommendations(notebook)
			expect(recommendations.some((r) => r.includes("✅"))).toBe(true)
		})
	})

	describe("Configuration Management", () => {
		it("should update configuration", () => {
			const newConfig: Partial<SecurityConfig> = {
				allowCodeExecution: true,
				maxCellSize: 2000,
			}

			security.updateConfig(newConfig)
			const config = security.getConfig()

			expect(config.allowCodeExecution).toBe(true)
			expect(config.maxCellSize).toBe(2000)
			expect(config.readOnlyMode).toBe(true) // Original value preserved
		})

		it("should use default configuration", () => {
			const defaultSecurity = createDefaultSecurity()
			const config = defaultSecurity.getConfig()

			expect(config.allowCodeExecution).toBe(false)
			expect(config.readOnlyMode).toBe(true)
			expect(config.enableWarnings).toBe(true)
		})
	})

	describe("SecurityUtils", () => {
		it("should detect code injection patterns", () => {
			expect(SecurityUtils.hasCodeInjection("eval('code')")).toBe(true)
			expect(SecurityUtils.hasCodeInjection("exec(command)")).toBe(true)
			expect(SecurityUtils.hasCodeInjection("<script>alert(1)</script>")).toBe(true)
			expect(SecurityUtils.hasCodeInjection("onclick='doSomething()'")).toBe(true)
			expect(SecurityUtils.hasCodeInjection("javascript:void(0)")).toBe(true)
			expect(SecurityUtils.hasCodeInjection("print('safe')")).toBe(false)
		})

		it("should get risk level from severity", () => {
			expect(SecurityUtils.getRiskLevel("low")).toBe(1)
			expect(SecurityUtils.getRiskLevel("medium")).toBe(2)
			expect(SecurityUtils.getRiskLevel("high")).toBe(3)
			expect(SecurityUtils.getRiskLevel("critical")).toBe(4)
		})

		it("should format security report", () => {
			const validation = {
				isValid: false,
				errors: ["Error 1", "Error 2"],
				warnings: ["Warning 1"],
			}

			const report = SecurityUtils.formatSecurityReport(validation)

			expect(report).toContain("❌ INVALID")
			expect(report).toContain("Error 1")
			expect(report).toContain("Error 2")
			expect(report).toContain("Warning 1")
		})
	})

	describe("Output Validation", () => {
		it("should validate output types", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "print('test')",
						metadata: {},
						outputs: [
							{
								data: {
									"text/plain": "output",
									"application/x-custom": "custom",
								},
							},
						],
					},
				],
			}

			const result = security.validateNotebook(notebook)
			expect(result.warnings.some((w) => w.includes("Unrecognized output type"))).toBe(true)
		})

		it("should detect JavaScript in HTML outputs", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "display(HTML('<script>alert(1)</script>'))",
						metadata: {},
						outputs: [
							{
								data: {
									"text/html": "<script>alert('XSS')</script>",
								},
							},
						],
					},
				],
			}

			const result = security.validateNotebook(notebook)
			expect(result.warnings.some((w) => w.includes("JavaScript detected in HTML output"))).toBe(true)
		})
	})

	describe("Metadata Validation", () => {
		it("should warn about non-Python kernels", () => {
			const notebook: JupyterNotebook = {
				cells: [],
				metadata: {
					kernelspec: {
						language: "javascript",
						name: "javascript",
					},
				},
			}

			const result = security.validateNotebook(notebook)
			expect(result.warnings.some((w) => w.includes("Non-Python kernel"))).toBe(true)
		})

		it("should detect suspicious metadata keys", () => {
			const notebook: JupyterNotebook = {
				cells: [],
				metadata: {
					widgets: {},
					extensions: {},
					plugins: {},
					hooks: {},
				},
			}

			const result = security.validateNotebook(notebook)
			const suspiciousWarnings = result.warnings.filter((w) => w.includes("suspicious metadata"))
			expect(suspiciousWarnings.length).toBeGreaterThan(0)
		})
	})

	describe("Complex Attack Patterns", () => {
		it("should detect obfuscated eval", () => {
			const code = `
e = chr(101) + chr(118) + chr(97) + chr(108)
globals()[e]('print("hacked")')
			`
			const risks = security.analyzeCodeCell(code)
			expect(risks.some((r) => r.type === "code_execution")).toBe(true)
		})

		it("should detect pickle deserialization", () => {
			const code = `
import pickle
data = pickle.loads(untrusted_data)
			`
			const risks = security.analyzeCodeCell(code)
			expect(risks.some((r) => r.severity === "high")).toBe(true)
		})

		it("should detect __import__ usage", () => {
			const code = `
module = __import__('os')
module.system('ls')
			`
			const risks = security.analyzeCodeCell(code)
			expect(risks.some((r) => r.severity === "high")).toBe(true)
		})
	})
})
