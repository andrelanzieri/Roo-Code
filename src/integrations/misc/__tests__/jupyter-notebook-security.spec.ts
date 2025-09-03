import { describe, it, expect, beforeEach } from "vitest"
import { JupyterNotebookSecurity, JupyterSecurityConfig } from "../jupyter-notebook-security"
import { JupyterNotebook } from "../jupyter-notebook-handler"

describe("JupyterNotebookSecurity", () => {
	let security: JupyterNotebookSecurity
	let sampleNotebook: JupyterNotebook

	beforeEach(() => {
		security = new JupyterNotebookSecurity()
		sampleNotebook = {
			cells: [
				{
					cell_type: "code",
					source: "print('Hello, World!')",
					metadata: {},
					outputs: [],
					execution_count: 1,
				},
				{
					cell_type: "markdown",
					source: "# Safe Markdown\nThis is safe content.",
					metadata: {},
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
			nbformat_minor: 5,
		}
	})

	describe("Safe notebooks", () => {
		it("should validate safe notebook as secure", () => {
			const result = security.validateNotebook(sampleNotebook)
			expect(result.isSecure).toBe(true)
			expect(result.risks).toHaveLength(0)
			expect(result.requiresReadOnly).toBe(false)
		})

		it("should allow basic Python operations", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import numpy as np\nimport pandas as pd\ndata = [1, 2, 3]\nprint(sum(data))",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(true)
			expect(result.risks).toHaveLength(0)
		})
	})

	describe("Dangerous code patterns", () => {
		it("should detect eval() usage", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "result = eval('2 + 2')",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "critical",
					type: "eval",
				}),
			)
		})

		it("should detect exec() usage", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "exec('import os')",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "critical",
					type: "exec",
				}),
			)
		})

		it("should detect shell commands", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "!rm -rf /",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "critical",
					type: "shell_command",
				}),
			)
		})

		it("should detect dangerous imports", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import subprocess\nsubprocess.run(['ls', '-la'])",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "high",
					type: "subprocess_import",
				}),
			)
		})

		it("should detect file operations", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "with open('/etc/passwd', 'r') as f:\n    content = f.read()",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(true) // Medium risk doesn't make it insecure
			expect(result.requiresReadOnly).toBe(false)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "medium",
					type: "file_open",
				}),
			)
		})

		it("should detect network operations", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import requests\nresponse = requests.get('http://example.com')",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(true) // Medium risk doesn't make it insecure
			expect(result.requiresReadOnly).toBe(false)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "medium",
					type: "network_request",
				}),
			)
		})
	})

	describe("Dangerous markdown patterns", () => {
		it("should detect script tags in markdown", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "markdown",
						source: "# Title\n<script>alert('XSS')</script>",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "high",
					type: "script_tag",
				}),
			)
		})

		it("should detect iframe tags", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "markdown",
						source: "<iframe src='http://malicious.com'></iframe>",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "high",
					type: "iframe_tag",
				}),
			)
		})

		it("should detect javascript: protocol", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "markdown",
						source: "[Click me](javascript:alert('XSS'))",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "high",
					type: "javascript_protocol",
				}),
			)
		})
	})

	describe("Output validation", () => {
		it("should detect dangerous HTML outputs", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "print('safe')",
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
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "high",
					type: "output_script",
				}),
			)
		})

		it("should detect JavaScript outputs", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "print('safe')",
						metadata: {},
						outputs: [
							{
								data: {
									"application/javascript": "console.log('executed')",
								},
							},
						],
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "high",
					type: "javascript_output",
				}),
			)
		})
	})

	describe("YOLO Mode", () => {
		it("should bypass all security checks when YOLO Mode is enabled", () => {
			const yoloSecurity = new JupyterNotebookSecurity({ yoloMode: true })
			const dangerousNotebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: 'eval(\'__import__("os").system("rm -rf /")\')',
						metadata: {},
					},
					{
						cell_type: "markdown",
						source: "<script>alert('XSS')</script>",
						metadata: {},
					},
				],
			}
			const result = yoloSecurity.validateNotebook(dangerousNotebook)
			expect(result.isSecure).toBe(true)
			expect(result.risks).toHaveLength(0)
			expect(result.requiresReadOnly).toBe(false)
		})

		it("should allow updating YOLO Mode configuration", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "eval('2+2')",
						metadata: {},
					},
				],
			}

			// Initially, security is enforced
			let result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)

			// Enable YOLO Mode
			security.updateConfig({ yoloMode: true })
			result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(true)
			expect(result.requiresReadOnly).toBe(false)

			// Disable YOLO Mode
			security.updateConfig({ yoloMode: false })
			result = security.validateNotebook(notebook)
			expect(result.isSecure).toBe(false)
			expect(result.requiresReadOnly).toBe(true)
		})

		it("should correctly report YOLO Mode status", () => {
			expect(security.isYoloModeEnabled()).toBe(false)

			security.updateConfig({ yoloMode: true })
			expect(security.isYoloModeEnabled()).toBe(true)

			security.updateConfig({ yoloMode: false })
			expect(security.isYoloModeEnabled()).toBe(false)
		})
	})

	describe("Sanitization", () => {
		it("should sanitize dangerous code cells", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "eval('malicious code')",
						metadata: {},
						outputs: [{ data: { "text/plain": "output" } }],
						execution_count: 1,
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.sanitizedNotebook).toBeDefined()
			const sanitizedCell = result.sanitizedNotebook!.cells[0]
			expect(sanitizedCell.source).toContain("SECURITY WARNING")
			expect(sanitizedCell.source).toContain("eval")
			expect(sanitizedCell.outputs).toHaveLength(0)
			expect(sanitizedCell.execution_count).toBeNull()
		})

		it("should sanitize dangerous markdown cells", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "markdown",
						source: "# Title\n<script>alert('XSS')</script>\n<iframe src='bad'></iframe>",
						metadata: {},
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.sanitizedNotebook).toBeDefined()
			const sanitizedCell = result.sanitizedNotebook!.cells[0]
			expect(sanitizedCell.source).toContain("[REMOVED: script tag]")
			expect(sanitizedCell.source).toContain("[REMOVED: iframe]")
			expect(sanitizedCell.source).not.toContain("<script>")
			expect(sanitizedCell.source).not.toContain("<iframe")
		})

		it("should remove dangerous outputs", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "import os", // High risk to trigger sanitization
						metadata: {},
						outputs: [
							{
								data: {
									"text/html": "<script>alert('XSS')</script>",
									"application/javascript": "console.log('bad')",
								},
							},
						],
					},
				],
			}
			const result = security.validateNotebook(notebook)
			expect(result.sanitizedNotebook).toBeDefined()

			// The cell should be sanitized because it has high-risk import
			const sanitizedCell = result.sanitizedNotebook!.cells[0]
			expect(sanitizedCell.source).toContain("SECURITY WARNING")

			// Outputs should be cleared for dangerous cells
			expect(sanitizedCell.outputs).toHaveLength(0)
		})

		it("should sanitize dangerous outputs in safe cells", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "print('safe code')", // Safe code
						metadata: {},
						outputs: [
							{
								data: {
									"text/html": "<div>Safe HTML</div>",
									"text/plain": ["safe output"],
								},
							},
							{
								data: {
									"text/html": "<script>alert('XSS')</script>",
									"application/javascript": "console.log('bad')",
								},
							},
						],
					},
				],
			}
			const result = security.validateNotebook(notebook)

			// Since the outputs have high-risk content (script tags), it should be flagged
			expect(result.isSecure).toBe(false)
			expect(result.sanitizedNotebook).toBeDefined()

			// The cell should be disabled because it has high-risk outputs
			const sanitizedCell = result.sanitizedNotebook!.cells[0]
			expect(sanitizedCell.source).toContain("SECURITY WARNING")
			expect(sanitizedCell.outputs).toHaveLength(0)
		})

		it("should not sanitize when YOLO Mode is enabled", () => {
			const yoloSecurity = new JupyterNotebookSecurity({ yoloMode: true })
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "eval('dangerous')",
						metadata: {},
					},
				],
			}
			const result = yoloSecurity.validateNotebook(notebook)
			expect(result.sanitizedNotebook).toBeUndefined()
		})
	})

	describe("Trusted sources", () => {
		it("should trust notebooks from trusted sources", () => {
			const securityWithTrusted = new JupyterNotebookSecurity({
				trustedSources: ["/trusted/path", "/safe/notebooks"],
			})
			const dangerousNotebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "eval('trusted code')",
						metadata: {},
					},
				],
			}
			const result = securityWithTrusted.validateNotebook(dangerousNotebook, "/trusted/path/notebook.ipynb")
			expect(result.isSecure).toBe(true)
			expect(result.risks).toHaveLength(0)
			expect(result.requiresReadOnly).toBe(false)
		})

		it("should not trust notebooks from untrusted sources", () => {
			const securityWithTrusted = new JupyterNotebookSecurity({
				trustedSources: ["/trusted/path"],
			})
			const dangerousNotebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "eval('untrusted code')",
						metadata: {},
					},
				],
			}
			const result = securityWithTrusted.validateNotebook(dangerousNotebook, "/untrusted/path/notebook.ipynb")
			expect(result.isSecure).toBe(false)
			expect(result.risks.length).toBeGreaterThan(0)
			expect(result.requiresReadOnly).toBe(true)
		})
	})

	describe("Size limits", () => {
		it("should detect oversized cells", () => {
			const largeContent = "x".repeat(2 * 1024 * 1024) // 2MB
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
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "medium",
					type: "oversized_cell",
				}),
			)
		})

		it("should detect excessive cell count", () => {
			const cells = Array(1001).fill({
				cell_type: "code",
				source: "print('cell')",
				metadata: {},
			})
			const notebook: JupyterNotebook = { cells }
			const result = security.validateNotebook(notebook)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "medium",
					type: "excessive_cells",
				}),
			)
		})
	})

	describe("Metadata validation", () => {
		it("should detect suspicious metadata fields", () => {
			const notebook: JupyterNotebook = {
				cells: [],
				metadata: {
					widgets: { some: "data" },
					extensions: { another: "data" },
					jupyter_dashboards: { layout: "grid" },
				},
			}
			const result = security.validateNotebook(notebook)
			expect(result.risks).toHaveLength(3)
			expect(result.risks).toContainEqual(
				expect.objectContaining({
					severity: "low",
					type: "suspicious_metadata",
					description: expect.stringContaining("widgets"),
				}),
			)
		})

		it("should sanitize suspicious metadata", () => {
			const notebook: JupyterNotebook = {
				cells: [
					{
						cell_type: "code",
						source: "eval('bad')",
						metadata: {},
					},
				],
				metadata: {
					widgets: { some: "data" },
					kernelspec: { name: "python3" },
				},
			}
			const result = security.validateNotebook(notebook)
			expect(result.sanitizedNotebook).toBeDefined()
			expect(result.sanitizedNotebook!.metadata?.widgets).toBeUndefined()
			expect(result.sanitizedNotebook!.metadata?.kernelspec).toBeDefined()
		})
	})
})
