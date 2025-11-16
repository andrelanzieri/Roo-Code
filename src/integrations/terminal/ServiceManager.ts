import * as vscode from "vscode"
import axios from "axios"
import { ServiceInfo, ServiceStatus, CommandExecutionStatus } from "@roo-code/types"
import { Terminal } from "./Terminal"
import { TerminalRegistry } from "./TerminalRegistry"
import { RooTerminalCallbacks, RooTerminalProcess } from "./types"

/**
 * Service detection patterns for 70+ common development servers
 */
const SERVICE_PATTERNS = [
	// Node.js/JavaScript/TypeScript
	{ pattern: /^(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|develop|start|serve|preview|watch)/, name: "Node.js Dev Server" },
	{ pattern: /^(npx|bunx)\s+vite/, name: "Vite" },
	{ pattern: /^(npx|bunx)\s+next\s+(dev|start)/, name: "Next.js" },
	{ pattern: /^(npx|bunx)\s+nuxt\s+(dev|start)/, name: "Nuxt.js" },
	{ pattern: /^(npx|bunx)\s+gatsby\s+(develop|serve)/, name: "Gatsby" },
	{ pattern: /^(npx|bunx)\s+remix\s+(dev|start)/, name: "Remix" },
	{ pattern: /^(npx|bunx)\s+astro\s+(dev|preview)/, name: "Astro" },
	{ pattern: /^(npx|bunx)\s+parcel/, name: "Parcel" },
	{ pattern: /^(npx|bunx)\s+webpack(-dev-server)?/, name: "Webpack" },
	{ pattern: /^(npx|bunx)\s+rollup/, name: "Rollup" },
	{ pattern: /^(npx|bunx)\s+snowpack/, name: "Snowpack" },
	{ pattern: /^(npx|bunx)\s+esbuild/, name: "ESBuild" },
	{ pattern: /^(npx|bunx)\s+turbo\s+dev/, name: "Turborepo" },
	{ pattern: /^(npx|bunx)\s+lerna\s+run\s+(dev|start)/, name: "Lerna" },
	{ pattern: /^(npx|bunx)\s+nx\s+serve/, name: "Nx" },
	{ pattern: /^(npx|bunx)\s+expo\s+start/, name: "Expo" },
	{ pattern: /^(npx|bunx)\s+react-native\s+(run|start)/, name: "React Native" },
	{ pattern: /^(npx|bunx)\s+ionic\s+serve/, name: "Ionic" },
	{ pattern: /^(npx|bunx)\s+quasar\s+dev/, name: "Quasar" },
	{ pattern: /^(npx|bunx)\s+@angular\/cli\s+serve/, name: "Angular CLI" },
	{ pattern: /^ng\s+serve/, name: "Angular" },
	{ pattern: /^(npx|bunx)\s+@vue\/cli-service\s+serve/, name: "Vue CLI" },
	{ pattern: /^(npx|bunx)\s+vuepress\s+dev/, name: "VuePress" },
	{ pattern: /^(npx|bunx)\s+vitepress\s+dev/, name: "VitePress" },
	{ pattern: /^(npx|bunx)\s+docusaurus\s+start/, name: "Docusaurus" },
	{ pattern: /^(npx|bunx)\s+storybook/, name: "Storybook" },
	{ pattern: /^(npx|bunx)\s+serve/, name: "Static Server" },
	{ pattern: /^(npx|bunx)\s+http-server/, name: "HTTP Server" },
	{ pattern: /^(npx|bunx)\s+browser-sync/, name: "BrowserSync" },
	{ pattern: /^(npx|bunx)\s+nodemon/, name: "Nodemon" },
	{ pattern: /^(npx|bunx)\s+pm2\s+start/, name: "PM2" },
	{ pattern: /^(npx|bunx)\s+forever\s+start/, name: "Forever" },
	{ pattern: /^node\s+.*server/, name: "Node.js Server" },
	{ pattern: /^deno\s+run.*--allow-net/, name: "Deno Server" },

	// Python
	{ pattern: /^python\s+-m\s+http\.server/, name: "Python HTTP Server" },
	{ pattern: /^python\s+manage\.py\s+runserver/, name: "Django" },
	{ pattern: /^django-admin\s+runserver/, name: "Django Admin" },
	{ pattern: /^flask\s+run/, name: "Flask" },
	{ pattern: /^python\s+.*app\.py/, name: "Python App" },
	{ pattern: /^uvicorn/, name: "Uvicorn" },
	{ pattern: /^gunicorn/, name: "Gunicorn" },
	{ pattern: /^hypercorn/, name: "Hypercorn" },
	{ pattern: /^daphne/, name: "Daphne" },
	{ pattern: /^waitress-serve/, name: "Waitress" },
	{ pattern: /^streamlit\s+run/, name: "Streamlit" },
	{ pattern: /^gradio/, name: "Gradio" },
	{ pattern: /^jupyterlab/, name: "JupyterLab" },
	{ pattern: /^jupyter\s+(notebook|lab)/, name: "Jupyter" },
	{ pattern: /^poetry\s+run\s+(python|uvicorn|gunicorn)/, name: "Poetry Server" },
	{ pattern: /^pipenv\s+run\s+(python|uvicorn|gunicorn)/, name: "Pipenv Server" },

	// Ruby
	{ pattern: /^rails\s+s(erver)?/, name: "Rails" },
	{ pattern: /^ruby\s+.*server/, name: "Ruby Server" },
	{ pattern: /^jekyll\s+serve/, name: "Jekyll" },
	{ pattern: /^middleman\s+server/, name: "Middleman" },
	{ pattern: /^rackup/, name: "Rack" },
	{ pattern: /^puma/, name: "Puma" },
	{ pattern: /^unicorn/, name: "Unicorn" },
	{ pattern: /^thin\s+start/, name: "Thin" },
	{ pattern: /^bundle\s+exec\s+(rails|rackup|puma)/, name: "Bundler Server" },

	// PHP
	{ pattern: /^php\s+-S/, name: "PHP Built-in Server" },
	{ pattern: /^php\s+artisan\s+serve/, name: "Laravel" },
	{ pattern: /^symfony\s+serve/, name: "Symfony" },
	{ pattern: /^composer\s+serve/, name: "Composer Server" },

	// Java/JVM
	{ pattern: /^(java|kotlin)\s+.*\.(jar|war)/, name: "Java Application" },
	{ pattern: /^mvn\s+spring-boot:run/, name: "Spring Boot Maven" },
	{ pattern: /^gradle\s+bootRun/, name: "Spring Boot Gradle" },
	{ pattern: /^\.\/mvnw\s+spring-boot:run/, name: "Spring Boot Wrapper" },
	{ pattern: /^\.\/gradlew\s+bootRun/, name: "Gradle Wrapper" },
	{ pattern: /^sbt\s+run/, name: "SBT" },
	{ pattern: /^lein\s+run/, name: "Leiningen" },
	{ pattern: /^boot\s+run/, name: "Boot" },

	// Go
	{ pattern: /^go\s+run/, name: "Go" },
	{ pattern: /^air/, name: "Air (Go)" },
	{ pattern: /^fresh/, name: "Fresh (Go)" },
	{ pattern: /^realize\s+start/, name: "Realize (Go)" },
	{ pattern: /^gin/, name: "Gin (Go)" },

	// Rust
	{ pattern: /^cargo\s+(run|watch)/, name: "Cargo" },
	{ pattern: /^trunk\s+serve/, name: "Trunk" },
	{ pattern: /^wasm-pack\s+build/, name: "WASM Pack" },

	// .NET/C#
	{ pattern: /^dotnet\s+(run|watch)/, name: ".NET" },
	{ pattern: /^dotnet\s+.*\.dll/, name: ".NET Application" },

	// Other
	{ pattern: /^docker(-compose)?\s+(run|up)/, name: "Docker" },
	{ pattern: /^kubectl/, name: "Kubernetes" },
	{ pattern: /^hugo\s+serve/, name: "Hugo" },
	{ pattern: /^hexo\s+serve/, name: "Hexo" },
	{ pattern: /^eleventy\s+--serve/, name: "Eleventy" },
	{ pattern: /^zola\s+serve/, name: "Zola" },
	{ pattern: /^pelican\s+--listen/, name: "Pelican" },
]

/**
 * Ready detection patterns for common servers
 */
const READY_PATTERNS = [
	// Generic patterns
	/Server.*(?:running|listening|started).*(?:on|at).*(?:port|http)/i,
	/Listening.*(?:on|at).*(?:port|\d{4})/i,
	/(?:Ready|Started).*(?:on|at).*(?:port|http)/i,
	/Available at.*http/i,
	/Server is ready/i,
	/Compiled successfully/i,
	/Build succeeded/i,
	/Watching for file changes/i,
	/Development server.*running/i,
	/Local:.*http/i,

	// Framework-specific patterns
	/webpack.*compiled successfully/i,
	/Vite.*ready in \d+ms/i,
	/Next\.js.*ready/i,
	/Nuxt.*listening/i,
	/Django.*Starting development server/i,
	/Rails.*Listening on/i,
	/Flask.*Running on/i,
	/Laravel.*Server running/i,
	/Spring Boot.*Started.*application/i,
	/Tomcat.*started on port/i,
	/Express.*listening/i,
	/FastAPI.*Uvicorn running/i,
]

/**
 * Port extraction patterns
 */
const PORT_PATTERNS = [
	/:(\d{4,5})\b/,
	/port[:\s]+(\d{4,5})\b/i,
	/localhost[:\s]*(\d{4,5})\b/i,
	/127\.0\.0\.1[:\s]*(\d{4,5})\b/,
	/0\.0\.0\.0[:\s]*(\d{4,5})\b/,
]

export interface ServiceManagerOptions {
	provider: any // ClineProvider
	outputChannel?: vscode.OutputChannel
}

export class ServiceManager {
	private static instance: ServiceManager | undefined
	private services: Map<string, ServiceInfo> = new Map()
	private provider: any
	private outputChannel?: vscode.OutputChannel
	private healthCheckTimeouts: Map<string, NodeJS.Timeout> = new Map()

	constructor(options: ServiceManagerOptions) {
		this.provider = options.provider
		this.outputChannel = options.outputChannel
	}

	public static getInstance(options?: ServiceManagerOptions): ServiceManager {
		if (!ServiceManager.instance && options) {
			ServiceManager.instance = new ServiceManager(options)
		}
		return ServiceManager.instance!
	}

	/**
	 * Detect if a command is a service command
	 */
	public isServiceCommand(command: string): boolean {
		return SERVICE_PATTERNS.some((pattern) => pattern.pattern.test(command))
	}

	/**
	 * Get service name from command
	 */
	public getServiceName(command: string): string {
		const match = SERVICE_PATTERNS.find((pattern) => pattern.pattern.test(command))
		return match?.name || "Service"
	}

	/**
	 * Start a service
	 */
	public async startService(
		command: string,
		executionId: string,
		cwd: string,
		terminal: Terminal | any,
		process: RooTerminalProcess,
		taskId?: string,
	): Promise<ServiceInfo> {
		const serviceName = this.getServiceName(command)
		const serviceInfo: ServiceInfo = {
			id: executionId,
			name: serviceName,
			command,
			status: "starting",
			startedAt: Date.now(),
			cwd,
			taskId,
		}

		this.services.set(executionId, serviceInfo)
		this.log(`Starting service: ${serviceName} (${executionId})`)

		// Send service starting status
		this.sendServiceStatus(executionId, "service_starting", `Starting ${serviceName}...`)

		// Set up output monitoring for ready detection
		this.monitorServiceOutput(executionId, process)

		// Start health check after a delay
		setTimeout(() => {
			this.startHealthCheck(executionId)
		}, 3000)

		return serviceInfo
	}

	/**
	 * Monitor service output for ready detection
	 */
	private monitorServiceOutput(serviceId: string, process: RooTerminalProcess): void {
		const service = this.services.get(serviceId)
		if (!service) return

		// Note: The actual output monitoring happens via the callbacks passed
		// to terminal.runCommand in ExecuteCommandTool. We rely on that
		// for now, but could enhance this in the future.
	}

	/**
	 * Extract port number from output
	 */
	private extractPort(output: string): number | undefined {
		for (const pattern of PORT_PATTERNS) {
			const match = output.match(pattern)
			if (match && match[1]) {
				const port = parseInt(match[1], 10)
				if (port > 0 && port < 65536) {
					return port
				}
			}
		}
		return undefined
	}

	/**
	 * Start health check for a service
	 */
	private startHealthCheck(serviceId: string): void {
		const service = this.services.get(serviceId)
		if (!service || service.status !== "starting") return

		let checkCount = 0
		const maxChecks = 20 // Check for up to 1 minute
		const checkInterval = 3000 // Check every 3 seconds

		const performCheck = async () => {
			const service = this.services.get(serviceId)
			if (!service || service.status !== "starting") {
				return
			}

			checkCount++

			// Try HTTP health check if we have a port
			if (service.port) {
				try {
					const response = await axios.get(`http://localhost:${service.port}`, {
						timeout: 2000,
						validateStatus: () => true, // Accept any status
					})

					// Any response means server is responding
					if (response) {
						this.markServiceReady(serviceId)
						return
					}
				} catch (error) {
					// Continue checking
				}
			}

			// Continue checking or timeout
			if (checkCount < maxChecks) {
				const timeout = setTimeout(performCheck, checkInterval)
				this.healthCheckTimeouts.set(serviceId, timeout)
			} else {
				// Assume ready after timeout (service might not have HTTP endpoint)
				this.markServiceReady(serviceId)
			}
		}

		// Start checking
		performCheck()
	}

	/**
	 * Mark a service as ready
	 */
	private markServiceReady(serviceId: string): void {
		const service = this.services.get(serviceId)
		if (!service || service.status !== "starting") return

		service.status = "ready"
		service.readyAt = Date.now()

		// Clear health check timeout
		const timeout = this.healthCheckTimeouts.get(serviceId)
		if (timeout) {
			clearTimeout(timeout)
			this.healthCheckTimeouts.delete(serviceId)
		}

		this.log(`Service ready: ${service.name} (${serviceId})`)

		// Send service ready status
		this.sendServiceStatus(serviceId, "service_ready", service.url, service.port)

		// Update provider state
		this.updateProviderState()
	}

	/**
	 * Stop a service
	 */
	public async stopService(serviceId: string): Promise<void> {
		const service = this.services.get(serviceId)
		if (!service) return

		service.status = "stopping"
		this.sendServiceStatus(serviceId, "service_stopping")

		// Clear health check timeout
		const timeout = this.healthCheckTimeouts.get(serviceId)
		if (timeout) {
			clearTimeout(timeout)
			this.healthCheckTimeouts.delete(serviceId)
		}

		// Find and abort the terminal process
		const terminals = TerminalRegistry.getTerminals(true, service.taskId)
		for (const terminal of terminals) {
			// Abort the process if it exists
			if (terminal.process) {
				await terminal.process.abort()
			}
		}

		service.status = "stopped"
		service.stoppedAt = Date.now()

		this.services.delete(serviceId)
		this.log(`Service stopped: ${service.name} (${serviceId})`)

		this.updateProviderState()
	}

	/**
	 * Stop all services for a task
	 */
	public async stopTaskServices(taskId: string): Promise<void> {
		const taskServices = Array.from(this.services.values()).filter((s) => s.taskId === taskId)

		for (const service of taskServices) {
			await this.stopService(service.id)
		}
	}

	/**
	 * Get all running services
	 */
	public getServices(): ServiceInfo[] {
		return Array.from(this.services.values())
	}

	/**
	 * Get services for a specific task
	 */
	public getTaskServices(taskId: string): ServiceInfo[] {
		return Array.from(this.services.values()).filter((s) => s.taskId === taskId)
	}

	/**
	 * Send service status to webview
	 */
	private sendServiceStatus(executionId: string, status: string, messageOrUrl?: string, port?: number): void {
		const statusMessage: CommandExecutionStatus = {
			executionId,
			status: status as any,
			...(status === "service_ready" && {
				serviceUrl: messageOrUrl,
				servicePort: port,
			}),
			...(status === "service_starting" && {
				message: messageOrUrl,
			}),
		}

		this.provider?.postMessageToWebview({
			type: "commandExecutionStatus",
			text: JSON.stringify(statusMessage),
		})
	}

	/**
	 * Update provider state with service information
	 */
	private updateProviderState(): void {
		this.provider?.postMessageToWebview({
			type: "servicesUpdate",
			services: this.getServices(),
		})
	}

	/**
	 * Log message
	 */
	private log(message: string): void {
		if (this.outputChannel) {
			this.outputChannel.appendLine(`[ServiceManager] ${message}`)
		}
		console.log(`[ServiceManager] ${message}`)
	}

	/**
	 * Clean up resources
	 */
	public dispose(): void {
		// Clear all health check timeouts
		for (const timeout of this.healthCheckTimeouts.values()) {
			clearTimeout(timeout)
		}
		this.healthCheckTimeouts.clear()

		// Stop all services
		for (const service of this.services.values()) {
			this.stopService(service.id)
		}
		this.services.clear()

		ServiceManager.instance = undefined
	}
}
