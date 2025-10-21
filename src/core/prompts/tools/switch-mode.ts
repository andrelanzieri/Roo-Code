export function getSwitchModeDescription(): string {
	return `## switch_mode
Description: Request to switch to a different mode. This tool allows modes to request switching to another mode when needed, such as switching to Code mode to make code changes. The user must approve the mode switch.
Parameters:
- mode_slug: (required) The slug of the mode to switch to (e.g., "code", "ask", "architect")
- reason: (optional) The reason for switching modes
Usage:
<function_calls>
<invoke name="switch_mode">
<parameter name="mode_slug">Mode slug here</parameter>
<parameter name="reason">Reason for switching here</parameter>
</invoke>
</function_calls>

Example: Requesting to switch to code mode
<function_calls>
<invoke name="switch_mode">
<parameter name="mode_slug">code</parameter>
<parameter name="reason">Need to make code changes</parameter>
</invoke>
</function_calls>`
}
