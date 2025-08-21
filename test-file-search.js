const { searchWorkspaceFiles } = require("./src/services/search/file-search")
const path = require("path")

async function testFileSearch() {
	console.log("Testing file search with spaces in filenames...\n")

	const testQueries = [
		"testfile", // Should match "test file with spaces.md"
		"test file", // Should match "test file with spaces.md"
		"spaces", // Should match "test file with spaces.md"
		"withspaces", // Should match "test file with spaces.md"
	]

	const cwd = process.cwd()

	for (const query of testQueries) {
		console.log(`\nSearching for: "${query}"`)
		console.log("-".repeat(40))

		try {
			const results = await searchWorkspaceFiles(cwd, query)

			if (results.length === 0) {
				console.log("No results found")
			} else {
				console.log(`Found ${results.length} result(s):`)
				results.forEach((result) => {
					console.log(`  - ${result.path}`)
					if (result.label && result.label !== path.basename(result.path)) {
						console.log(`    Label: ${result.label}`)
					}
				})
			}
		} catch (error) {
			console.error(`Error: ${error.message}`)
		}
	}

	console.log("\n" + "=".repeat(40))
	console.log("Test completed!")
}

testFileSearch().catch(console.error)
