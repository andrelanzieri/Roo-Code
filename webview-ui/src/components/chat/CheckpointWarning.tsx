import { Trans } from "react-i18next"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"

interface CheckpointWarningProps {
	text?: string
}

export const CheckpointWarning = ({ text }: CheckpointWarningProps) => {
	const settingsLink = (
		<VSCodeLink
			href="#"
			onClick={(e) => {
				e.preventDefault()
				window.postMessage(
					{
						type: "action",
						action: "settingsButtonClicked",
						values: { section: "checkpoints" },
					},
					"*",
				)
			}}
			className="inline px-0.5"
		/>
	)

	return (
		<div className="flex items-center p-3 my-3 bg-vscode-inputValidation-warningBackground border border-vscode-inputValidation-warningBorder rounded">
			<span className="codicon codicon-loading codicon-modifier-spin mr-2" />
			<span className="text-vscode-foreground">
				{text ? (
					<Trans
						components={{
							settingsLink,
						}}>
						{text}
					</Trans>
				) : (
					<Trans
						i18nKey="chat:checkpoint.initializingWarning"
						components={{
							settingsLink,
						}}
					/>
				)}
			</span>
		</div>
	)
}
