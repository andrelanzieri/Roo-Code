import { describe, it, expect } from "vitest"
import { buildTaskHierarchy, flattenTaskHierarchy } from "../useTaskHierarchy"
import type { HistoryItem } from "@roo-code/types"

describe("useTaskHierarchy", () => {
	describe("buildTaskHierarchy", () => {
		it("should build a hierarchical structure from flat tasks", () => {
			const tasks: HistoryItem[] = [
				{
					id: "task1",
					number: 1,
					ts: 1000,
					task: "Parent Task 1",
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
				},
				{
					id: "task2",
					number: 2,
					ts: 2000,
					task: "Child Task 1",
					tokensIn: 50,
					tokensOut: 100,
					totalCost: 0.005,
					parentId: "task1",
				},
				{
					id: "task3",
					number: 3,
					ts: 3000,
					task: "Parent Task 2",
					tokensIn: 150,
					tokensOut: 250,
					totalCost: 0.015,
				},
				{
					id: "task4",
					number: 4,
					ts: 4000,
					task: "Child Task 2",
					tokensIn: 75,
					tokensOut: 125,
					totalCost: 0.007,
					parentId: "task1",
				},
			]

			const hierarchy = buildTaskHierarchy(tasks)

			// Should have 2 root tasks
			expect(hierarchy).toHaveLength(2)

			// First root task should be task3 (newer timestamp)
			expect(hierarchy[0].id).toBe("task3")
			expect(hierarchy[0].children).toHaveLength(0)
			expect(hierarchy[0].level).toBe(0)

			// Second root task should be task1 (older timestamp)
			expect(hierarchy[1].id).toBe("task1")
			expect(hierarchy[1].children).toHaveLength(2)
			expect(hierarchy[1].level).toBe(0)

			// Children of task1 should be sorted by timestamp (newest first)
			expect(hierarchy[1].children[0].id).toBe("task4")
			expect(hierarchy[1].children[0].level).toBe(1)
			expect(hierarchy[1].children[1].id).toBe("task2")
			expect(hierarchy[1].children[1].level).toBe(1)
		})

		it("should handle tasks with no parent-child relationships", () => {
			const tasks: HistoryItem[] = [
				{
					id: "task1",
					number: 1,
					ts: 1000,
					task: "Task 1",
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
				},
				{
					id: "task2",
					number: 2,
					ts: 2000,
					task: "Task 2",
					tokensIn: 50,
					tokensOut: 100,
					totalCost: 0.005,
				},
			]

			const hierarchy = buildTaskHierarchy(tasks)

			expect(hierarchy).toHaveLength(2)
			expect(hierarchy[0].id).toBe("task2") // Newer first
			expect(hierarchy[1].id).toBe("task1")
			expect(hierarchy[0].children).toHaveLength(0)
			expect(hierarchy[1].children).toHaveLength(0)
		})

		it("should handle nested hierarchies", () => {
			const tasks: HistoryItem[] = [
				{
					id: "task1",
					number: 1,
					ts: 1000,
					task: "Root Task",
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
				},
				{
					id: "task2",
					number: 2,
					ts: 2000,
					task: "Child Task",
					tokensIn: 50,
					tokensOut: 100,
					totalCost: 0.005,
					parentId: "task1",
				},
				{
					id: "task3",
					number: 3,
					ts: 3000,
					task: "Grandchild Task",
					tokensIn: 25,
					tokensOut: 50,
					totalCost: 0.002,
					parentId: "task2",
				},
			]

			const hierarchy = buildTaskHierarchy(tasks)

			expect(hierarchy).toHaveLength(1)
			expect(hierarchy[0].id).toBe("task1")
			expect(hierarchy[0].children).toHaveLength(1)
			expect(hierarchy[0].children[0].id).toBe("task2")
			expect(hierarchy[0].children[0].level).toBe(1)
			expect(hierarchy[0].children[0].children).toHaveLength(1)
			expect(hierarchy[0].children[0].children[0].id).toBe("task3")
			expect(hierarchy[0].children[0].children[0].level).toBe(2)
		})
	})

	describe("flattenTaskHierarchy", () => {
		it("should flatten hierarchical tasks with all expanded", () => {
			const tasks: HistoryItem[] = [
				{
					id: "task1",
					number: 1,
					ts: 1000,
					task: "Parent Task",
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
				},
				{
					id: "task2",
					number: 2,
					ts: 2000,
					task: "Child Task",
					tokensIn: 50,
					tokensOut: 100,
					totalCost: 0.005,
					parentId: "task1",
				},
			]

			const hierarchy = buildTaskHierarchy(tasks)
			const expandedIds = new Set(["task1"])
			const flattened = flattenTaskHierarchy(hierarchy, expandedIds)

			expect(flattened).toHaveLength(2)
			expect(flattened[0].id).toBe("task1")
			expect(flattened[1].id).toBe("task2")
		})

		it("should hide children when parent is collapsed", () => {
			const tasks: HistoryItem[] = [
				{
					id: "task1",
					number: 1,
					ts: 1000,
					task: "Parent Task",
					tokensIn: 100,
					tokensOut: 200,
					totalCost: 0.01,
				},
				{
					id: "task2",
					number: 2,
					ts: 2000,
					task: "Child Task",
					tokensIn: 50,
					tokensOut: 100,
					totalCost: 0.005,
					parentId: "task1",
				},
			]

			const hierarchy = buildTaskHierarchy(tasks)
			// When expandedIds is empty (size === 0), all items are expanded by default
			// To test collapsed state, we need to pass a non-empty set that doesn't include task1
			const expandedIds = new Set<string>(["some-other-id"]) // Non-empty set without task1
			const flattened = flattenTaskHierarchy(hierarchy, expandedIds)

			expect(flattened).toHaveLength(1)
			expect(flattened[0].id).toBe("task1")
		})
	})
})
