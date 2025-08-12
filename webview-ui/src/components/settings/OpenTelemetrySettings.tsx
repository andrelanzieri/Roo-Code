import { HTMLAttributes, useState } from "react"
import { VSCodeCheckbox, VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { Activity, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

interface OtelEndpoint {
	url: string
	headers?: Record<string, string>
	enabled: boolean
}

type OpenTelemetrySettingsProps = HTMLAttributes<HTMLDivElement> & {
	otelEnabled?: boolean
	otelEndpoints?: OtelEndpoint[]
	setCachedStateField: SetCachedStateField<"otelEnabled" | "otelEndpoints">
}

export const OpenTelemetrySettings = ({
	otelEnabled,
	otelEndpoints = [],
	setCachedStateField,
	...props
}: OpenTelemetrySettingsProps) => {
	const [expandedEndpoints, setExpandedEndpoints] = useState<Set<number>>(new Set())

	const handleAddEndpoint = () => {
		const newEndpoint: OtelEndpoint = {
			url: "",
			headers: {},
			enabled: true,
		}
		setCachedStateField("otelEndpoints", [...otelEndpoints, newEndpoint])
		// Auto-expand the new endpoint
		setExpandedEndpoints(new Set(Array.from(expandedEndpoints).concat(otelEndpoints.length)))
	}

	const handleRemoveEndpoint = (index: number) => {
		const updated = otelEndpoints.filter((_, i) => i !== index)
		setCachedStateField("otelEndpoints", updated)
		// Remove from expanded set
		const newExpanded = new Set(expandedEndpoints)
		newExpanded.delete(index)
		setExpandedEndpoints(newExpanded)
	}

	const handleUpdateEndpoint = (index: number, field: keyof OtelEndpoint, value: any) => {
		const updated = [...otelEndpoints]
		updated[index] = { ...updated[index], [field]: value }
		setCachedStateField("otelEndpoints", updated)
	}

	const handleAddHeader = (endpointIndex: number, key: string, value: string) => {
		if (!key) return
		const updated = [...otelEndpoints]
		updated[endpointIndex] = {
			...updated[endpointIndex],
			headers: { ...updated[endpointIndex].headers, [key]: value },
		}
		setCachedStateField("otelEndpoints", updated)
	}

	const handleRemoveHeader = (endpointIndex: number, key: string) => {
		const updated = [...otelEndpoints]
		const headers = { ...updated[endpointIndex].headers }
		delete headers[key]
		updated[endpointIndex] = { ...updated[endpointIndex], headers }
		setCachedStateField("otelEndpoints", updated)
	}

	const toggleExpanded = (index: number) => {
		const newExpanded = new Set(expandedEndpoints)
		if (newExpanded.has(index)) {
			newExpanded.delete(index)
		} else {
			newExpanded.add(index)
		}
		setExpandedEndpoints(newExpanded)
	}

	return (
		<div {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Activity className="w-4" />
					<div>OpenTelemetry</div>
				</div>
			</SectionHeader>

			<Section>
				<div>
					<VSCodeCheckbox
						checked={otelEnabled}
						onChange={(e: any) => setCachedStateField("otelEnabled", e.target.checked)}
						data-testid="otel-enabled-checkbox">
						<span className="font-medium">Enable OpenTelemetry</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						Send telemetry traces to custom OpenTelemetry collector endpoints
					</div>
				</div>

				{otelEnabled && (
					<div className="flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background">
						<div className="flex justify-between items-center">
							<label className="font-medium">Collector Endpoints</label>
							<VSCodeButton
								appearance="secondary"
								onClick={handleAddEndpoint}
								data-testid="add-endpoint-button">
								<Plus className="w-4 h-4 mr-1" />
								Add Endpoint
							</VSCodeButton>
						</div>

						{otelEndpoints.length === 0 ? (
							<div className="text-vscode-descriptionForeground text-sm">
								No endpoints configured. Click &quot;Add Endpoint&quot; to add a custom OTEL collector.
							</div>
						) : (
							<div className="flex flex-col gap-3">
								{otelEndpoints.map((endpoint, index) => {
									const isExpanded = expandedEndpoints.has(index)
									return (
										<div key={index} className="border border-vscode-panel-border rounded p-3">
											<div className="flex items-start gap-2">
												<button
													onClick={() => toggleExpanded(index)}
													className="p-0 bg-transparent border-0 cursor-pointer text-vscode-foreground hover:text-vscode-focusBorder"
													aria-label={isExpanded ? "Collapse" : "Expand"}>
													{isExpanded ? (
														<ChevronDown className="w-4 h-4" />
													) : (
														<ChevronRight className="w-4 h-4" />
													)}
												</button>

												<div className="flex-1">
													<div className="flex items-center gap-2">
														<VSCodeCheckbox
															checked={endpoint.enabled}
															onChange={(e: any) =>
																handleUpdateEndpoint(index, "enabled", e.target.checked)
															}
															data-testid={`endpoint-${index}-enabled`}>
															<span className="font-medium">Endpoint {index + 1}</span>
														</VSCodeCheckbox>
														<button
															onClick={() => handleRemoveEndpoint(index)}
															className="ml-auto p-1 bg-transparent border-0 cursor-pointer text-vscode-errorForeground hover:text-vscode-errorForeground"
															aria-label="Remove endpoint"
															data-testid={`remove-endpoint-${index}`}>
															<Trash2 className="w-4 h-4" />
														</button>
													</div>

													{isExpanded && (
														<div className="mt-3 flex flex-col gap-3">
															<div>
																<label className="block text-sm font-medium mb-1">
																	URL
																</label>
																<VSCodeTextField
																	value={endpoint.url}
																	placeholder="https://otel-collector.example.com/v1/traces"
																	onInput={(e: any) =>
																		handleUpdateEndpoint(
																			index,
																			"url",
																			e.target.value,
																		)
																	}
																	className="w-full"
																	data-testid={`endpoint-${index}-url`}
																/>
															</div>

															<div>
																<label className="block text-sm font-medium mb-1">
																	Headers (Optional)
																</label>
																<div className="flex flex-col gap-2">
																	{Object.entries(endpoint.headers || {}).map(
																		([key, value]) => (
																			<div
																				key={key}
																				className="flex items-center gap-2">
																				<VSCodeTextField
																					value={key}
																					placeholder="Header name"
																					className="flex-1"
																					disabled
																				/>
																				<VSCodeTextField
																					value={value}
																					placeholder="Header value"
																					className="flex-1"
																					onInput={(e: any) => {
																						const newHeaders = {
																							...endpoint.headers,
																						}
																						delete newHeaders[key]
																						newHeaders[key] = e.target.value
																						handleUpdateEndpoint(
																							index,
																							"headers",
																							newHeaders,
																						)
																					}}
																				/>
																				<button
																					onClick={() =>
																						handleRemoveHeader(index, key)
																					}
																					className="p-1 bg-transparent border-0 cursor-pointer text-vscode-errorForeground hover:text-vscode-errorForeground"
																					aria-label="Remove header">
																					<Trash2 className="w-3 h-3" />
																				</button>
																			</div>
																		),
																	)}

																	<div className="flex items-center gap-2">
																		<VSCodeTextField
																			placeholder="Header name (e.g., Authorization)"
																			className="flex-1"
																			id={`new-header-key-${index}`}
																		/>
																		<VSCodeTextField
																			placeholder="Header value"
																			className="flex-1"
																			id={`new-header-value-${index}`}
																		/>
																		<VSCodeButton
																			appearance="secondary"
																			onClick={() => {
																				const keyInput =
																					document.getElementById(
																						`new-header-key-${index}`,
																					) as HTMLInputElement
																				const valueInput =
																					document.getElementById(
																						`new-header-value-${index}`,
																					) as HTMLInputElement
																				if (
																					keyInput &&
																					valueInput &&
																					keyInput.value
																				) {
																					handleAddHeader(
																						index,
																						keyInput.value,
																						valueInput.value,
																					)
																					keyInput.value = ""
																					valueInput.value = ""
																				}
																			}}>
																			Add
																		</VSCodeButton>
																	</div>
																</div>
															</div>
														</div>
													)}
												</div>
											</div>
										</div>
									)
								})}
							</div>
						)}

						<div className="text-vscode-descriptionForeground text-sm mt-2">
							<strong>Note:</strong> Changes to endpoints require restarting VS Code to take effect.
						</div>
					</div>
				)}
			</Section>
		</div>
	)
}
