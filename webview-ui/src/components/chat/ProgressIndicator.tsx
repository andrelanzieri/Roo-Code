import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { JumpingRoo } from "./JumpingRoo"

export const ProgressIndicator = () => {
	const { useJumpingRooAnimation } = useExtensionState()

	if (useJumpingRooAnimation) {
		return <JumpingRoo />
	}

	return (
		<div
			style={{
				width: "16px",
				height: "16px",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}>
			<div style={{ transform: "scale(0.55)", transformOrigin: "center" }}>
				<VSCodeProgressRing />
			</div>
		</div>
	)
}
