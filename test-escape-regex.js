// Test the escapeRegExp function behavior
function escapeRegExp(input) {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Test cases with array accessors and optional chaining
const testCases = [
	"data?.[0]?.value",
	"obj?.items?.[0]?.values?.[1]",
	"array[0].item[1]",
	"data?.nested?.arrays?.[0]?.[1]?.id",
]

console.log("Testing escapeRegExp function:")
console.log("==============================")

testCases.forEach((testCase) => {
	const escaped = escapeRegExp(testCase)
	console.log(`Original: ${testCase}`)
	console.log(`Escaped:  ${escaped}`)

	// Create a regex with the escaped pattern
	const regex = new RegExp(escaped, "g")

	// Test if it matches the original string
	const matches = testCase.match(regex)
	console.log(`Matches original: ${matches ? "YES" : "NO"}`)
	console.log("---")
})

// Now test what happens when we try to replace
const fileContent = `const result = data?.[0]?.value;`
const searchPattern = "data?.[0]?.value"
const replacePattern = "data?.[1]?.value"

console.log("\nTesting replacement:")
console.log("====================")
console.log(`File content: ${fileContent}`)
console.log(`Search for: ${searchPattern}`)
console.log(`Replace with: ${replacePattern}`)

// Using escaped pattern (current behavior)
const escapedSearch = escapeRegExp(searchPattern)
const regexEscaped = new RegExp(escapedSearch, "g")
const resultEscaped = fileContent.replace(regexEscaped, replacePattern)
console.log(`\nWith escaping: ${resultEscaped}`)
console.log(`Success: ${resultEscaped !== fileContent ? "YES" : "NO"}`)
