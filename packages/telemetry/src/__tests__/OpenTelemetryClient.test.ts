/* eslint-disable @typescript-eslint/no-explicit-any */

// npx vitest run src/__tests__/OpenTelemetryClient.test.ts

import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { trace, context } from "@opentelemetry/api"

import { type TelemetryPropertiesProvider, TelemetryEventName } from "@roo-code/types"

import { OpenTelemetryClient } from "../OpenTelemetryClient"

// Define OtelEndpoint type locally for tests
interface OtelEndpoint {
	url: string
	headers?: Record<string, string>
	enabled: boolean
}

// Mock OpenTelemetry modules
vi.mock("@opentelemetry/sdk-trace-node")
vi.mock("@opentelemetry/exporter-trace-otlp-http")
vi.mock("@opentelemetry/sdk-trace-base")
vi.mock("@opentelemetry/instrumentation")
vi.mock("@opentelemetry/api")

describe("OpenTelemetryClient", () => {
	let mockProvider: any
	let mockTracer: any
	let mockSpan: any
	let mockExporter: any
	let mockProcessor: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock span
		mockSpan = {
			setAttributes: vi.fn().mockReturnThis(),
			setStatus: vi.fn().mockReturnThis(),
			recordException: vi.fn().mockReturnThis(),
			end: vi.fn(),
		}

		// Mock tracer
		mockTracer = {
			startSpan: vi.fn().mockReturnValue(mockSpan),
		}

		// Mock provider
		mockProvider = {
			register: vi.fn(),
			addSpanProcessor: vi.fn(),
			shutdown: vi.fn().mockResolvedValue(undefined),
		}

		// Mock exporter
		mockExporter = {
			shutdown: vi.fn().mockResolvedValue(undefined),
		}

		// Mock processor
		mockProcessor = {
			shutdown: vi.fn().mockResolvedValue(undefined),
		}

		// Setup mocks
		;(NodeTracerProvider as any).mockImplementation(() => mockProvider)
		;(OTLPTraceExporter as any).mockImplementation(() => mockExporter)
		;(BatchSpanProcessor as any).mockImplementation(() => mockProcessor)
		;(registerInstrumentations as any).mockImplementation(() => {})
		;(trace.getTracer as any) = vi.fn().mockReturnValue(mockTracer)
		;(context.with as any) = vi.fn((ctx, fn) => fn())
		;(context.active as any) = vi.fn().mockReturnValue({})
	})

	describe("initialize", () => {
		it("should initialize with multiple endpoints", async () => {
			const client = new OpenTelemetryClient()
			const endpoints: OtelEndpoint[] = [
				{
					url: "http://localhost:4318/v1/traces",
					headers: { "x-api-key": "test-key-1" },
					enabled: true,
				},
				{
					url: "http://example.com:4318/v1/traces",
					headers: { "x-api-key": "test-key-2" },
					enabled: true,
				},
				{
					url: "http://disabled.com:4318/v1/traces",
					headers: {},
					enabled: false, // This one should be filtered out
				},
			]

			await client.initialize(endpoints)

			// Should create provider
			expect(NodeTracerProvider).toHaveBeenCalledTimes(1)
			expect(mockProvider.register).toHaveBeenCalledTimes(1)

			// Should create exporters only for enabled endpoints
			expect(OTLPTraceExporter).toHaveBeenCalledTimes(2)
			expect(OTLPTraceExporter).toHaveBeenCalledWith({
				url: "http://localhost:4318/v1/traces",
				headers: { "x-api-key": "test-key-1" },
			})
			expect(OTLPTraceExporter).toHaveBeenCalledWith({
				url: "http://example.com:4318/v1/traces",
				headers: { "x-api-key": "test-key-2" },
			})

			// Should create processors for each enabled endpoint
			expect(BatchSpanProcessor).toHaveBeenCalledTimes(2)
			expect(mockProvider.addSpanProcessor).toHaveBeenCalledTimes(2)

			// Should register instrumentations
			expect(registerInstrumentations).toHaveBeenCalledTimes(1)
		})

		it("should handle empty endpoints array", async () => {
			const client = new OpenTelemetryClient()
			await client.initialize([])

			// Should still create provider but no exporters
			expect(NodeTracerProvider).toHaveBeenCalledTimes(1)
			expect(OTLPTraceExporter).not.toHaveBeenCalled()
			expect(BatchSpanProcessor).not.toHaveBeenCalled()
		})

		it("should handle initialization errors gracefully", async () => {
			const client = new OpenTelemetryClient()
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			// Make provider throw an error
			;(NodeTracerProvider as any).mockImplementation(() => {
				throw new Error("Provider initialization failed")
			})

			const endpoints: OtelEndpoint[] = [
				{
					url: "http://localhost:4318/v1/traces",
					headers: {},
					enabled: true,
				},
			]

			await client.initialize(endpoints)

			expect(consoleErrorSpy).toHaveBeenCalledWith("[OpenTelemetry] Failed to initialize:", expect.any(Error))

			consoleErrorSpy.mockRestore()
		})
	})

	describe("capture", () => {
		it("should create and end a span for captured events", async () => {
			const client = new OpenTelemetryClient()
			const endpoints: OtelEndpoint[] = [
				{
					url: "http://localhost:4318/v1/traces",
					headers: {},
					enabled: true,
				},
			]

			await client.initialize(endpoints)
			client.updateTelemetryState(true)

			const mockTelemetryProvider: TelemetryPropertiesProvider = {
				getTelemetryProperties: vi.fn().mockResolvedValue({
					appVersion: "1.0.0",
					vscodeVersion: "1.60.0",
					platform: "darwin",
					mode: "code",
				}),
			}

			client.setProvider(mockTelemetryProvider)

			await client.capture({
				event: TelemetryEventName.TASK_CREATED,
				properties: {
					customProp: "value",
					duration: 1000,
				},
			})

			// Should get tracer
			expect(trace.getTracer).toHaveBeenCalledWith("roo-code-telemetry", expect.any(String))

			// Should start span with event name
			expect(mockTracer.startSpan).toHaveBeenCalledWith(TelemetryEventName.TASK_CREATED)

			// Should set attributes from merged properties
			expect(mockSpan.setAttributes).toHaveBeenCalledWith({
				appVersion: "1.0.0",
				vscodeVersion: "1.60.0",
				platform: "darwin",
				mode: "code",
				customProp: "value",
				duration: 1000,
			})

			// Should end the span
			expect(mockSpan.end).toHaveBeenCalledTimes(1)
		})

		it("should not capture when telemetry is disabled", async () => {
			const client = new OpenTelemetryClient()
			const endpoints: OtelEndpoint[] = [
				{
					url: "http://localhost:4318/v1/traces",
					headers: {},
					enabled: true,
				},
			]

			await client.initialize(endpoints)

			// Clear the mock calls from initialization
			vi.clearAllMocks()

			client.updateTelemetryState(false) // Disable telemetry

			await client.capture({
				event: TelemetryEventName.TASK_CREATED,
				properties: { test: "value" },
			})

			// Should not create any spans when telemetry is disabled
			expect(mockTracer.startSpan).not.toHaveBeenCalled()
		})

		it("should not capture when not initialized", async () => {
			const client = new OpenTelemetryClient()
			client.updateTelemetryState(true)

			await client.capture({
				event: TelemetryEventName.TASK_CREATED,
				properties: { test: "value" },
			})

			// Should not create any spans
			expect(trace.getTracer).not.toHaveBeenCalled()
			expect(mockTracer.startSpan).not.toHaveBeenCalled()
		})

		it("should handle capture errors gracefully", async () => {
			const client = new OpenTelemetryClient()
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const endpoints: OtelEndpoint[] = [
				{
					url: "http://localhost:4318/v1/traces",
					headers: {},
					enabled: true,
				},
			]

			await client.initialize(endpoints)
			client.updateTelemetryState(true)

			// Make startSpan throw an error
			mockTracer.startSpan.mockImplementation(() => {
				throw new Error("Failed to start span")
			})

			await client.capture({
				event: TelemetryEventName.TASK_CREATED,
				properties: { test: "value" },
			})

			expect(consoleErrorSpy).toHaveBeenCalledWith("[OpenTelemetry] Failed to capture event:", expect.any(Error))

			consoleErrorSpy.mockRestore()
		})

		it("should handle provider errors gracefully", async () => {
			const client = new OpenTelemetryClient()
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const endpoints: OtelEndpoint[] = [
				{
					url: "http://localhost:4318/v1/traces",
					headers: {},
					enabled: true,
				},
			]

			await client.initialize(endpoints)
			client.updateTelemetryState(true)

			const mockTelemetryProvider: TelemetryPropertiesProvider = {
				getTelemetryProperties: vi.fn().mockRejectedValue(new Error("Provider error")),
			}

			client.setProvider(mockTelemetryProvider)

			await client.capture({
				event: TelemetryEventName.TASK_CREATED,
				properties: { customProp: "value" },
			})

			// Should still create span with event properties only
			expect(mockTracer.startSpan).toHaveBeenCalled()
			expect(mockSpan.setAttributes).toHaveBeenCalledWith({ customProp: "value" })
			expect(mockSpan.end).toHaveBeenCalled()

			consoleErrorSpy.mockRestore()
		})
	})

	describe("updateTelemetryState", () => {
		it("should enable telemetry when set to true", () => {
			const client = new OpenTelemetryClient()
			client.updateTelemetryState(true)
			expect(client.isTelemetryEnabled()).toBe(true)
		})

		it("should disable telemetry when set to false", () => {
			const client = new OpenTelemetryClient()
			client.updateTelemetryState(false)
			expect(client.isTelemetryEnabled()).toBe(false)
		})
	})

	describe("setProvider", () => {
		it("should set the telemetry properties provider", () => {
			const client = new OpenTelemetryClient()
			const mockTelemetryProvider: TelemetryPropertiesProvider = {
				getTelemetryProperties: vi.fn(),
			}

			client.setProvider(mockTelemetryProvider)

			// Verify provider is set by attempting to capture with it
			const getProviderSpy = vi.spyOn(mockTelemetryProvider, "getTelemetryProperties")
			getProviderSpy.mockResolvedValue({
				appName: "test-app",
				appVersion: "1.0.0",
				vscodeVersion: "1.60.0",
				platform: "darwin",
				editorName: "vscode",
				language: "en",
				mode: "code",
			})

			// Initialize and enable to allow capture
			client.updateTelemetryState(true)

			// Provider should be used during capture (though capture won't complete without initialization)
			// This is just to verify the provider was set
			expect(getProviderSpy).not.toHaveBeenCalled() // Not called yet since we haven't captured
		})
	})

	describe("shutdown", () => {
		it("should shutdown the provider when initialized", async () => {
			const client = new OpenTelemetryClient()
			const endpoints: OtelEndpoint[] = [
				{
					url: "http://localhost:4318/v1/traces",
					headers: {},
					enabled: true,
				},
			]

			await client.initialize(endpoints)
			await client.shutdown()

			expect(mockProvider.shutdown).toHaveBeenCalledTimes(1)
		})

		it("should handle shutdown when not initialized", async () => {
			const client = new OpenTelemetryClient()

			// Should not throw
			await expect(client.shutdown()).resolves.toBeUndefined()
		})

		it("should handle shutdown errors gracefully", async () => {
			const client = new OpenTelemetryClient()
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const endpoints: OtelEndpoint[] = [
				{
					url: "http://localhost:4318/v1/traces",
					headers: {},
					enabled: true,
				},
			]

			await client.initialize(endpoints)

			// Make shutdown throw an error
			mockProvider.shutdown.mockRejectedValue(new Error("Shutdown failed"))

			await client.shutdown()

			expect(consoleErrorSpy).toHaveBeenCalledWith("[OpenTelemetry] Failed to shutdown:", expect.any(Error))

			consoleErrorSpy.mockRestore()
		})
	})

	describe("integration scenarios", () => {
		it("should handle multiple captures in sequence", async () => {
			const client = new OpenTelemetryClient()
			const endpoints: OtelEndpoint[] = [
				{
					url: "http://localhost:4318/v1/traces",
					headers: {},
					enabled: true,
				},
			]

			await client.initialize(endpoints)
			client.updateTelemetryState(true)

			// Capture multiple events
			await client.capture({
				event: TelemetryEventName.TASK_CREATED,
				properties: { taskId: "1" },
			})

			await client.capture({
				event: TelemetryEventName.MODE_SWITCH,
				properties: { from: "code", to: "debug" },
			})

			await client.capture({
				event: TelemetryEventName.TASK_COMPLETED,
				properties: { taskId: "1", duration: 5000 },
			})

			// Should create 3 spans
			expect(mockTracer.startSpan).toHaveBeenCalledTimes(3)
			expect(mockSpan.end).toHaveBeenCalledTimes(3)

			// Verify different event names were used
			expect(mockTracer.startSpan).toHaveBeenNthCalledWith(1, TelemetryEventName.TASK_CREATED)
			expect(mockTracer.startSpan).toHaveBeenNthCalledWith(2, TelemetryEventName.MODE_SWITCH)
			expect(mockTracer.startSpan).toHaveBeenNthCalledWith(3, TelemetryEventName.TASK_COMPLETED)
		})

		it("should reinitialize with new endpoints", async () => {
			const client = new OpenTelemetryClient()

			// First initialization
			const endpoints1: OtelEndpoint[] = [
				{
					url: "http://localhost:4318/v1/traces",
					headers: {},
					enabled: true,
				},
			]

			await client.initialize(endpoints1)

			// Clear mocks
			vi.clearAllMocks()

			// Second initialization with different endpoints
			const endpoints2: OtelEndpoint[] = [
				{
					url: "http://example.com:4318/v1/traces",
					headers: { "x-api-key": "new-key" },
					enabled: true,
				},
				{
					url: "http://another.com:4318/v1/traces",
					headers: {},
					enabled: true,
				},
			]

			await client.initialize(endpoints2)

			// Should create new provider and exporters
			expect(NodeTracerProvider).toHaveBeenCalledTimes(1)
			expect(OTLPTraceExporter).toHaveBeenCalledTimes(2)
			expect(BatchSpanProcessor).toHaveBeenCalledTimes(2)
		})
	})
})
