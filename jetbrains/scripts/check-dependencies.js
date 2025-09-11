#!/usr/bin/env node

/**
 * Check if required dependencies for JetBrains integration are installed
 * This script validates the VSCode submodule and other prerequisites
 */

const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const REQUIRED_NODE_VERSION = 18
const VSCODE_SUBMODULE_PATH = path.join(__dirname, "../../deps/vscode")
const VSCODE_REQUIRED_FILES = [
	"src/main.ts",
	"src/vs/base/common/uri.ts",
	"src/vs/base/parts/ipc/common/ipc.net.ts",
	"src/vs/workbench/api/common/extHost.api.impl.ts",
]

class DependencyChecker {
	constructor() {
		this.errors = []
		this.warnings = []
	}

	checkNodeVersion() {
		const nodeVersion = process.version
		const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0], 10)

		if (majorVersion < REQUIRED_NODE_VERSION) {
			this.errors.push(
				`Node.js version ${REQUIRED_NODE_VERSION} or higher is required. Current version: ${nodeVersion}`,
			)
		} else {
			console.log(`✓ Node.js version ${nodeVersion} meets requirements`)
		}
	}

	checkVSCodeSubmodule() {
		// Check if VSCode submodule directory exists
		if (!fs.existsSync(VSCODE_SUBMODULE_PATH)) {
			this.errors.push(
				`VSCode submodule not found at ${VSCODE_SUBMODULE_PATH}. ` +
					`Run: git submodule update --init --recursive`,
			)
			return
		}

		// Check if submodule is initialized
		const gitDir = path.join(VSCODE_SUBMODULE_PATH, ".git")
		if (!fs.existsSync(gitDir)) {
			this.errors.push(`VSCode submodule is not initialized. ` + `Run: git submodule update --init --recursive`)
			return
		}

		// Check for required files
		const missingFiles = []
		for (const file of VSCODE_REQUIRED_FILES) {
			const filePath = path.join(VSCODE_SUBMODULE_PATH, file)
			if (!fs.existsSync(filePath)) {
				missingFiles.push(file)
			}
		}

		if (missingFiles.length > 0) {
			this.warnings.push(
				`VSCode submodule is missing expected files:\n  ${missingFiles.join("\n  ")}\n` +
					`This might be normal if the patch hasn't been applied yet.`,
			)
		} else {
			console.log("✓ VSCode submodule is properly initialized")
		}

		// Check submodule status
		try {
			const status = execSync("git submodule status deps/vscode", {
				encoding: "utf8",
				cwd: path.join(__dirname, "../.."),
			})

			if (status.startsWith("-")) {
				this.errors.push("VSCode submodule is not initialized")
			} else if (status.startsWith("+")) {
				this.warnings.push("VSCode submodule has uncommitted changes")
			} else {
				console.log("✓ VSCode submodule status is clean")
			}
		} catch (error) {
			this.warnings.push(`Could not check VSCode submodule status: ${error.message}`)
		}
	}

	checkPatchFile() {
		const patchPath = path.join(__dirname, "../../deps/patches/vscode/jetbrains.patch")

		if (!fs.existsSync(patchPath)) {
			this.errors.push(`JetBrains patch file not found at ${patchPath}`)
		} else {
			const patchContent = fs.readFileSync(patchPath, "utf8")
			const expectedPatches = [
				"src/main.ts",
				"src/vs/base/common/uri.ts",
				"src/vs/base/parts/ipc/common/ipc.net.ts",
				"src/vs/workbench/api/common/extHost.api.impl.ts",
			]

			const missingPatches = expectedPatches.filter((file) => !patchContent.includes(`diff --git a/${file}`))

			if (missingPatches.length > 0) {
				this.warnings.push(
					`Patch file may be incomplete. Missing patches for:\n  ${missingPatches.join("\n  ")}`,
				)
			} else {
				console.log("✓ JetBrains patch file is present and appears complete")
			}
		}
	}

	checkJavaVersion() {
		try {
			const javaVersion = execSync("java -version 2>&1", { encoding: "utf8" })
			const versionMatch = javaVersion.match(/version "(\d+)/)

			if (versionMatch) {
				const majorVersion = parseInt(versionMatch[1], 10)
				if (majorVersion < 17) {
					this.warnings.push(
						`Java 17 or higher is recommended for building the JetBrains plugin. ` +
							`Current version: ${majorVersion}`,
					)
				} else {
					console.log(`✓ Java version ${majorVersion} meets requirements`)
				}
			}
		} catch (error) {
			this.warnings.push(
				"Java is not installed or not in PATH. " + "Java 17+ is required to build the JetBrains plugin.",
			)
		}
	}

	checkGradleWrapper() {
		const gradlewPath = path.join(__dirname, "../plugin/gradlew")

		if (!fs.existsSync(gradlewPath)) {
			this.warnings.push("Gradle wrapper not found. It will be needed to build the JetBrains plugin.")
		} else {
			console.log("✓ Gradle wrapper is present")
		}
	}

	checkEnvironment() {
		// Check for DEVENV variable if needed
		if (process.env.DEVENV) {
			console.log(`✓ DEVENV is set to: ${process.env.DEVENV}`)
		}
	}

	async run() {
		console.log("Checking JetBrains integration dependencies...\n")

		this.checkNodeVersion()
		this.checkVSCodeSubmodule()
		this.checkPatchFile()
		this.checkJavaVersion()
		this.checkGradleWrapper()
		this.checkEnvironment()

		console.log("\n" + "=".repeat(60))

		if (this.errors.length > 0) {
			console.error("\n❌ ERRORS:")
			this.errors.forEach((error) => {
				console.error(`   ${error}`)
			})
		}

		if (this.warnings.length > 0) {
			console.warn("\n⚠️  WARNINGS:")
			this.warnings.forEach((warning) => {
				console.warn(`   ${warning}`)
			})
		}

		if (this.errors.length === 0) {
			if (this.warnings.length === 0) {
				console.log("\n✅ All dependencies are properly configured!")
			} else {
				console.log("\n✅ Core dependencies are satisfied, but there are some warnings to review.")
			}
			process.exit(0)
		} else {
			console.error("\n❌ Dependency check failed. Please fix the errors above.")
			process.exit(1)
		}
	}
}

// Run the checker
const checker = new DependencyChecker()
checker.run().catch((error) => {
	console.error("Unexpected error during dependency check:", error)
	process.exit(1)
})
