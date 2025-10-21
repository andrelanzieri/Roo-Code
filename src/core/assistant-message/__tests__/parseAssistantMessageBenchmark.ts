/* eslint-disable @typescript-eslint/no-unsafe-function-type */

// node --expose-gc --import tsx src/core/assistant-message/__tests__/parseAssistantMessageBenchmark.ts

import { performance } from "perf_hooks"
import { parseAssistantMessage as parseAssistantMessageV1 } from "../parseAssistantMessage"
import { parseAssistantMessageV2 } from "../parseAssistantMessageV2"

const formatNumber = (num: number): string => {
	return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

const measureExecutionTime = (fn: Function, input: string, iterations: number = 1000): number => {
	for (let i = 0; i < 10; i++) {
		fn(input)
	}

	const start = performance.now()

	for (let i = 0; i < iterations; i++) {
		fn(input)
	}

	const end = performance.now()
	return (end - start) / iterations // Average time per iteration in ms.
}

const measureMemoryUsage = (
	fn: Function,
	input: string,
	iterations: number = 100,
): { heapUsed: number; heapTotal: number } => {
	if (global.gc) {
		// Force garbage collection if available.
		global.gc()
	} else {
		console.warn("No garbage collection hook! Run with --expose-gc for more accurate memory measurements.")
	}

	const initialMemory = process.memoryUsage()

	for (let i = 0; i < iterations; i++) {
		fn(input)
	}

	const finalMemory = process.memoryUsage()

	return {
		heapUsed: (finalMemory.heapUsed - initialMemory.heapUsed) / iterations,
		heapTotal: (finalMemory.heapTotal - initialMemory.heapTotal) / iterations,
	}
}

const testCases = [
	{
		name: "Simple text message",
		input: "This is a simple text message without any tool uses.",
	},
	{
		name: "Message with a simple tool use",
		input: 'Let\'s read a file: <function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter></invoke></function_calls>',
	},
	{
		name: "Message with a complex tool use (write_to_file)",
		input: '<function_calls><invoke name="write_to_file"><parameter name="path">src/file.ts</parameter><parameter name="content">\nfunction example() {\n  // This has XML-like content: </parameter>\n  return true;\n}\n</parameter><parameter name="line_count">5</parameter></invoke></function_calls>',
	},
	{
		name: "Message with multiple tool uses",
		input: 'First file: <function_calls><invoke name="read_file"><parameter name="path">src/file1.ts</parameter></invoke></function_calls>\nSecond file: <function_calls><invoke name="read_file"><parameter name="path">src/file2.ts</parameter></invoke></function_calls>\nLet\'s write a new file: <function_calls><invoke name="write_to_file"><parameter name="path">src/file3.ts</parameter><parameter name="content">\nexport function newFunction() {\n  return \'Hello world\';\n}\n</parameter><parameter name="line_count">3</parameter></invoke></function_calls>',
	},
	{
		name: "Large message with repeated tool uses",
		input: Array(50)
			.fill(
				'<function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter></invoke></function_calls>\n<function_calls><invoke name="write_to_file"><parameter name="path">output.ts</parameter><parameter name="content">console.log("hello");</parameter><parameter name="line_count">1</parameter></invoke></function_calls>',
			)
			.join("\n"),
	},
]

const runBenchmark = () => {
	const maxNameLength = testCases.reduce((max, testCase) => Math.max(max, testCase.name.length), 0)
	const namePadding = maxNameLength + 2

	console.log(
		`| ${"Test Case".padEnd(namePadding)} | V1 Time (ms) | V2 Time (ms) | V1/V2 Ratio | V1 Heap (bytes) | V2 Heap (bytes) |`,
	)
	console.log(
		`| ${"-".repeat(namePadding)} | ------------ | ------------ | ----------- | ---------------- | ---------------- |`,
	)

	for (const testCase of testCases) {
		const v1Time = measureExecutionTime(parseAssistantMessageV1, testCase.input)
		const v2Time = measureExecutionTime(parseAssistantMessageV2, testCase.input)
		const timeRatio = v1Time / v2Time

		const v1Memory = measureMemoryUsage(parseAssistantMessageV1, testCase.input)
		const v2Memory = measureMemoryUsage(parseAssistantMessageV2, testCase.input)

		console.log(
			`| ${testCase.name.padEnd(namePadding)} | ` +
				`${v1Time.toFixed(4).padStart(12)} | ` +
				`${v2Time.toFixed(4).padStart(12)} | ` +
				`${timeRatio.toFixed(2).padStart(11)} | ` +
				`${formatNumber(Math.round(v1Memory.heapUsed)).padStart(16)} | ` +
				`${formatNumber(Math.round(v2Memory.heapUsed)).padStart(16)} |`,
		)
	}
}

runBenchmark()
