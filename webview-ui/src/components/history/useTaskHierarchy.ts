import { useMemo } from "react"
import type { HistoryItem } from "@roo-code/types"

export interface HierarchicalHistoryItem extends HistoryItem {
	children: HierarchicalHistoryItem[]
	level: number
	isExpanded?: boolean
	highlight?: string
}

/**
 * Build a hierarchical tree structure from flat task history
 */
export function buildTaskHierarchy(tasks: HistoryItem[]): HierarchicalHistoryItem[] {
	const taskMap = new Map<string, HierarchicalHistoryItem>()
	const rootTasks: HierarchicalHistoryItem[] = []

	// First pass: Create hierarchical items for all tasks
	tasks.forEach((task) => {
		const hierarchicalTask: HierarchicalHistoryItem = {
			...task,
			children: [],
			level: 0,
			isExpanded: true, // Default to expanded
		}
		taskMap.set(task.id, hierarchicalTask)
	})

	// Second pass: Build the tree structure
	tasks.forEach((task) => {
		const hierarchicalTask = taskMap.get(task.id)!

		if (task.parentId && taskMap.has(task.parentId)) {
			// This is a child task
			const parent = taskMap.get(task.parentId)!
			parent.children.push(hierarchicalTask)
			hierarchicalTask.level = parent.level + 1
		} else {
			// This is a root task
			rootTasks.push(hierarchicalTask)
		}
	})

	// Sort tasks by timestamp (newest first) at each level
	const sortByTimestamp = (a: HierarchicalHistoryItem, b: HierarchicalHistoryItem) => b.ts - a.ts

	const sortRecursively = (items: HierarchicalHistoryItem[]) => {
		items.sort(sortByTimestamp)
		items.forEach((item) => {
			if (item.children.length > 0) {
				sortRecursively(item.children)
			}
		})
	}

	sortRecursively(rootTasks)

	return rootTasks
}

/**
 * Flatten a hierarchical task structure for display
 */
export function flattenTaskHierarchy(
	tasks: HierarchicalHistoryItem[],
	expandedIds: Set<string> = new Set(),
): HierarchicalHistoryItem[] {
	const result: HierarchicalHistoryItem[] = []

	const traverse = (items: HierarchicalHistoryItem[]) => {
		items.forEach((item) => {
			result.push(item)

			// Only include children if the parent is expanded
			// Default to expanded (true) unless explicitly collapsed (not in expandedIds when expandedIds is being used)
			const isExpanded = expandedIds.size === 0 ? true : expandedIds.has(item.id)
			if (item.children.length > 0 && isExpanded) {
				traverse(item.children)
			}
		})
	}

	traverse(tasks)
	return result
}

/**
 * Custom hook to manage task hierarchy state
 */
export function useTaskHierarchy(tasks: HistoryItem[]) {
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

	const hierarchicalTasks = useMemo(() => {
		return buildTaskHierarchy(tasks)
	}, [tasks])

	const flattenedTasks = useMemo(() => {
		return flattenTaskHierarchy(hierarchicalTasks, expandedIds)
	}, [hierarchicalTasks, expandedIds])

	const toggleExpanded = (taskId: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev)
			if (next.has(taskId)) {
				next.delete(taskId)
			} else {
				next.add(taskId)
			}
			return next
		})
	}

	const expandAll = () => {
		const allIds = new Set<string>()
		const collectIds = (items: HierarchicalHistoryItem[]) => {
			items.forEach((item) => {
				if (item.children.length > 0) {
					allIds.add(item.id)
					collectIds(item.children)
				}
			})
		}
		collectIds(hierarchicalTasks)
		setExpandedIds(allIds)
	}

	const collapseAll = () => {
		setExpandedIds(new Set())
	}

	return {
		hierarchicalTasks,
		flattenedTasks,
		expandedIds,
		toggleExpanded,
		expandAll,
		collapseAll,
	}
}

// Import useState
import { useState } from "react"
