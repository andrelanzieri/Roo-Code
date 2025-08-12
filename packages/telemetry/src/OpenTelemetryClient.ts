import { trace, SpanStatusCode, Tracer } from "@opentelemetry/api"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { Resource } from "@opentelemetry/resources"
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { BatchSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base"
import { registerInstrumentations } from "@opentelemetry/instrumentation"

import { type TelemetryEvent } from "@roo-code/types"

import { BaseTelemetryClient } from "./BaseTelemetryClient"

// Conditionally import vscode only when not in test environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let vscode: any
try {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	vscode = require("vscode")
} catch {
	// In test environment, vscode is not available
	vscode = {
		extensions: {
			getExtension: () => ({ packageJSON: { version: "test-version" } }),
		},
		workspace: {
			getConfiguration: () => ({
				get: () => "all",
			}),
		},
	}
}

export interface OtelEndpoint {
	url: string
	headers?: Record<string, string>
	enabled: boolean
}

/**
 * OpenTelemetryClient handles telemetry event tracking using OpenTelemetry.
 * Supports sending traces to multiple custom endpoints in addition to internal endpoints.
 * Respects user privacy settings and VSCode's global telemetry configuration.
 */
export class OpenTelemetryClient extends BaseTelemetryClient {
	private tracer: Tracer | null = null
	private provider: NodeTracerProvider | null = null
	private endpoints: OtelEndpoint[] = []
	private isInitialized = false

	constructor(debug = false) {
		super(undefined, debug)
	}

	/**
	 * Initialize or reinitialize the OpenTelemetry provider with the given endpoints
	 * @param endpoints Array of OTEL collector endpoints to send traces to
	 */
	public async initialize(endpoints: OtelEndpoint[]): Promise<void> {
		try {
			// Shutdown existing provider if any
			if (this.provider) {
				await this.shutdown()
			}

			this.endpoints = endpoints.filter((ep) => ep.enabled)

			// Create resource with service information
			const version =
				vscode?.extensions?.getExtension?.("rooveterinaryinc.roo-cline")?.packageJSON?.version || "unknown"
			const resource = new Resource({
				[ATTR_SERVICE_NAME]: "roo-code",
				[ATTR_SERVICE_VERSION]: version,
			})

			// Create provider
			this.provider = new NodeTracerProvider({
				resource,
			})

			// Add exporters for each endpoint
			for (const endpoint of this.endpoints) {
				const exporter = new OTLPTraceExporter({
					url: endpoint.url,
					headers: endpoint.headers || {},
				})

				// Use BatchSpanProcessor for better performance
				this.provider.addSpanProcessor(new BatchSpanProcessor(exporter))
			}

			// Add console exporter in debug mode
			if (this.debug) {
				this.provider.addSpanProcessor(new BatchSpanProcessor(new ConsoleSpanExporter()))
			}

			// Register the provider
			this.provider.register()

			// Register instrumentations
			registerInstrumentations({
				instrumentations: [],
			})

			// Only get tracer if we have endpoints
			if (this.endpoints.length > 0) {
				// Get tracer with version
				this.tracer = trace.getTracer("roo-code-telemetry", version)
				this.isInitialized = true
			}

			if (this.debug) {
				console.info(`[OpenTelemetryClient#initialize] Initialized with ${this.endpoints.length} endpoints`)
			}
		} catch (error) {
			console.error("[OpenTelemetry] Failed to initialize:", error)
			// Don't throw - just log the error
		}
	}

	/**
	 * Update endpoints configuration
	 * This will reinitialize the provider with the new endpoints
	 * @param endpoints New array of OTEL collector endpoints
	 */
	public async updateEndpoints(endpoints: OtelEndpoint[]): Promise<void> {
		await this.initialize(endpoints)
	}

	public override async capture(event: TelemetryEvent): Promise<void> {
		if (!this.isTelemetryEnabled() || !this.isInitialized || !this.tracer) {
			if (this.debug) {
				console.info(
					`[OpenTelemetryClient#capture] Skipping event: ${event.event} (enabled: ${this.isTelemetryEnabled()}, initialized: ${this.isInitialized})`,
				)
			}
			return
		}

		try {
			if (this.debug) {
				console.info(`[OpenTelemetryClient#capture] ${event.event}`)
			}

			// Get event properties
			const properties = await this.getEventProperties(event)

			// Create a span for the event
			const span = this.tracer.startSpan(event.event)

			// Set attributes after creating the span
			if (properties && Object.keys(properties).length > 0) {
				span.setAttributes(properties)
			}

			// Set span status to OK and end it immediately since these are point-in-time events
			span.setStatus({ code: SpanStatusCode.OK })
			span.end()
		} catch (error) {
			console.error("[OpenTelemetry] Failed to capture event:", error)
			// Don't throw - just log the error
		}
	}

	/**
	 * Updates the telemetry state based on user preferences and VSCode settings.
	 * Only enables telemetry if both VSCode global telemetry is enabled and
	 * user has opted in.
	 * @param didUserOptIn Whether the user has explicitly opted into telemetry
	 */
	public override updateTelemetryState(didUserOptIn: boolean): void {
		this.telemetryEnabled = false

		// First check global telemetry level - telemetry should only be enabled when level is "all".
		const telemetryLevel =
			vscode?.workspace?.getConfiguration?.("telemetry")?.get?.("telemetryLevel", "all") || "all"
		const globalTelemetryEnabled = telemetryLevel === "all"

		// We only enable telemetry if global vscode telemetry is enabled.
		if (globalTelemetryEnabled) {
			this.telemetryEnabled = didUserOptIn
		}

		if (this.debug) {
			console.info(`[OpenTelemetryClient#updateTelemetryState] Telemetry enabled: ${this.telemetryEnabled}`)
		}
	}

	public override async shutdown(): Promise<void> {
		if (this.provider) {
			try {
				await this.provider.shutdown()
			} catch (error) {
				console.error("[OpenTelemetry] Failed to shutdown:", error)
				// Don't throw - just log the error
			}
			this.provider = null
			this.tracer = null
			this.isInitialized = false
		}
	}

	/**
	 * Get the currently configured endpoints
	 * @returns Array of configured OTEL endpoints
	 */
	public getEndpoints(): OtelEndpoint[] {
		return [...this.endpoints]
	}
}
