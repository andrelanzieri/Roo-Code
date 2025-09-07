import MarkdownBlock from "../common/MarkdownBlock"

interface ReasoningBlockProps {
	content: string
}

/**
 * Render reasoning as simple italic text, matching how <thinking> content is shown.
 * No borders, boxes, headers, timers, or collapsible behavior.
 */
export const ReasoningBlock = ({ content }: ReasoningBlockProps) => {
	return (
		<div className="px-3 py-1">
			<div className="italic text-muted-foreground">
				<MarkdownBlock markdown={content} />
			</div>
		</div>
	)
}
