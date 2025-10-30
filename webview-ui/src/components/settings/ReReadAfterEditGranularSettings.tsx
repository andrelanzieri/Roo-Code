import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import type { ReReadAfterEditGranular } from "@roo-code/types"

interface ReReadAfterEditGranularSettingsProps {
	enabled: boolean
	granularSettings?: ReReadAfterEditGranular
	onChange: (enabled: boolean) => void
	onGranularChange: (settings: ReReadAfterEditGranular) => void
}

export const ReReadAfterEditGranularSettings = ({
	enabled,
	granularSettings,
	onChange,
	onGranularChange,
}: ReReadAfterEditGranularSettingsProps) => {
	const { t } = useAppTranslation()

	const editTypes = [
		{ key: "applyDiff", label: "Apply Diff" },
		{ key: "multiApplyDiff", label: "Multi-file Apply Diff" },
		{ key: "writeToFile", label: "Write to File" },
		{ key: "insertContent", label: "Insert Content" },
		{ key: "searchAndReplace", label: "Search and Replace" },
	] as const

	const handleGranularToggle = (editType: keyof ReReadAfterEditGranular, value: boolean) => {
		const newSettings: ReReadAfterEditGranular = {
			...granularSettings,
			[editType]: value,
		}
		onGranularChange(newSettings)
	}

	const allChecked = editTypes.every((type) => granularSettings?.[type.key] === true)
	const someChecked = editTypes.some((type) => granularSettings?.[type.key] === true)
	const isIndeterminate = someChecked && !allChecked

	const handleMasterToggle = (checked: boolean) => {
		const newSettings: ReReadAfterEditGranular = {}
		editTypes.forEach((type) => {
			newSettings[type.key] = checked
		})
		onGranularChange(newSettings)
		onChange(checked)
	}

	return (
		<div className="space-y-3">
			<div>
				<div className="flex items-center gap-2">
					<VSCodeCheckbox
						checked={enabled || allChecked}
						indeterminate={isIndeterminate}
						onChange={(e: any) => handleMasterToggle(e.target.checked)}>
						<span className="font-medium">
							{t("settings:experimental.RE_READ_AFTER_EDIT_GRANULAR.name")}
						</span>
					</VSCodeCheckbox>
				</div>
				<p className="text-vscode-descriptionForeground text-sm mt-0">
					{t("settings:experimental.RE_READ_AFTER_EDIT_GRANULAR.description")}
				</p>
			</div>

			{/* Show granular options when enabled */}
			{(enabled || someChecked) && (
				<div className="ml-6 space-y-2 border-l-2 border-vscode-panel-border pl-4">
					<p className="text-vscode-descriptionForeground text-xs mb-2">
						{t("settings:experimental.RE_READ_AFTER_EDIT_GRANULAR.selectEditTypes")}
					</p>
					{editTypes.map((editType) => (
						<div key={editType.key} className="flex items-center gap-2">
							<VSCodeCheckbox
								checked={granularSettings?.[editType.key] === true}
								onChange={(e: any) => handleGranularToggle(editType.key, e.target.checked)}>
								<span className="text-sm">
									{t(`settings:experimental.RE_READ_AFTER_EDIT_GRANULAR.${editType.key}`)}
								</span>
							</VSCodeCheckbox>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
