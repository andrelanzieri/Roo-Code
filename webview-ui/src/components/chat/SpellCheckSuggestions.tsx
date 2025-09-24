import React, { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@src/lib/utils"
import { SpellCheckResult } from "@src/hooks/useSpellCheck"

interface SpellCheckSuggestionsProps {
	misspelling: SpellCheckResult | null
	position: { x: number; y: number } | null
	onSelect: (suggestion: string) => void
	onDismiss: () => void
	onIgnore?: () => void
	onAddToDictionary?: () => void
}

export const SpellCheckSuggestions: React.FC<SpellCheckSuggestionsProps> = ({
	misspelling,
	position,
	onSelect,
	onDismiss,
	onIgnore,
	onAddToDictionary,
}) => {
	const menuRef = useRef<HTMLDivElement>(null)
	const [selectedIndex, setSelectedIndex] = useState(0)

	// Reset selected index when misspelling changes
	useEffect(() => {
		setSelectedIndex(0)
	}, [misspelling])

	// Handle click outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onDismiss()
			}
		}

		if (misspelling && position) {
			document.addEventListener("mousedown", handleClickOutside)
			return () => {
				document.removeEventListener("mousedown", handleClickOutside)
			}
		}
	}, [misspelling, position, onDismiss])

	// Handle keyboard navigation
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (!misspelling) return

			const totalItems = misspelling.suggestions.length + (onIgnore ? 1 : 0) + (onAddToDictionary ? 1 : 0)

			switch (event.key) {
				case "ArrowUp":
					event.preventDefault()
					setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems)
					break
				case "ArrowDown":
					event.preventDefault()
					setSelectedIndex((prev) => (prev + 1) % totalItems)
					break
				case "Enter":
					event.preventDefault()
					if (selectedIndex < misspelling.suggestions.length) {
						onSelect(misspelling.suggestions[selectedIndex])
					} else if (selectedIndex === misspelling.suggestions.length && onIgnore) {
						onIgnore()
					} else if (onAddToDictionary) {
						onAddToDictionary()
					}
					break
				case "Escape":
					event.preventDefault()
					onDismiss()
					break
			}
		},
		[misspelling, selectedIndex, onSelect, onIgnore, onAddToDictionary, onDismiss],
	)

	useEffect(() => {
		if (misspelling && position) {
			document.addEventListener("keydown", handleKeyDown)
			return () => {
				document.removeEventListener("keydown", handleKeyDown)
			}
		}
	}, [misspelling, position, handleKeyDown])

	if (!misspelling || !position) {
		return null
	}

	const menuItems = [
		...misspelling.suggestions.map((suggestion, index) => ({
			label: suggestion,
			onClick: () => onSelect(suggestion),
			isSelected: selectedIndex === index,
			className: "font-medium",
		})),
	]

	if (onIgnore) {
		menuItems.push({
			label: "Ignore",
			onClick: onIgnore,
			isSelected: selectedIndex === misspelling.suggestions.length,
			className: "text-vscode-descriptionForeground",
		})
	}

	if (onAddToDictionary) {
		menuItems.push({
			label: "Add to dictionary",
			onClick: onAddToDictionary,
			isSelected: selectedIndex === misspelling.suggestions.length + (onIgnore ? 1 : 0),
			className: "text-vscode-descriptionForeground",
		})
	}

	return (
		<div
			ref={menuRef}
			className={cn(
				"absolute z-50",
				"min-w-[150px] max-w-[250px]",
				"bg-vscode-dropdown-background",
				"border border-vscode-dropdown-border",
				"rounded-md",
				"shadow-lg",
				"py-1",
				"animate-fade-in",
			)}
			style={{
				left: `${position.x}px`,
				top: `${position.y}px`,
			}}
			role="menu"
			aria-label="Spelling suggestions">
			{misspelling.suggestions.length === 0 ? (
				<div className="px-3 py-2 text-vscode-descriptionForeground text-sm">No suggestions available</div>
			) : (
				menuItems.map((item, index) => (
					<button
						key={index}
						className={cn(
							"w-full text-left px-3 py-1.5",
							"text-sm",
							"hover:bg-vscode-list-hoverBackground",
							"focus:bg-vscode-list-focusBackground",
							"focus:outline-none",
							"transition-colors",
							item.className,
							item.isSelected && "bg-vscode-list-activeSelectionBackground",
						)}
						onClick={item.onClick}
						onMouseEnter={() => setSelectedIndex(index)}
						role="menuitem">
						{item.label}
					</button>
				))
			)}
		</div>
	)
}
