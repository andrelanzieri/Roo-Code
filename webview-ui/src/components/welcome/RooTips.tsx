import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"

import { buildDocLink } from "@src/utils/docLinks"
import { Keyboard, ReplaceAll, LucideIcon, CheckCheck, Users2 } from "lucide-react"
import { Button } from "../ui"

interface TipItem {
	icon: LucideIcon
	title: string
	description: string
}

const tipItems: TipItem[] = [
	{
		icon: Users2,
		title: "Powerful role-specific modes",
		description:
			"Personas like Architect, Code and Ask which stay on task and deliver results. Create your own or get more in the marketplace.",
	},
	{
		icon: CheckCheck,
		title: "Granular auto-approval",
		description: "Make Roo as autonomous as you want as you build confidence. Or go YOLO.",
	},
	{
		icon: Keyboard,
		title: "Highly customizable",
		description:
			"Fine-tune settings for Roo to work for you, like inference context, model properties, slash commands and more.",
	},
	{
		icon: ReplaceAll,
		title: "Model-agnostic",
		description: "Bring your own key, no markup or lock-in.",
	},
]

const RooTips = () => {
	return (
		<div className="text-left text-base font-light pl-7 pr-2">
			<h1 className="text-vscode-editor-foreground text-xl">Welcome to Roo Code!</h1>

			<p className="font-bold">Get a whole dev team in your editor:</p>
			<ul className="space-y-3 -ml-7">
				{tipItems.map((item, index) => {
					const Icon = item.icon
					return (
						<li key={index} className="flex items-start gap-3">
							<Icon className="size-3.5 mt-0.75 shrink-0" />
							<div>
								<strong className="block font-semibold mr-1">{item.title}</strong>
								<span className="text-vscode-descriptionForeground">{item.description}</span>
							</div>
						</li>
					)
				})}
			</ul>
			<p className="text-vscode-descriptionForeground">
				Learn more in the <VSCodeLink href={buildDocLink("", "onboarding-home")}>docs</VSCodeLink>
			</p>

			<div className="mt-12 border-t border-vscode-panel-border">
				<p>To get started:</p>
				<Button>Configure API Provider</Button>
			</div>
		</div>
	)
}

export default RooTips
