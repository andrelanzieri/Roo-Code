import { ToolArgs } from "./types"

/**
 * Prompt when todos are NOT required (default)
 */
const PROMPT_WITHOUT_TODOS = `## new_task
Description: This will let you create a new task instance in the chosen mode using your provided message.

Parameters:
- mode: (required) The slug of the mode to start the new task in (e.g., "code", "debug", "architect").
- message: (required) The initial user message or instructions for this new task.

Usage:
<function_calls>
<invoke name="new_task">
<parameter name="mode">your-mode-slug-here</parameter>
<parameter name="message">Your initial instructions here</parameter>
</invoke>
</function_calls>

Example:
<function_calls>
<invoke name="new_task">
<parameter name="mode">code</parameter>
<parameter name="message">Implement a new feature for the application</parameter>
</invoke>
</function_calls>
`

/**
 * Prompt when todos ARE required
 */
const PROMPT_WITH_TODOS = `## new_task
Description: This will let you create a new task instance in the chosen mode using your provided message and initial todo list.

Parameters:
- mode: (required) The slug of the mode to start the new task in (e.g., "code", "debug", "architect").
- message: (required) The initial user message or instructions for this new task.
- todos: (required) The initial todo list in markdown checklist format for the new task.

Usage:
<function_calls>
<invoke name="new_task">
<parameter name="mode">your-mode-slug-here</parameter>
<parameter name="message">Your initial instructions here</parameter>
<parameter name="todos">
[ ] First task to complete
[ ] Second task to complete
[ ] Third task to complete
</parameter>
</invoke>
</function_calls>

Example:
<function_calls>
<invoke name="new_task">
<parameter name="mode">code</parameter>
<parameter name="message">Implement user authentication</parameter>
<parameter name="todos">
[ ] Set up auth middleware
[ ] Create login endpoint
[ ] Add session management
[ ] Write tests
</parameter>
</invoke>
</function_calls>

`

export function getNewTaskDescription(args: ToolArgs): string {
	const todosRequired = args.settings?.newTaskRequireTodos === true

	// Simply return the appropriate prompt based on the setting
	return todosRequired ? PROMPT_WITH_TODOS : PROMPT_WITHOUT_TODOS
}
