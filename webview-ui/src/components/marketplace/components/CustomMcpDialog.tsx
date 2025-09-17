import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { InfoIcon } from "lucide-react"

interface CustomMcpDialogProps {
	onClose: () => void
	onSuccess: () => void
}

export function CustomMcpDialog({ onClose, onSuccess }: CustomMcpDialogProps) {
	const { t } = useAppTranslation()
	const [serverName, setServerName] = useState("")
	const [command, setCommand] = useState("")
	const [args, setArgs] = useState("")
	const [env, setEnv] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [showSerenaExample, setShowSerenaExample] = useState(false)

	const handleSubmit = async () => {
		// Validate inputs
		if (!serverName.trim()) {
			setError("Server name is required")
			return
		}
		if (!command.trim()) {
			setError("Command is required")
			return
		}

		setIsSubmitting(true)
		setError(null)

		try {
			// Parse arguments
			const argsList = args
				.split(",")
				.map((arg) => arg.trim())
				.filter((arg) => arg.length > 0)

			// Parse environment variables
			const envObj: Record<string, string> = {}
			if (env.trim()) {
				const envLines = env.split("\n")
				for (const line of envLines) {
					const trimmedLine = line.trim()
					if (trimmedLine && trimmedLine.includes("=")) {
						const [key, ...valueParts] = trimmedLine.split("=")
						envObj[key.trim()] = valueParts.join("=").trim()
					}
				}
			}

			// Create the MCP server configuration
			const mcpConfig = {
				command: command.trim(),
				args: argsList,
				...(Object.keys(envObj).length > 0 && { env: envObj }),
			}

			// Send message to add custom MCP server
			vscode.postMessage({
				type: "addCustomMcpServer",
				serverName: serverName.trim(),
				customMcpConfig: mcpConfig,
			})

			// Success - close dialog and notify parent
			onSuccess()
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add custom MCP server")
		} finally {
			setIsSubmitting(false)
		}
	}

	const loadSerenaExample = () => {
		setServerName("serena-mcp")
		setCommand("npx")
		setArgs("-y, @serena/mcp-server")
		setEnv("")
		setShowSerenaExample(false)
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("marketplace:customMcp.title")}</DialogTitle>
					<DialogDescription>{t("marketplace:customMcp.description")}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{showSerenaExample && (
						<Alert>
							<InfoIcon className="h-4 w-4" />
							<AlertDescription>
								<div className="space-y-2">
									<p>Looking to add Serena MCP server? Here&apos;s an example configuration:</p>
									<Button variant="link" className="p-0 h-auto" onClick={loadSerenaExample}>
										Load Serena Example
									</Button>
								</div>
							</AlertDescription>
						</Alert>
					)}

					<div className="space-y-2">
						<Label htmlFor="serverName">{t("marketplace:customMcp.serverName")}</Label>
						<Input
							id="serverName"
							value={serverName}
							onChange={(e) => setServerName(e.target.value)}
							placeholder={t("marketplace:customMcp.serverNamePlaceholder")}
							disabled={isSubmitting}
						/>
						{serverName === "" && (
							<Button
								variant="link"
								className="text-xs p-0 h-auto"
								onClick={() => setShowSerenaExample(true)}>
								Looking for Serena MCP?
							</Button>
						)}
					</div>

					<div className="space-y-2">
						<Label htmlFor="command">{t("marketplace:customMcp.command")}</Label>
						<Input
							id="command"
							value={command}
							onChange={(e) => setCommand(e.target.value)}
							placeholder={t("marketplace:customMcp.commandPlaceholder")}
							disabled={isSubmitting}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="args">{t("marketplace:customMcp.args")}</Label>
						<Input
							id="args"
							value={args}
							onChange={(e) => setArgs(e.target.value)}
							placeholder={t("marketplace:customMcp.argsPlaceholder")}
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">Separate multiple arguments with commas</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="env">{t("marketplace:customMcp.env")}</Label>
						<Textarea
							id="env"
							value={env}
							onChange={(e) => setEnv(e.target.value)}
							placeholder={t("marketplace:customMcp.envPlaceholder")}
							disabled={isSubmitting}
							rows={3}
						/>
						<p className="text-xs text-muted-foreground">Format: KEY=value, one per line</p>
					</div>

					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</div>

				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={onClose} disabled={isSubmitting}>
						{t("marketplace:customMcp.cancel")}
					</Button>
					<Button onClick={handleSubmit} disabled={isSubmitting}>
						{isSubmitting ? "Adding..." : t("marketplace:customMcp.add")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
