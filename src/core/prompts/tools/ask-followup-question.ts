export function getAskFollowupQuestionDescription(): string {
	return `## ask_followup_question
Description: Ask the user a question to gather additional information needed to complete the task. Use when you need clarification or more details to proceed effectively.

Parameters:
- question: (required) A clear, specific question addressing the information needed
- follow_up: (required) A list of 2-4 suggested answers, each in its own <suggest> tag. Suggestions must be complete, actionable answers without placeholders. Optionally include mode attribute to switch modes (code/architect/etc.)

Usage:
<function_calls>
<invoke name="ask_followup_question">
<parameter name="question">Your question here</parameter>
<parameter name="follow_up">
<suggest>First suggestion</suggest>
<suggest mode="code">Action with mode switch</suggest>
</parameter>
</invoke>
</function_calls>

Example:
<function_calls>
<invoke name="ask_followup_question">
<parameter name="question">What is the path to the frontend-config.json file?</parameter>
<parameter name="follow_up">
<suggest>./src/frontend-config.json</suggest>
<suggest>./config/frontend-config.json</suggest>
<suggest>./frontend-config.json</suggest>
</parameter>
</invoke>
</function_calls>`
}
