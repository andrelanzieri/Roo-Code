#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

/**
 * Updates the version in package.json with a timestamp suffix
 */
function updateVersionWithTimestamp() {
	const packageJsonPath = path.join(__dirname, "../src/package.json")

	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
		const currentVersion = packageJson.version
		const versionMatch = currentVersion.match(/^(\d+\.\d+\.\d+)/)
		const baseVersion = versionMatch ? versionMatch[1] : currentVersion
		const now = new Date()
		const month = String(now.getMonth() + 1).padStart(2, "0")
		const day = String(now.getDate()).padStart(2, "0")
		const year = now.getFullYear()
		const hours = String(now.getHours()).padStart(2, "0")
		const minutes = String(now.getMinutes()).padStart(2, "0")
		const seconds = String(now.getSeconds()).padStart(2, "0")
		const timestamp = `${month}${day}${year}-${hours}${minutes}${seconds}`
		const newVersion = `${baseVersion}-${timestamp}`
		packageJson.version = newVersion
		fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, "\t"))
		console.log(`Version updated from ${currentVersion} to ${newVersion}`)
		return newVersion
	} catch (error) {
		console.error("Error updating version with timestamp:", error)
		process.exit(1)
	}
}

if (require.main === module) {
	updateVersionWithTimestamp()
}

module.exports = { updateVersionWithTimestamp }
