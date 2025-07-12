import React, { useState, useCallback } from "react"
import { Trash2, Plus, FileText } from "lucide-react"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import {
	Button,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	StandardTooltip,
} from "@src/components/ui"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SetCachedStateField } from "./types"

interface FileEncodingSettingsProps {
	fileEncodingMap: Record<string, string> | undefined
	setCachedStateField: SetCachedStateField<"fileEncodingMap">
}

const supportedEncodings = [
	"utf8",
	"utf16le",
	"utf16be",
	"ascii",
	"latin1",
	"win1252",
	"windows-1251",
	"iso-8859-1",
	"iso-8859-2",
	"iso-8859-3",
	"iso-8859-4",
	"iso-8859-5",
	"iso-8859-6",
	"iso-8859-7",
	"iso-8859-8",
	"iso-8859-9",
	"iso-8859-10",
	"iso-8859-11",
	"iso-8859-13",
	"iso-8859-14",
	"iso-8859-15",
	"iso-8859-16",
]

export const FileEncodingSettings: React.FC<FileEncodingSettingsProps> = ({
	fileEncodingMap = {},
	setCachedStateField,
}) => {
	const { t } = useAppTranslation()
	const [newExtension, setNewExtension] = useState("")
	const [newEncoding, setNewEncoding] = useState("utf8")

	const handleAddMapping = useCallback(() => {
		if (!newExtension.trim()) return

		// Normalize extension (ensure it starts with a dot and is lowercase)
		const normalizedExt = newExtension.startsWith(".")
			? newExtension.toLowerCase()
			: `.${newExtension.toLowerCase()}`

		const updatedMap = {
			...fileEncodingMap,
			[normalizedExt]: newEncoding,
		}

		setCachedStateField("fileEncodingMap", updatedMap)
		setNewExtension("")
		setNewEncoding("utf8")
	}, [newExtension, newEncoding, fileEncodingMap, setCachedStateField])

	const handleRemoveMapping = useCallback(
		(extension: string) => {
			const updatedMap = { ...fileEncodingMap }
			delete updatedMap[extension]
			setCachedStateField("fileEncodingMap", updatedMap)
		},
		[fileEncodingMap, setCachedStateField],
	)

	const handleUpdateMapping = useCallback(
		(extension: string, encoding: string) => {
			const updatedMap = {
				...fileEncodingMap,
				[extension]: encoding,
			}
			setCachedStateField("fileEncodingMap", updatedMap)
		},
		[fileEncodingMap, setCachedStateField],
	)

	// Quick setup presets
	const quickSetupPresets = [
		{
			name: "Arquivos AdvPL/TOTVS",
			description: "Configurar .prw, .ch, .tlpp para Windows-1252",
			extensions: [".prw", ".ch", ".tlpp"],
			encoding: "win1252",
		},
		{
			name: "Arquivos de Texto Legados",
			description: "Configurar .txt, .dat, .log para Windows-1252",
			extensions: [".txt", ".dat", ".log"],
			encoding: "win1252",
		},
		{
			name: "Arquivos SQL/Database",
			description: "Configurar .sql, .ddl para Windows-1252",
			extensions: [".sql", ".ddl"],
			encoding: "win1252",
		},
		{
			name: "Arquivos Pascal/Delphi",
			description: "Configurar .pas, .dpr, .dpk para Windows-1252",
			extensions: [".pas", ".dpr", ".dpk"],
			encoding: "win1252",
		},
	]

	const handleQuickSetup = useCallback(
		(preset: (typeof quickSetupPresets)[0]) => {
			const updatedMap = { ...fileEncodingMap }

			preset.extensions.forEach((ext) => {
				updatedMap[ext] = preset.encoding
			})

			setCachedStateField("fileEncodingMap", updatedMap)
		},
		[fileEncodingMap, setCachedStateField],
	)

	return (
		<div>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<FileText className="w-4" />
					<div>{t("settings:sections.fileEncoding")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div className="space-y-4">
					<div>
						<p className="text-sm text-vscode-descriptionForeground mb-4">
							{t("settings:fileEncoding.description")}
						</p>
					</div>

					{/* Quick Setup Section */}
					<div>
						<label className="text-sm font-medium mb-3 block">⚡ Configuração Rápida</label>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
							{quickSetupPresets.map((preset, index) => (
								<div
									key={index}
									className="p-3 border border-vscode-widget-border rounded bg-vscode-editor-background">
									<div className="flex items-start justify-between gap-2">
										<div className="flex-1">
											<div className="text-sm font-medium mb-1">{preset.name}</div>
											<div className="text-xs text-vscode-descriptionForeground mb-2">
												{preset.description}
											</div>
											<div className="text-xs font-mono text-vscode-charts-blue">
												{preset.extensions.join(", ")} → {preset.encoding}
											</div>
										</div>
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleQuickSetup(preset)}
											className="shrink-0">
											Aplicar
										</Button>
									</div>
								</div>
							))}
						</div>
						<div className="mt-2 p-2 bg-vscode-textBlockQuote-background border-l-4 border-vscode-charts-yellow rounded-r">
							<p className="text-xs text-vscode-descriptionForeground">
								💡 <strong>Dica:</strong> Se você está vendo caracteres estranhos (ç, ã, õ) em arquivos
								antigos, provavelmente precisam de encoding Windows-1252. Use os botões acima para
								configuração rápida.
							</p>
						</div>
					</div>

					{/* Current mappings */}
					<div>
						<label className="text-sm font-medium mb-2 block">
							{t("settings:fileEncoding.currentMappings")}
						</label>

						{Object.keys(fileEncodingMap).length === 0 ? (
							<p className="text-sm text-vscode-descriptionForeground italic">
								{t("settings:fileEncoding.noMappings")}
							</p>
						) : (
							<div className="space-y-2">
								{Object.entries(fileEncodingMap).map(([extension, encoding]) => (
									<div
										key={extension}
										className="flex items-center gap-2 p-2 border border-vscode-widget-border rounded">
										<div className="flex-1 text-sm">
											<span className="font-mono">{extension}</span>
											<span className="text-vscode-descriptionForeground mx-2">→</span>
											<span>{encoding}</span>
										</div>
										<Select
											value={encoding}
											onValueChange={(value) => handleUpdateMapping(extension, value)}>
											<SelectTrigger className="w-32">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{supportedEncodings.map((enc) => (
													<SelectItem key={enc} value={enc}>
														{enc}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<StandardTooltip content={t("settings:fileEncoding.removeMapping")}>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleRemoveMapping(extension)}
												className="text-vscode-errorForeground hover:text-vscode-errorForeground hover:bg-vscode-errorBackground/20">
												<Trash2 className="w-4 h-4" />
											</Button>
										</StandardTooltip>
									</div>
								))}
							</div>
						)}
					</div>

					{/* Add new mapping */}
					<div>
						<label className="text-sm font-medium mb-2 block">
							{t("settings:fileEncoding.addMapping")}
						</label>
						<div className="flex items-center gap-2">
							<div className="flex-1">
								<Input
									type="text"
									placeholder={t("settings:fileEncoding.extensionPlaceholder")}
									value={newExtension}
									onChange={(e) => setNewExtension(e.target.value)}
									className="font-mono"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleAddMapping()
										}
									}}
								/>
							</div>
							<Select value={newEncoding} onValueChange={setNewEncoding}>
								<SelectTrigger className="w-40">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{supportedEncodings.map((encoding) => (
										<SelectItem key={encoding} value={encoding}>
											{encoding}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<StandardTooltip content={t("settings:fileEncoding.addMappingTooltip")}>
								<Button onClick={handleAddMapping} disabled={!newExtension.trim()} size="sm">
									<Plus className="w-4 h-4" />
								</Button>
							</StandardTooltip>
						</div>
						<p className="text-xs text-vscode-descriptionForeground mt-1">
							{t("settings:fileEncoding.extensionHelp")}
						</p>
					</div>

					{/* Default examples */}
					<div>
						<label className="text-sm font-medium mb-2 block">{t("settings:fileEncoding.examples")}</label>
						<div className="space-y-1">
							<div className="text-xs text-vscode-descriptionForeground">
								<span className="font-mono">.prw</span> → <span>win1252</span> (
								{t("settings:fileEncoding.exampleAdvpl")})
							</div>
							<div className="text-xs text-vscode-descriptionForeground">
								<span className="font-mono">.tlpp</span> → <span>win1252</span> (
								{t("settings:fileEncoding.exampleTlpp")})
							</div>
							<div className="text-xs text-vscode-descriptionForeground">
								<span className="font-mono">.txt</span> → <span>iso-8859-1</span> (
								{t("settings:fileEncoding.exampleLatin1")})
							</div>
						</div>
					</div>
				</div>
			</Section>
		</div>
	)
}
