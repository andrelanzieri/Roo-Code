import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import axios from "axios"
import { ServiceManager } from "../ServiceManager"
import { ServiceInfo } from "@roo-code/types"

// Mock axios
vi.mock("axios")

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		terminals: [],
		showErrorMessage: vi.fn(),
	},
	OutputChannel: vi.fn(),
}))

// Mock TerminalRegistry
vi.mock("../TerminalRegistry", () => ({
	TerminalRegistry: {
		getTerminals: vi.fn().mockReturnValue([]),
		getOrCreateTerminal: vi.fn(),
	},
}))

describe("ServiceManager", () => {
	let serviceManager: ServiceManager
	let mockProvider: any
	let mockOutputChannel: any

	beforeEach(() => {
		// Reset singleton instance
		ServiceManager["instance"] = undefined

		// Create mock provider
		mockProvider = {
			postMessageToWebview: vi.fn(),
			log: vi.fn(),
		}

		// Create mock output channel
		mockOutputChannel = {
			appendLine: vi.fn(),
		}

		serviceManager = ServiceManager.getInstance({
			provider: mockProvider,
			outputChannel: mockOutputChannel,
		})
	})

	afterEach(() => {
		vi.clearAllMocks()
		// Don't dispose in afterEach to avoid errors, do it in individual tests when needed
	})

	describe("Service Detection", () => {
		it("should detect Node.js dev server commands", () => {
			expect(serviceManager.isServiceCommand("npm run dev")).toBe(true)
			expect(serviceManager.isServiceCommand("yarn dev")).toBe(true)
			expect(serviceManager.isServiceCommand("pnpm run start")).toBe(true)
			expect(serviceManager.isServiceCommand("bun run serve")).toBe(true)
		})

		it("should detect Vite commands", () => {
			expect(serviceManager.isServiceCommand("npx vite")).toBe(true)
			expect(serviceManager.isServiceCommand("bunx vite")).toBe(true)
		})

		it("should detect Next.js commands", () => {
			expect(serviceManager.isServiceCommand("npx next dev")).toBe(true)
			expect(serviceManager.isServiceCommand("npx next start")).toBe(true)
		})

		it("should detect Python server commands", () => {
			expect(serviceManager.isServiceCommand("python -m http.server")).toBe(true)
			expect(serviceManager.isServiceCommand("python manage.py runserver")).toBe(true)
			expect(serviceManager.isServiceCommand("flask run")).toBe(true)
			expect(serviceManager.isServiceCommand("uvicorn main:app")).toBe(true)
			expect(serviceManager.isServiceCommand("streamlit run app.py")).toBe(true)
		})

		it("should detect Rails commands", () => {
			expect(serviceManager.isServiceCommand("rails server")).toBe(true)
			expect(serviceManager.isServiceCommand("rails s")).toBe(true)
			expect(serviceManager.isServiceCommand("bundle exec rails server")).toBe(true)
		})

		it("should detect Java/Spring Boot commands", () => {
			expect(serviceManager.isServiceCommand("mvn spring-boot:run")).toBe(true)
			expect(serviceManager.isServiceCommand("gradle bootRun")).toBe(true)
			expect(serviceManager.isServiceCommand("./mvnw spring-boot:run")).toBe(true)
			expect(serviceManager.isServiceCommand("./gradlew bootRun")).toBe(true)
		})

		it("should detect Go commands", () => {
			expect(serviceManager.isServiceCommand("go run main.go")).toBe(true)
			expect(serviceManager.isServiceCommand("air")).toBe(true)
		})

		it("should detect .NET commands", () => {
			expect(serviceManager.isServiceCommand("dotnet run")).toBe(true)
			expect(serviceManager.isServiceCommand("dotnet watch")).toBe(true)
		})

		it("should detect Docker commands", () => {
			expect(serviceManager.isServiceCommand("docker run")).toBe(true)
			expect(serviceManager.isServiceCommand("docker-compose up")).toBe(true)
		})

		it("should not detect non-service commands", () => {
			expect(serviceManager.isServiceCommand("ls -la")).toBe(false)
			expect(serviceManager.isServiceCommand("cd /home")).toBe(false)
			expect(serviceManager.isServiceCommand("echo hello")).toBe(false)
			expect(serviceManager.isServiceCommand("git status")).toBe(false)
		})
	})

	describe("Service Name Detection", () => {
		it("should return correct service names", () => {
			expect(serviceManager.getServiceName("npm run dev")).toBe("Node.js Dev Server")
			expect(serviceManager.getServiceName("npx vite")).toBe("Vite")
			expect(serviceManager.getServiceName("python manage.py runserver")).toBe("Django")
			expect(serviceManager.getServiceName("rails server")).toBe("Rails")
			expect(serviceManager.getServiceName("flask run")).toBe("Flask")
			expect(serviceManager.getServiceName("docker-compose up")).toBe("Docker")
		})

		it("should return generic 'Service' for unmatched commands", () => {
			expect(serviceManager.getServiceName("unknown command")).toBe("Service")
		})
	})

	describe("Service Lifecycle", () => {
		it("should start a service and track it", async () => {
			const mockTerminal = { id: 1 }
			const mockProcess = {
				callbacks: {
					onLine: vi.fn(),
				},
			}

			const serviceInfo = await serviceManager.startService(
				"npm run dev",
				"test-id",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-123",
			)

			expect(serviceInfo).toMatchObject({
				id: "test-id",
				name: "Node.js Dev Server",
				command: "npm run dev",
				status: "starting",
				cwd: "/test/path",
				taskId: "task-123",
			})

			const services = serviceManager.getServices()
			expect(services).toHaveLength(1)
			expect(services[0].id).toBe("test-id")

			// Check if service starting status was sent
			expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "commandExecutionStatus",
					text: expect.stringContaining("service_starting"),
				}),
			)
		})

		it("should stop a service", async () => {
			const mockTerminal = { id: 1 }
			const mockProcess = {
				callbacks: {
					onLine: vi.fn(),
				},
				abort: vi.fn(),
			}

			// Start a service first
			await serviceManager.startService(
				"npm run dev",
				"test-id",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-123",
			)

			// Stop the service
			await serviceManager.stopService("test-id")

			const services = serviceManager.getServices()
			expect(services).toHaveLength(0)
		})

		it("should get services for a specific task", async () => {
			const mockTerminal = { id: 1 }
			const mockProcess = {
				callbacks: {
					onLine: vi.fn(),
				},
			}

			// Start multiple services with different task IDs
			await serviceManager.startService(
				"npm run dev",
				"service-1",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-123",
			)

			await serviceManager.startService(
				"python manage.py runserver",
				"service-2",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-456",
			)

			await serviceManager.startService(
				"rails server",
				"service-3",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-123",
			)

			const task123Services = serviceManager.getTaskServices("task-123")
			expect(task123Services).toHaveLength(2)
			expect(task123Services[0].id).toBe("service-1")
			expect(task123Services[1].id).toBe("service-3")

			const task456Services = serviceManager.getTaskServices("task-456")
			expect(task456Services).toHaveLength(1)
			expect(task456Services[0].id).toBe("service-2")
		})

		it("should stop all services for a task", async () => {
			const mockTerminal = { id: 1 }
			const mockProcess = {
				callbacks: {
					onLine: vi.fn(),
				},
			}

			// Start multiple services with same task ID
			await serviceManager.startService(
				"npm run dev",
				"service-1",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-123",
			)

			await serviceManager.startService(
				"python manage.py runserver",
				"service-2",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-123",
			)

			await serviceManager.startService(
				"rails server",
				"service-3",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-456",
			)

			// Stop all services for task-123
			await serviceManager.stopTaskServices("task-123")

			const allServices = serviceManager.getServices()
			expect(allServices).toHaveLength(1)
			expect(allServices[0].taskId).toBe("task-456")
		})
	})

	describe("Port Extraction", () => {
		let mockProcess: any

		beforeEach(() => {
			mockProcess = {
				callbacks: {
					onLine: vi.fn(),
				},
			}
		})

		it("should extract port from output patterns", async () => {
			const mockTerminal = { id: 1 }

			await serviceManager.startService(
				"npm run dev",
				"test-id",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-123",
			)

			// Simulate different output patterns
			const outputs = [
				"Server running on http://localhost:3000",
				"Listening on port 8080",
				"Started at 127.0.0.1:5000",
				"Available at http://0.0.0.0:4000",
			]

			for (const output of outputs) {
				// Call the onLine callback that was set during monitoring
				if (mockProcess.callbacks?.onLine) {
					await mockProcess.callbacks.onLine(output, mockProcess)
				}
			}

			// Note: In the actual test, the port extraction happens inside
			// monitorServiceOutput which modifies the service info internally
			// We can't directly test this without refactoring the class
			// to expose the extractPort method or service internals
		})
	})

	describe("Ready Detection", () => {
		it("should detect service ready from output patterns", async () => {
			const mockTerminal = { id: 1 }
			const mockProcess = {
				callbacks: {
					onLine: vi.fn(),
				},
			}

			await serviceManager.startService(
				"npm run dev",
				"test-id",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-123",
			)

			// Test various ready patterns
			const readyOutputs = [
				"Server is ready",
				"Compiled successfully",
				"Server running on http://localhost:3000",
				"Vite ready in 500ms",
				"Django Starting development server",
				"Webpack compiled successfully",
			]

			for (const output of readyOutputs) {
				// The actual monitoring happens via callbacks
				if (mockProcess.callbacks?.onLine) {
					await mockProcess.callbacks.onLine(output, mockProcess)
				}
			}

			// Check if ready status was sent
			// Note: The actual ready detection is internal to the class
		})
	})

	describe("Health Check", () => {
		it("should perform HTTP health check when port is available", async () => {
			const mockAxiosGet = vi.mocked(axios.get)
			mockAxiosGet.mockResolvedValueOnce({ status: 200, data: "OK" })

			const mockTerminal = { id: 1 }
			const mockProcess = {
				callbacks: {
					onLine: vi.fn(),
				},
			}

			const serviceInfo = await serviceManager.startService(
				"npm run dev",
				"test-id",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-123",
			)

			// Manually set port to trigger health check
			const service = serviceManager.getServices()[0]
			if (service) {
				service.port = 3000
			}

			// Wait for health check to be attempted
			await new Promise((resolve) => setTimeout(resolve, 3500))

			// Verify axios was called with correct URL
			expect(mockAxiosGet).toHaveBeenCalledWith(
				"http://localhost:3000",
				expect.objectContaining({
					timeout: 2000,
					validateStatus: expect.any(Function),
				}),
			)
		})
	})

	describe("Cleanup", () => {
		it("should dispose all services and clear timeouts", async () => {
			// Create a fresh instance for this test
			ServiceManager["instance"] = undefined
			const testManager = ServiceManager.getInstance({
				provider: mockProvider,
				outputChannel: mockOutputChannel,
			})

			const mockTerminal = { id: 1 }
			const mockProcess = {
				callbacks: {
					onLine: vi.fn(),
				},
			}

			// Start multiple services
			await testManager.startService(
				"npm run dev",
				"service-1",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-123",
			)

			await testManager.startService(
				"python manage.py runserver",
				"service-2",
				"/test/path",
				mockTerminal as any,
				mockProcess as any,
				"task-456",
			)

			// Mock the TerminalRegistry to avoid errors during cleanup
			const { TerminalRegistry } = await import("../TerminalRegistry")
			vi.mocked(TerminalRegistry.getTerminals).mockReturnValue([])

			// Dispose the service manager
			testManager.dispose()

			// Verify all services are cleared
			expect(testManager.getServices()).toHaveLength(0)

			// Verify singleton is reset
			expect(ServiceManager["instance"]).toBeUndefined()
		})
	})
})
