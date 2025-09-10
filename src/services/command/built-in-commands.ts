import { Command } from "./commands"

interface BuiltInCommandDefinition {
	name: string
	description: string
	argumentHint?: string
	content: string
}

const BUILT_IN_COMMANDS: Record<string, BuiltInCommandDefinition> = {
	init: {
		name: "init",
		description: "Analyze codebase and create concise AGENTS.md files for AI assistants",
		content: `<task>
Please analyze this codebase and create an AGENTS.md file containing:
1. Build/lint/test commands - especially for running a single test
2. Code style guidelines including imports, formatting, types, naming conventions, error handling, etc.
</task>

<initialization>
  <purpose>
    Create (or update) a concise AGENTS.md file that enables immediate productivity for AI assistants.
    Focus ONLY on project-specific, non-obvious information that you had to discover by reading files.
    
    CRITICAL: Only include information that is:
    - Non-obvious (couldn't be guessed from standard practices)
    - Project-specific (not generic to the framework/language)
    - Discovered by reading files (config files, code patterns, custom utilities)
    - Essential for avoiding mistakes or following project conventions
    
    Usage notes:
    - The file you create will be given to agentic coding agents (such as yourself) that operate in this repository
    - Keep the main AGENTS.md concise - aim for about 20 lines, but use more if the project complexity requires it
    - If there's already an AGENTS.md, improve it
    - If there are Claude Code rules (in CLAUDE.md), Cursor rules (in .cursor/rules/ or .cursorrules), or Copilot rules (in .github/copilot-instructions.md), make sure to include them
    - Be sure to prefix the file with: "# AGENTS.md\\n\\nThis file provides guidance to agents when working with code in this repository."
  </purpose>
  
  <todo_list_creation>
    If the update_todo_list tool is available, create a todo list with these focused analysis steps:
    
    1. Check for existing AGENTS.md files
       CRITICAL - Check these EXACT paths IN THE PROJECT ROOT:
       - AGENTS.md (in project root directory)
       - .roo/rules-code/AGENTS.md (relative to project root)
       - .roo/rules-debug/AGENTS.md (relative to project root)
       - .roo/rules-ask/AGENTS.md (relative to project root)
       - .roo/rules-architect/AGENTS.md (relative to project root)
       
       IMPORTANT: All paths are relative to the project/workspace root, NOT system root!
       
       If ANY of these exist:
       - Read them thoroughly
       - CRITICALLY EVALUATE: Remove ALL obvious information
       - DELETE entries that are standard practice or framework defaults
       - REMOVE anything that could be guessed without reading files
       - Only KEEP truly non-obvious, project-specific discoveries
       - Then add any new non-obvious patterns you discover
       
       Also check for other AI assistant rules:
       - .cursorrules, CLAUDE.md, .roorules
       - .cursor/rules/, .github/copilot-instructions.md
    
    2. Identify stack
       - Language, framework, build tools
       - Package manager and dependencies
    
    3. Extract commands
       - Build, test, lint, run
       - Critical directory-specific commands
    
    4. Map core architecture
       - Main components and flow
       - Key entry points
    
    5. Document critical patterns
       - Project-specific utilities (that you discovered by reading code)
       - Non-standard approaches (that differ from typical patterns)
       - Custom conventions (that aren't obvious from file structure)
    
    6. Extract code style
       - From config files only
       - Key conventions
    
    7. Testing specifics
       - Framework and run commands
       - Directory requirements
    
    8. Compile/Update AGENTS.md files
       - If files exist: AGGRESSIVELY clean them up
         * DELETE all obvious information (even if it was there before)
         * REMOVE standard practices, framework defaults, common patterns
         * STRIP OUT anything derivable from file structure or names
         * ONLY KEEP truly non-obvious discoveries
         * Then add newly discovered non-obvious patterns
         * Result should be SHORTER and MORE FOCUSED than before
       - If creating new: Follow the non-obvious-only principle
       - Create mode-specific files in .roo/rules-*/ directories (IN PROJECT ROOT)
       
    Note: If update_todo_list is not available, proceed with the analysis workflow directly without creating a todo list.
  </todo_list_creation>
</initialization>

<analysis_workflow>
  Follow the comprehensive analysis workflow to:
  
  1. **Discovery Phase**:
     CRITICAL - First check for existing AGENTS.md files at these EXACT locations IN PROJECT ROOT:
     - AGENTS.md (in project/workspace root)
     - .roo/rules-code/AGENTS.md (relative to project root)
     - .roo/rules-debug/AGENTS.md (relative to project root)
     - .roo/rules-ask/AGENTS.md (relative to project root)
     - .roo/rules-architect/AGENTS.md (relative to project root)
     
     IMPORTANT: The .roo folder should be created in the PROJECT ROOT, not system root!
     
     If found, perform CRITICAL analysis:
     - What information is OBVIOUS and must be DELETED?
     - What violates the non-obvious-only principle?
     - What would an experienced developer already know?
     - DELETE first, then consider what to add
     - The file should get SHORTER, not longer
     
     Also find other AI assistant rules and documentation
     
  2. **Project Identification**: Identify language, stack, and build system
  3. **Command Extraction**: Extract and verify essential commands
  4. **Architecture Mapping**: Create visual flow diagrams of core processes
  5. **Component Analysis**: Document key components and their interactions
  6. **Pattern Analysis**: Identify project-specific patterns and conventions
  7. **Code Style Extraction**: Extract formatting and naming conventions
  8. **Security & Performance**: Document critical patterns if relevant
  9. **Testing Discovery**: Understand testing setup and practices
  10. **Example Extraction**: Find real examples from the codebase
</analysis_workflow>

<output_structure>
  <main_file>
    Create or deeply improve AGENTS.md with ONLY non-obvious information:
    
    If AGENTS.md exists:
    - FIRST: Delete ALL obvious information
    - REMOVE: Standard commands, framework defaults, common patterns
    - STRIP: Anything that doesn't require file reading to know
    - EVALUATE: Each line - would an experienced dev be surprised?
    - If not surprised, DELETE IT
    - THEN: Add only truly non-obvious new discoveries
    - Goal: File should be SHORTER and MORE VALUABLE
    
    Content should include:
    - Header: "# AGENTS.md\\n\\nThis file provides guidance to agents when working with code in this repository."
    - Build/lint/test commands - ONLY if they differ from standard package.json scripts
    - Code style - ONLY project-specific rules not covered by linter configs
    - Custom utilities or patterns discovered by reading the code
    - Non-standard directory structures or file organizations
    - Project-specific conventions that violate typical practices
    - Critical gotchas that would cause errors if not followed
    
    EXCLUDE obvious information like:
    - Standard npm/yarn commands visible in package.json
    - Framework defaults (e.g., "React uses JSX")
    - Common patterns (e.g., "tests go in __tests__ folders")
    - Information derivable from file extensions or directory names
    
    Keep it concise (aim for ~20 lines, but expand as needed for complex projects).
    Include existing AI assistant rules from CLAUDE.md, Cursor rules (.cursor/rules/ or .cursorrules), or Copilot rules (.github/copilot-instructions.md).
  </main_file>
  
  <mode_specific_files>
    Create or deeply improve mode-specific AGENTS.md files IN THE PROJECT ROOT.
    
    CRITICAL: For each of these paths (RELATIVE TO PROJECT ROOT), check if the file exists FIRST:
    - .roo/rules-code/AGENTS.md (create .roo in project root, not system root!)
    - .roo/rules-debug/AGENTS.md (relative to project root)
    - .roo/rules-ask/AGENTS.md (relative to project root)
    - .roo/rules-architect/AGENTS.md (relative to project root)
    
    IMPORTANT: The .roo directory must be created in the current project/workspace root directory,
    NOT at the system root (/) or home directory. All paths are relative to where the project is located.
    
    If files exist:
    - AGGRESSIVELY DELETE obvious information
    - Remove EVERYTHING that's standard practice
    - Strip out framework defaults and common patterns
    - Each remaining line must be surprising/non-obvious
    - Only then add new non-obvious discoveries
    - Files should become SHORTER, not longer
    
    Example structure (ALL IN PROJECT ROOT):
    \`\`\`
    project-root/
    ├── AGENTS.md                    # General project guidance
    ├── .roo/                        # IN PROJECT ROOT, NOT SYSTEM ROOT!
    │   ├── rules-code/
    │   │   └── AGENTS.md           # Code mode specific instructions
    │   ├── rules-debug/
    │   │   └── AGENTS.md           # Debug mode specific instructions
    │   ├── rules-ask/
    │   │   └── AGENTS.md           # Ask mode specific instructions
    │   └── rules-architect/
    │       └── AGENTS.md           # Architect mode specific instructions
    ├── src/
    ├── package.json
    └── ... other project files
    \`\`\`
    
    .roo/rules-code/AGENTS.md - ONLY non-obvious coding rules discovered by reading files:
    - Custom utilities that replace standard approaches
    - Non-standard patterns unique to this project
    - Hidden dependencies or coupling between components
    - Required import orders or naming conventions not enforced by linters
    
    Example of non-obvious rules worth documenting:
    \`\`\`
    # Project Coding Rules (Non-Obvious Only)
    - Always use safeWriteJson() from src/utils/ instead of JSON.stringify for file writes (prevents corruption)
    - API retry mechanism in src/api/providers/utils/ is mandatory (not optional as it appears)
    - Database queries MUST use the query builder in packages/evals/src/db/queries/ (raw SQL will fail)
    - Provider interface in packages/types/src/ has undocumented required methods
    - Test files must be in same directory as source for vitest to work (not in separate test folder)
    \`\`\`
    
    .roo/rules-debug/AGENTS.md - ONLY non-obvious debugging discoveries:
    - Hidden log locations not mentioned in docs
    - Non-standard debugging tools or flags
    - Gotchas that cause silent failures
    - Required environment variables for debugging
    
    Example of non-obvious debug rules worth documenting:
    \`\`\`
    # Project Debug Rules (Non-Obvious Only)
    - Webview dev tools accessed via Command Palette > "Developer: Open Webview Developer Tools" (not F12)
    - IPC messages fail silently if not wrapped in try/catch in packages/ipc/src/
    - Production builds require NODE_ENV=production or certain features break without error
    - Database migrations must run from packages/evals/ directory, not root
    - Extension logs only visible in "Extension Host" output channel, not Debug Console
    \`\`\`
    
    .roo/rules-ask/AGENTS.md - ONLY non-obvious documentation context:
    - Hidden or misnamed documentation
    - Counterintuitive code organization
    - Misleading folder names or structures
    - Important context not evident from file structure
    
    Example of non-obvious documentation rules worth documenting:
    \`\`\`
    # Project Documentation Rules (Non-Obvious Only)
    - "src/" contains VSCode extension code, not source for web apps (counterintuitive)
    - Provider examples in src/api/providers/ are the canonical reference (docs are outdated)
    - UI runs in VSCode webview with restrictions (no localStorage, limited APIs)
    - Package.json scripts must be run from specific directories, not root
    - Locales in root are for extension, webview-ui/src/i18n for UI (two separate systems)
    \`\`\`
    
    .roo/rules-architect/AGENTS.md - ONLY non-obvious architectural constraints:
    - Hidden coupling between components
    - Undocumented architectural decisions
    - Non-standard patterns that must be followed
    - Performance bottlenecks discovered through investigation
    
    Example of non-obvious architecture rules worth documenting:
    \`\`\`
    # Project Architecture Rules (Non-Obvious Only)
    - Providers MUST be stateless - hidden caching layer assumes this
    - Webview and extension communicate through specific IPC channel patterns only
    - Database migrations cannot be rolled back - forward-only by design
    - React hooks required because external state libraries break webview isolation
    - Monorepo packages have circular dependency on types package (intentional)
    \`\`\`
  </mode_specific_files>
</output_structure>

<quality_criteria>
  - ONLY include non-obvious information discovered by reading files
  - Exclude anything that could be guessed from standard practices
  - Focus on gotchas, hidden requirements, and counterintuitive patterns
  - Include specific file paths when referencing custom utilities
  - Be extremely concise - if it's obvious, don't include it
  - Every line should prevent a potential mistake or confusion
  - Test: Would an experienced developer be surprised by this information?
  - If updating existing files: DELETE obvious info first, files should get SHORTER
  - Measure success: Is the file more concise and valuable than before?
</quality_criteria>

Remember: The goal is to create documentation that enables AI assistants to be immediately productive in this codebase, focusing on project-specific knowledge that isn't obvious from the code structure alone.`,
	},
	review: {
		name: "review",
		description: "Review implementation changes against original requirements before creating a pull request",
		argumentHint: "[context]",
		content: `<task>
Command 'review' (see below for command content) github comment: @roomote-agent fix this and make a PR
</task>

<command name="review">
Description: Review implementation changes against original requirements before creating a pull request

<workflow><!-- Meta workflow instructions. All actual tool calls below are wrapped in fenced code blocks for clarity. -->
<step number="1">
<name>Parse Command Arguments</name>
<instructions>
First, parse the command arguments to understand what context to review against:

The command format is: \`/review [context]\`

Where context can be:

- \`github issue [repo] #[number]\` - Review against a GitHub issue (e.g., \`github issue owner/repo #123\`)
- \`slack comment: [message]\` - Review against a Slack message/request
- \`github comment: [message]\` - Review against a GitHub issue/PR comment

Parse the input to determine:

1. The type of context (github issue, slack comment, github comment)
2. The specific reference (issue number or comment text)

If no argument is provided, report an error and request the context.
</instructions>
</step>

<step number="2">
<name>Initialize Review Process</name>
<instructions>
Create a todo list to track the review workflow:

	       <!-- TOOL CALL -->
	       \`\`\`
	       <update_todo_list>
	       <todos>
	       [ ] Parse and validate input context
	       [ ] Gather context information (issue/comment details)
	       [ ] Identify current git branch
	       [ ] Fetch latest main branch
	       [ ] Generate comprehensive diff against main
	       [ ] Read modified files for full context
	       [ ] Analyze implementation against requirements
	       [ ] Check code conventions and patterns
	       [ ] Identify security risks
	       [ ] Assess requirement clarity
	       [ ] Generate review report
	       [ ] Return findings to parent task
	       </todos>
	       </update_todo_list>
	       \`\`\`

	       This helps ensure a thorough review before creating a pull request.
	       </instructions>
	   </step>

	   <step number="3">
	       <name>Gather Context Information</name>
	       <instructions>
	       Based on the parsed input type, gather the necessary context:

	       **For GitHub Issue:**
	       <!-- TOOL CALL -->
	       \`\`\`
	       <execute_command>
	       <command>gh issue view [issue_number] --repo [repo] --json number,title,body,author,state,url,createdAt,updatedAt,comments</command>
	       </execute_command>
	       \`\`\`

	       Extract:
	       - Issue title and description
	       - All comments for additional context
	       - Acceptance criteria if specified
	       - Any clarifications or requirements mentioned

	       **For Slack Comment:**
	       - Use the provided message text directly as the requirement
	       - Note that this may be less detailed than a GitHub issue

	       **For GitHub Comment:**
	       - Use the provided comment text as the requirement
	       - Note the context (issue or PR) where this comment was made

	       Document the key requirements and acceptance criteria that the implementation should meet.

	       <!-- TOOL CALL -->
	       \`\`\`
	       <update_todo_list>
	       <todos>
	       [x] Parse and validate input context
	       [x] Gather context information (issue/comment details)
	       [ ] Identify current git branch
	       [ ] Fetch latest main branch
	       [ ] Generate comprehensive diff against main
	       [ ] Read modified files for full context
	       [ ] Analyze implementation against requirements
	       [ ] Check code conventions and patterns
	       [ ] Identify security risks
	       [ ] Assess requirement clarity
	       [ ] Generate review report
	       [ ] Return findings to parent task
	       </todos>
	       </update_todo_list>
	       \`\`\`
	       </instructions>
	   </step>

	   <step number="4">
	       <name>Identify Current Git Branch</name>
	       <instructions>
	       Determine which branch contains the implementation to review:

	       <!-- TOOL CALL -->
	       \`\`\`
	       <execute_command>
	       <command>git branch --show-current</command>
	       </execute_command>
	       \`\`\`

	       Store this branch name for reference in the review report.

	       <!-- TOOL CALL -->
	       \`\`\`
	       <update_todo_list>
	       <todos>
	       [x] Parse and validate input context
	       [x] Gather context information (issue/comment details)
	       [x] Identify current git branch
	       [ ] Fetch latest main branch
	       [ ] Generate comprehensive diff against main
	       [ ] Read modified files for full context
	       [ ] Analyze implementation against requirements
	       [ ] Check code conventions and patterns
	       [ ] Identify security risks
	       [ ] Assess requirement clarity
	       [ ] Generate review report
	       [ ] Return findings to parent task
	       </todos>
	       </update_todo_list>
	       \`\`\`
	       </instructions>
	   </step>

	   <step number="5">
	       <name>Fetch Latest Main Branch</name>
	       <instructions>
	       Ensure you're comparing against the most recent main branch:

	       <!-- TOOL CALL -->
	       \`\`\`
	       <execute_command>
	       <command>git fetch origin main</command>
	       </execute_command>
	       \`\`\`

	       This ensures your review compares against the current state of the main branch.

	       <!-- TOOL CALL -->
	       \`\`\`
	       <update_todo_list>
	       <todos>
	       [x] Parse and validate input context
	       [x] Gather context information (issue/comment details)
	       [x] Identify current git branch
	       [x] Fetch latest main branch
	       [ ] Generate comprehensive diff against main
	       [ ] Read modified files for full context
	       [ ] Analyze implementation against requirements
	       [ ] Check code conventions and patterns
	       [ ] Identify security risks
	       [ ] Assess requirement clarity
	       [ ] Generate review report
	       [ ] Return findings to parent task
	       </todos>
	       </update_todo_list>
	       \`\`\`
	       </instructions>
	   </step>

	   <step number="6">
	       <name>Generate Comprehensive Diff</name>
	       <instructions>
	       Generate a complete diff of all changes on the current branch against main:

	       <!-- TOOL CALL -->
	       \`\`\`
	       <execute_command>
	       <command>git diff origin/main...HEAD</command>
	       </execute_command>
	       \`\`\`

	       Analyze the diff to understand:
	       - All files added, modified, or deleted
	       - The specific changes within each file
	       - The scope and size of the changes

	       <!-- TOOL CALL -->
	       \`\`\`
	       <update_todo_list>
	       <todos>
	       [x] Parse and validate input context
	       [x] Gather context information (issue/comment details)
	       [x] Identify current git branch
	       [x] Fetch latest main branch
	       [x] Generate comprehensive diff against main
	       [ ] Read modified files for full context
	       [ ] Analyze implementation against requirements
	       [ ] Check code conventions and patterns
	       [ ] Identify security risks
	       [ ] Assess requirement clarity
	       [ ] Generate review report
	       [ ] Return findings to parent task
	       </todos>
	       </update_todo_list>
	       \`\`\`
	       </instructions>
	   </step>

	   <step number="7">
	       <name>Read Modified Files for Full Context</name>
	       <instructions>
	       For each file that was modified (not just the diff), read the entire file to understand:
	       - The overall structure and patterns used in the codebase
	       - How the changes fit within the existing code
	       - Whether the changes follow established conventions

	       Use the read_file tool to examine key modified files, especially:
	       - Files with significant changes
	       - Files that implement core functionality
	       - Configuration or security-related files

	       This full context is essential for evaluating code conventions and patterns.

	       <!-- TOOL CALL -->
	       \`\`\`
	       <update_todo_list>
	       <todos>
	       [x] Parse and validate input context
	       [x] Gather context information (issue/comment details)
	       [x] Identify current git branch
	       [x] Fetch latest main branch
	       [x] Generate comprehensive diff against main
	       [x] Read modified files for full context
	       [ ] Analyze implementation against requirements
	       [ ] Check code conventions and patterns
	       [ ] Identify security risks
	       [ ] Assess requirement clarity
	       [ ] Generate review report
	       [ ] Return findings to parent task
	       </todos>
	       </update_todo_list>
	       \`\`\`
	       </instructions>
	   </step>

	   <step number="8">
	       <name>Analyze Implementation Against Requirements</name>
	       <instructions>
	       Perform a detailed analysis to determine if the implementation properly addresses the requirements:

	       **Assessment Criteria:**

	       1. **Requirement Coverage (CRITICAL):**
	          - Does the implementation fully address the stated requirements?
	          - Are all acceptance criteria met?
	          - Are there any missing features or functionality?
	          - Score: PASS / PARTIAL / FAIL

	       2. **Code Quality & Conventions (IMPORTANT):**
	          - Does the code follow project patterns and conventions?
	          - Is the code readable and maintainable?
	          - Are there appropriate comments and documentation?
	          - Is the solution appropriately abstracted?
	          - Score: GOOD / ACCEPTABLE / POOR

	       3. **Security Considerations (CRITICAL):**
	          - Are there any obvious security vulnerabilities?
	          - Is input validation properly implemented?
	          - Are sensitive data and credentials handled securely?
	          - Are there any injection risks (SQL, XSS, etc.)?
	          - Score: SECURE / CONCERNS / VULNERABLE

	       4. **Requirement Clarity (INFORMATIONAL):**
	          - Was the original requirement clear and detailed?
	          - Did it provide enough context to implement correctly?
	          - Were there ambiguities that led to assumptions?
	          - Score: CLEAR / ADEQUATE / VAGUE

	       Document specific findings for each criterion with examples from the code.

	       <!-- TOOL CALL -->
	       \`\`\`
	       <update_todo_list>
	       <todos>
	       [x] Parse and validate input context
	       [x] Gather context information (issue/comment details)
	       [x] Identify current git branch
	       [x] Fetch latest main branch
	       [x] Generate comprehensive diff against main
	       [x] Read modified files for full context
	       [x] Analyze implementation against requirements
	       [x] Check code conventions and patterns
	       [x] Identify security risks
	       [x] Assess requirement clarity
	       [ ] Generate review report
	       [ ] Return findings to parent task
	       </todos>
	       </update_todo_list>
	       \`\`\`
	       </instructions>
	   </step>

	   <step number="9">
	       <name>Generate Review Report</name>
	       <instructions>
	       Compile all findings into a comprehensive review report:

	       **REVIEW REPORT**

	       **Context:**
	       - Review Type: [GitHub Issue / Slack Comment / GitHub Comment]
	       - Reference: [Repo Issue #XXX / Comment text]
	       - Branch: [branch name]
	       - Files Changed: [count]
	       - Lines Added/Removed: [+XXX / -XXX]

	       **Requirements Analysis:**
	       - Original Request: [Brief summary]
	       - Requirement Clarity: [CLEAR / ADEQUATE / VAGUE]
	       - Coverage Assessment: [PASS / PARTIAL / FAIL]
	       - Details: [Specific findings]

	       **Code Quality Assessment:**
	       - Convention Adherence: [GOOD / ACCEPTABLE / POOR]
	       - Specific Issues:
	         * [Issue 1 with file:line reference]
	         * [Issue 2 with file:line reference]

	       **Security Assessment:**
	       - Overall Status: [SECURE / CONCERNS / VULNERABLE]
	       - Findings:
	         * [Any security issues found]

	       **Confidence Score:**
	       Calculate an overall confidence score based on:
	       - High Confidence (90-100%): All criteria PASS/GOOD/SECURE, clear requirements
	       - Medium Confidence (70-89%): Minor issues, mostly acceptable
	       - Low Confidence (Below 70%): Critical issues or multiple problems

	       **Recommendation:**
	       Based on the confidence score:
	       - **PROCEED**: Implementation is sound, ready for PR (High confidence)
	       - **REVIEW**: Minor fixes needed before PR (Medium confidence)
	       - **REVISE**: Significant issues need addressing (Low confidence)

	       **Specific Actions Required:**
	       1. [Action item 1]
	       2. [Action item 2]
	       3. [Action item 3]

	       <!-- TOOL CALL -->
	       \`\`\`
	       <update_todo_list>
	       <todos>
	       [x] Parse and validate input context
	       [x] Gather context information (issue/comment details)
	       [x] Identify current git branch
	       [x] Fetch latest main branch
	       [x] Generate comprehensive diff against main
	       [x] Read modified files for full context
	       [x] Analyze implementation against requirements
	       [x] Check code conventions and patterns
	       [x] Identify security risks
	       [x] Assess requirement clarity
	       [x] Generate review report
	       [ ] Return findings to parent task
	       </todos>
	       </update_todo_list>
	       \`\`\`
	       </instructions>
	   </step>

	   <step number="10">
	       <name>Return Findings to Parent Task</name>
	       <instructions>
	       Use attempt_completion to return the full review report to the parent task:

	       <!-- TOOL CALL -->
	       \`\`\`
	       <attempt_completion>
	       <result>
	       [Insert the complete review report from Step 9]

	       This review has been completed as a subtask. The parent task should use this information to determine whether to:
	       1. Proceed with PR creation (if confidence is high)
	       2. Make necessary fixes before creating PR (if issues were found)
	       3. Seek clarification on requirements (if requirements were vague)
	       </result>
	       </attempt_completion>
	       \`\`\`

	       The parent task will receive this factual report and can make informed decisions about next steps.

	       <!-- TOOL CALL -->
	       \`\`\`
	       <update_todo_list>
	       <todos>
	       [x] Parse and validate input context
	       [x] Gather context information (issue/comment details)
	       [x] Identify current git branch
	       [x] Fetch latest main branch
	       [x] Generate comprehensive diff against main
	       [x] Read modified files for full context
	       [x] Analyze implementation against requirements
	       [x] Check code conventions and patterns
	       [x] Identify security risks
	       [x] Assess requirement clarity
	       [x] Generate review report
	       [x] Return findings to parent task
	       </todos>
	       </update_todo_list>
	       \`\`\`
	       </instructions>
	   </step>

</workflow>

<best_practices><!-- Meta guidance; not tool calls -->
**Input Handling:**

- Always validate that an argument was provided
- Parse the argument type correctly (github issue, slack, github comment)
- Handle edge cases like malformed input gracefully

**Context Gathering:**

- For GitHub issues, fetch all relevant information including comments
- For text-based inputs, work with what's provided but note limitations
- Document when requirements are unclear or ambiguous

**Code Analysis:**

- Always read full files, not just diffs, to understand conventions
- Look for patterns in existing code to evaluate consistency
- Check for both functional correctness and code quality

**Security Review:**

- Check for common vulnerabilities (injection, XSS, exposed secrets)
- Verify input validation and sanitization
- Look for proper error handling that doesn't expose sensitive info

**Reporting:**

- Be factual and specific in findings
- Provide actionable feedback with file:line references
- Calculate confidence scores objectively based on criteria
- Always use attempt_completion to return findings to parent
	 </best_practices>

<common_mistakes_to_avoid><!-- Meta guidance; not tool calls -->
**Input Mistakes:**

- Not validating that an argument was provided
- Incorrectly parsing the input format
- Not handling different input types appropriately

**Analysis Mistakes:**

- Only looking at diffs without reading full files
- Missing security vulnerabilities
- Not checking if requirements are actually met
- Ignoring code convention violations

**Process Mistakes:**

- Not fetching latest main branch before comparison
- Forgetting to identify the current branch
- Not reading the actual files that were changed
- Making subjective judgments instead of factual assessments

**Reporting Mistakes:**

- Not using attempt_completion to return to parent task
- Providing vague feedback without specific examples
- Not calculating a clear confidence score
- Missing critical issues in the assessment
	 </common_mistakes_to_avoid>
</command>`,
	},
}

/**
 * Get all built-in commands as Command objects
 */
export async function getBuiltInCommands(): Promise<Command[]> {
	return Object.values(BUILT_IN_COMMANDS).map((cmd) => ({
		name: cmd.name,
		content: cmd.content,
		source: "built-in" as const,
		filePath: `<built-in:${cmd.name}>`,
		description: cmd.description,
		argumentHint: cmd.argumentHint,
	}))
}

/**
 * Get a specific built-in command by name
 */
export async function getBuiltInCommand(name: string): Promise<Command | undefined> {
	const cmd = BUILT_IN_COMMANDS[name]
	if (!cmd) return undefined

	return {
		name: cmd.name,
		content: cmd.content,
		source: "built-in" as const,
		filePath: `<built-in:${name}>`,
		description: cmd.description,
		argumentHint: cmd.argumentHint,
	}
}

/**
 * Get names of all built-in commands
 */
export async function getBuiltInCommandNames(): Promise<string[]> {
	return Object.keys(BUILT_IN_COMMANDS)
}
