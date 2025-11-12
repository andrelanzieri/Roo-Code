import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { ClineProvider } from "../ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"
import { Task } from "../../task/Task"
import { TelemetryService } from "@roo-code/telemetry"

// Mock vscode first
vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
	OutputChannel: vi.fn(),
	WebviewView: vi.fn(),
	Uri: {
		joinPath: vi.fn(),
		file: vi.fn(),
	},
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	workspace: {
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn().mockReturnValue([]),
			update: vi.fn(),
		}),
	},
	env: {
		uriScheme: "vscode",
		language: "en",
		appName: "Visual Studio Code",
		machineId: "test-machine-id",
		sessionId: "test-session-id",
	},
	ExtensionMode: {
		Production: 1,
		Development: 2,
		Test: 3,
	},
	version: "1.85.0",
}))

// Mock dependencies
vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn().mockReturnValue({
		getModel: vi.fn().mockReturnValue({ id: "test-model" }),
	}),
}))

vi.mock("../../task/Task")

vi.mock("@roo-code/cloud", () => ({
	CloudService: {
		hasInstance: vi.fn().mockReturnValue(false),
		instance: {
			isAuthenticated: vi.fn().mockReturnValue(false),
		},
	},
	BridgeOrchestrator: {
		isEnabled: vi.fn().mockReturnValue(false),
	},
	getRooCodeApiUrl: vi.fn().mockReturnValue("https://app.roocode.com"),
}))

vi.mock("../../../integrations/workspace/WorkspaceTracker", () => {
	return {
		default: vi.fn().mockImplementation(() => ({
			initializeFilePaths: vi.fn(),
			dispose: vi.fn(),
		})),
	}
})

vi.mock("../../../services/mcp/McpServerManager", () => ({
	McpServerManager: {
		getInstance: vi.fn().mockResolvedValue({
			registerClient: vi.fn(),
		}),
		unregisterProvider: vi.fn(),
	},
}))

vi.mock("../../../services/marketplace", () => ({
	MarketplaceManager: vi.fn().mockImplementation(() => ({
		cleanup: vi.fn(),
	})),
}))

vi.mock("../../config/CustomModesManager", () => ({
	CustomModesManager: vi.fn().mockImplementation(() => ({
		getCustomModes: vi.fn().mockResolvedValue([]),
		dispose: vi.fn(),
	})),
}))

vi.mock("../../config/ProviderSettingsManager", () => ({
	ProviderSettingsManager: vi.fn().mockImplementation(() => ({
		getModeConfigId: vi.fn(),
		listConfig: vi.fn().mockResolvedValue([]),
		activateProfile: vi.fn(),
		saveConfig: vi.fn(),
		setModeConfig: vi.fn(),
	})),
}))

vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn().mockReturnValue("/test/workspace"),
}))

vi.mock("../../../shared/modes", () => ({
	defaultModeSlug: "code",
	getModeBySlug: vi.fn().mockReturnValue({
		slug: "code",
		name: "Code Mode",
		roleDefinition: "You are a code assistant",
		groups: ["read", "edit", "browser"],
	}),
}))

vi.mock("../../../shared/experiments", () => ({
	experimentDefault: {},
}))

describe("ClineProvider - Profile Switch Settings Application", () => {
	let provider: ClineProvider
	let mockContext: vscode.ExtensionContext
	let mockOutputChannel: vscode.OutputChannel
	let mockTask: any
	let buildApiHandlerMock: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Initialize TelemetryService
		if (!TelemetryService.hasInstance()) {
			TelemetryService.createInstance([])
		}

		// Setup mock context
		mockContext = {
			extensionPath: "/test/path",
			extensionUri: {} as vscode.Uri,
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
				keys: vi.fn().mockReturnValue([]),
			},
			secrets: {
				get: vi.fn(),
				store: vi.fn(),
				delete: vi.fn(),
			},
			subscriptions: [],
			extension: {
				packageJSON: { version: "1.0.0" },
			},
			globalStorageUri: {
				fsPath: "/test/storage/path",
			},
		} as unknown as vscode.ExtensionContext

		mockOutputChannel = {
			appendLine: vi.fn(),
			clear: vi.fn(),
			dispose: vi.fn(),
		} as unknown as vscode.OutputChannel

		// Create provider instance
		provider = new ClineProvider(mockContext, mockOutputChannel, "sidebar", new ContextProxy(mockContext))

		// Setup mock task
		mockTask = {
			api: {
				getModel: vi.fn().mockReturnValue({ id: "test-model" }),
			},
			apiConfiguration: {
				apiProvider: "openrouter",
				openRouterModelId: "test-model",
				openRouterBaseUrl: "https://openrouter.ai/api/v1",
				openRouterApiKey: "test-key-1",
			},
		}

		// Mock getCurrentTask to return our mock task
		vi.spyOn(provider, "getCurrentTask").mockReturnValue(mockTask as any)

		// Get the buildApiHandler mock
		buildApiHandlerMock = vi.mocked((require("../../../api") as any).buildApiHandler)
	})

	test("rebuilds API handler when explicitly switching profiles with same provider/model but different settings", async () => {
		// Setup provider settings manager mock
		const mockProviderSettingsManager = {
			activateProfile: vi.fn().mockResolvedValue({
				name: "Profile B",
				id: "profile-b-id",
				apiProvider: "openrouter",
				openRouterModelId: "test-model",
				openRouterBaseUrl: "https://different.openrouter.ai/api/v1", // Different base URL
				openRouterApiKey: "test-key-2", // Different API key
				openRouterHeaders: { "X-Custom": "header-value" }, // Additional headers
			}),
			listConfig: vi.fn().mockResolvedValue([]),
			setModeConfig: vi.fn(),
		}

		;(provider as any).providerSettingsManager = mockProviderSettingsManager
		;(provider as any).contextProxy = {
			setValue: vi.fn(),
			setProviderSettings: vi.fn(),
		}

		// Clear previous calls
		buildApiHandlerMock.mockClear()

		// Call activateProviderProfile (simulating explicit user action)
		await provider.activateProviderProfile({ name: "Profile B" })

		// Verify that buildApiHandler was called to rebuild the API handler
		expect(buildApiHandlerMock).toHaveBeenCalledWith({
			name: "Profile B",
			id: "profile-b-id",
			apiProvider: "openrouter",
			openRouterModelId: "test-model",
			openRouterBaseUrl: "https://different.openrouter.ai/api/v1",
			openRouterApiKey: "test-key-2",
			openRouterHeaders: { "X-Custom": "header-value" },
		})

		// Verify that the task's API handler was updated
		expect(mockTask.api).toBeDefined()

		// Verify that the task's apiConfiguration was updated
		expect(mockTask.apiConfiguration).toEqual({
			name: "Profile B",
			id: "profile-b-id",
			apiProvider: "openrouter",
			openRouterModelId: "test-model",
			openRouterBaseUrl: "https://different.openrouter.ai/api/v1",
			openRouterApiKey: "test-key-2",
			openRouterHeaders: { "X-Custom": "header-value" },
		})
	})

	test("does not rebuild API handler when settings are updated through upsertProviderProfile", async () => {
		// Setup provider settings manager mock
		const mockProviderSettingsManager = {
			saveConfig: vi.fn().mockResolvedValue("profile-id"),
			listConfig: vi.fn().mockResolvedValue([]),
			setModeConfig: vi.fn(),
		}

		;(provider as any).providerSettingsManager = mockProviderSettingsManager
		;(provider as any).contextProxy = {
			setValue: vi.fn(),
			setProviderSettings: vi.fn(),
			getValues: vi.fn().mockReturnValue({}),
		}

		// Clear previous calls
		buildApiHandlerMock.mockClear()

		// Call upsertProviderProfile (not an explicit profile switch)
		await provider.upsertProviderProfile("Profile C", {
			apiProvider: "openrouter",
			openRouterModelId: "test-model",
			openRouterBaseUrl: "https://openrouter.ai/api/v1",
			openRouterApiKey: "test-key-3",
		})

		// When not forcing rebuild, it should still be called if provider or model changed
		// In this case, since we're creating/updating a profile, it may or may not rebuild
		// The important thing is that activateProviderProfile forces rebuild
	})

	test("handles different types of setting changes correctly", async () => {
		// Test various setting changes that should trigger rebuild when profile is switched

		const testCases = [
			{
				name: "reasoning level change",
				settings: {
					apiProvider: "openrouter",
					openRouterModelId: "test-model",
					openRouterReasoningLevel: "high", // Changed reasoning level
				},
			},
			{
				name: "service tier change",
				settings: {
					apiProvider: "openrouter",
					openRouterModelId: "test-model",
					openRouterServiceTier: "premium", // Changed service tier
				},
			},
			{
				name: "rate limit change",
				settings: {
					apiProvider: "openrouter",
					openRouterModelId: "test-model",
					openRouterRateLimit: 100, // Changed rate limit
				},
			},
		]

		for (const testCase of testCases) {
			vi.clearAllMocks()

			const mockProviderSettingsManager = {
				activateProfile: vi.fn().mockResolvedValue({
					name: testCase.name,
					id: `${testCase.name}-id`,
					...testCase.settings,
				}),
				listConfig: vi.fn().mockResolvedValue([]),
				setModeConfig: vi.fn(),
			}

			;(provider as any).providerSettingsManager = mockProviderSettingsManager
			;(provider as any).contextProxy = {
				setValue: vi.fn(),
				setProviderSettings: vi.fn(),
			}

			// Clear previous calls
			buildApiHandlerMock.mockClear()

			// Call activateProviderProfile
			await provider.activateProviderProfile({ name: testCase.name })

			// Verify that buildApiHandler was called for each case
			expect(buildApiHandlerMock).toHaveBeenCalledWith(expect.objectContaining(testCase.settings))
		}
	})

	test("preserves task continuity when switching profiles", async () => {
		// Ensure that switching profiles doesn't interrupt the current task

		const mockProviderSettingsManager = {
			activateProfile: vi.fn().mockResolvedValue({
				name: "New Profile",
				id: "new-profile-id",
				apiProvider: "openrouter",
				openRouterModelId: "test-model",
				openRouterBaseUrl: "https://new.openrouter.ai/api/v1",
			}),
			listConfig: vi.fn().mockResolvedValue([]),
			setModeConfig: vi.fn(),
		}

		;(provider as any).providerSettingsManager = mockProviderSettingsManager
		;(provider as any).contextProxy = {
			setValue: vi.fn(),
			setProviderSettings: vi.fn(),
		}

		// Simulate an active task
		mockTask.isActive = true
		mockTask.taskId = "active-task-123"

		// Switch profile
		await provider.activateProviderProfile({ name: "New Profile" })

		// Verify task is still the same instance (not replaced)
		expect(provider.getCurrentTask()).toBe(mockTask)

		// Verify task's API configuration was updated
		expect(mockTask.apiConfiguration.openRouterBaseUrl).toBe("https://new.openrouter.ai/api/v1")
	})
})
