import React, { useState, useEffect } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { ServiceInfo } from "@roo-code/types"
import { vscode } from "../../utils/vscode"

interface BackgroundTasksBadgeProps {
	services: ServiceInfo[]
}

export const BackgroundTasksBadge: React.FC<BackgroundTasksBadgeProps> = ({ services }) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const [runningServices, setRunningServices] = useState<ServiceInfo[]>([])

	useEffect(() => {
		// Filter only running services (not stopped)
		const running = services.filter((s) => s.status !== "stopped")
		setRunningServices(running)
	}, [services])

	const handleStopService = (serviceId: string) => {
		vscode.postMessage({
			type: "stopService",
			serviceId,
		})
	}

	const handleOpenServiceUrl = (url: string) => {
		vscode.postMessage({
			type: "openExternal",
			url,
		})
	}

	if (runningServices.length === 0) {
		return null
	}

	return (
		<div className="background-tasks-badge">
			<button
				className="badge-toggle"
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded}
				aria-label={`${runningServices.length} background task${runningServices.length !== 1 ? "s" : ""} running`}>
				<span className="badge-icon">▶</span>
				<span className="badge-count">{runningServices.length}</span>
				<span className="badge-label">{runningServices.length === 1 ? "service" : "services"} running</span>
				<span className={`badge-chevron ${isExpanded ? "expanded" : ""}`}>{isExpanded ? "▼" : "▶"}</span>
			</button>

			{isExpanded && (
				<div className="services-dropdown">
					{runningServices.map((service) => (
						<div key={service.id} className="service-item">
							<div className="service-header">
								<span className="service-name">{service.name}</span>
								<span className={`service-status status-${service.status}`}>
									{service.status === "ready"
										? "Ready"
										: service.status === "starting"
											? "Starting..."
											: service.status === "stopping"
												? "Stopping..."
												: service.status}
								</span>
							</div>

							<div className="service-command">{service.command}</div>

							<div className="service-info">
								{service.url && (
									<div className="service-url">
										<span>URL: </span>
										<a
											href="#"
											onClick={(e) => {
												e.preventDefault()
												handleOpenServiceUrl(service.url!)
											}}
											title="Open in browser">
											{service.url}
										</a>
									</div>
								)}
								{service.port && <div className="service-port">Port: {service.port}</div>}
								<div className="service-duration">
									Running for {formatDuration(Date.now() - service.startedAt)}
								</div>
							</div>

							<div className="service-actions">
								<VSCodeButton
									appearance="secondary"
									onClick={() => handleStopService(service.id)}
									disabled={service.status === "stopping"}>
									{service.status === "stopping" ? "Stopping..." : "Stop"}
								</VSCodeButton>
							</div>
						</div>
					))}
				</div>
			)}

			<style>{`
				.background-tasks-badge {
					position: relative;
					margin-bottom: 8px;
				}

				.badge-toggle {
					display: flex;
					align-items: center;
					gap: 6px;
					background: var(--vscode-button-secondaryBackground);
					color: var(--vscode-button-secondaryForeground);
					border: 1px solid var(--vscode-contrastBorder, transparent);
					padding: 4px 8px;
					border-radius: 4px;
					cursor: pointer;
					font-size: 12px;
					transition: background-color 0.2s;
					width: 100%;
					text-align: left;
				}

				.badge-toggle:hover {
					background: var(--vscode-button-secondaryHoverBackground);
				}

				.badge-icon {
					color: var(--vscode-terminal-ansiGreen);
					animation: pulse 1.5s ease-in-out infinite;
				}

				@keyframes pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.5; }
				}

				.badge-count {
					background: var(--vscode-badge-background);
					color: var(--vscode-badge-foreground);
					padding: 0 4px;
					border-radius: 10px;
					min-width: 18px;
					text-align: center;
					font-weight: 600;
				}

				.badge-label {
					flex: 1;
					text-align: left;
				}

				.badge-chevron {
					transition: transform 0.2s;
					font-size: 10px;
				}

				.badge-chevron.expanded {
					transform: rotate(90deg);
				}

				.services-dropdown {
					position: absolute;
					top: 100%;
					left: 0;
					right: 0;
					background: var(--vscode-dropdown-background);
					border: 1px solid var(--vscode-dropdown-border);
					border-radius: 4px;
					margin-top: 4px;
					padding: 8px;
					z-index: 1000;
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
					max-height: 400px;
					overflow-y: auto;
				}

				.service-item {
					padding: 8px;
					border-bottom: 1px solid var(--vscode-panel-border);
					margin-bottom: 8px;
				}

				.service-item:last-child {
					border-bottom: none;
					margin-bottom: 0;
				}

				.service-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 4px;
				}

				.service-name {
					font-weight: 600;
					color: var(--vscode-foreground);
				}

				.service-status {
					font-size: 11px;
					padding: 2px 6px;
					border-radius: 3px;
					text-transform: uppercase;
				}

				.service-status.status-ready {
					background: var(--vscode-terminal-ansiGreen);
					color: var(--vscode-editor-background);
				}

				.service-status.status-starting {
					background: var(--vscode-terminal-ansiYellow);
					color: var(--vscode-editor-background);
				}

				.service-status.status-stopping {
					background: var(--vscode-terminal-ansiRed);
					color: var(--vscode-editor-background);
				}

				.service-command {
					font-family: var(--vscode-editor-font-family);
					font-size: 11px;
					color: var(--vscode-descriptionForeground);
					background: var(--vscode-textCodeBlock-background);
					padding: 2px 4px;
					border-radius: 2px;
					margin: 4px 0;
					word-break: break-all;
				}

				.service-info {
					font-size: 12px;
					color: var(--vscode-descriptionForeground);
					margin: 6px 0;
				}

				.service-info > div {
					margin: 2px 0;
				}

				.service-url a {
					color: var(--vscode-textLink-foreground);
					text-decoration: none;
				}

				.service-url a:hover {
					text-decoration: underline;
				}

				.service-actions {
					margin-top: 8px;
				}
			`}</style>
		</div>
	)
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)

	if (days > 0) {
		return `${days}d ${hours % 24}h`
	} else if (hours > 0) {
		return `${hours}h ${minutes % 60}m`
	} else if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`
	} else {
		return `${seconds}s`
	}
}
