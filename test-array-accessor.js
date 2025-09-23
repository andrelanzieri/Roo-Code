// Test file for array accessor and optional chaining issue
const data = {
	items: [
		{ name: "first", values: [1, 2, 3] },
		{ name: "second", values: [4, 5, 6] },
	],
}

// Original code with array accessors and optional chaining
const result1 = data?.items?.[0]?.values?.[1]
const result2 = data?.items?.[1]?.values?.[2]

// More complex example
const complexData = {
	nested: {
		arrays: [
			[{ id: 1 }, { id: 2 }],
			[{ id: 3 }, { id: 4 }],
		],
	},
}

const complexResult = complexData?.nested?.arrays?.[0]?.[1]?.id

// Function with optional chaining
function getValue(obj) {
	return obj?.data?.[0]?.value?.[1]
}

console.log("Results:", result1, result2, complexResult)
