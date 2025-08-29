import { ToolArgs } from "./types"

export function getMemorySearchDescription(args: ToolArgs): string {
	return `## memory_search
Description: Search for relevant memories from previous conversations. This tool helps maintain context across sessions by retrieving stored memories based on semantic similarity to your query.

Parameters:
- query: (required) The search query to find relevant memories. This should describe what you're looking for.
- project_context: (optional) The project or workspace context to filter memories. If not provided, searches across all memories.

Usage:
<memory_search>
<query>Your search query here</query>
<project_context>Optional project context</project_context>
</memory_search>

Examples:

1. Search for memories about a specific feature:
<memory_search>
<query>authentication implementation OAuth2</query>
</memory_search>

2. Search within a specific project context:
<memory_search>
<query>database schema design decisions</query>
<project_context>/home/user/projects/myapp</project_context>
</memory_search>

3. Search for architectural decisions:
<memory_search>
<query>architecture patterns microservices API design</query>
</memory_search>

The tool returns relevant memories with their content, summary, timestamp, and relevance score. Memories are automatically filtered by recency and importance.`
}
