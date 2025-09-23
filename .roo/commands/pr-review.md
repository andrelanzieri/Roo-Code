    <!-- TOOL CALL -->
    ```
    <update_todo_list>
    <todos>
    [ ] Fetch pull request information
    [ ] Fetch associated issue (if any)
    [ ] Fetch pull request diff
    [ ] Fetch existing PR comments and reviews
    [ ] Check out pull request locally
    [ ] Verify existing comments against current code
    [ ] Review changes
    [ ] Present review to the user
    </todos>
    </update_todo_list>
    ```
    </instructions>

</step>

<step number="2">
    <name>Fetch Repository and Pull Request Information</name>
    <instructions>
    Get repo info:
    <!-- TOOL CALL -->
    ```
    <execute_command>
    <command>gh repo view --json owner,name</command>
    </execute_command>
    ```

    Fetch PR details:
    <!-- TOOL CALL -->
    ```
    <execute_command>
    <command>gh pr view [PR_NUMBER] --repo [owner]/[repo] --json number,title,body,author,state,url,headRefName,baseRefName,headRefOid,mergeable,isDraft,createdAt,updatedAt</command>
    </execute_command>
    ```

    <!-- TOOL CALL -->
    ```
    <update_todo_list>
    <todos>
    [x] Fetch pull request information
    [ ] Fetch associated issue (if any)
    [ ] Fetch pull request diff
    [ ] Fetch existing PR comments and reviews
    [ ] Check out pull request locally
    [ ] Verify existing comments against current code
    [ ] Review changes
    [ ] Present review to the user
    </todos>
    </update_todo_list>
    ```
    </instructions>

</step>

<step number="3">
    <name>Fetch Associated Issue (If Any)</name>
    <instructions>
    While reviewing check if the PR is within scope of the issue and it's actually an attempt at solving it.
    Check PR body for issue references (e.g., "Fixes #123"):
    <!-- TOOL CALL -->
    ```
    <execute_command>
    <command>gh issue view [issue_number] --repo [owner]/[repo] --json number,title,body,author,state,url,createdAt,updatedAt,comments</command>
    </execute_command>
    ```

    <!-- TOOL CALL -->
    ```
    <update_todo_list>
    <todos>
    [x] Fetch pull request information
    [x] Fetch associated issue (if any)
    [ ] Fetch pull request diff
    [ ] Fetch existing PR comments and reviews
    [ ] Check out pull request locally
    [ ] Verify existing comments against current code
    [ ] Review changes
    [ ] Present review to the user
    </todos>
    </update_todo_list>
    ```
    </instructions>

</step>

<step number="4">
    <name>Fetch Pull Request Diff</name>
    <instructions>
    Get changes:
    <!-- TOOL CALL -->
    ```
    <execute_command>
    <command>gh pr diff [PR_NUMBER] --repo [owner]/[repo]</command>
    </execute_command>
    ```

    <!-- TOOL CALL -->
    ```
    <update_todo_list>
    <todos>
    [x] Fetch pull request information
    [x] Fetch associated issue (if any)
    [x] Fetch pull request diff
    [ ] Fetch existing PR comments and reviews
    [ ] Check out pull request locally
    [ ] Verify existing comments against current code
    [ ] Review changes
    [ ] Present review to the user
    </todos>
    </update_todo_list>
    ```
    </instructions>

</step>

<step number="5">
    <name>Fetch Existing PR Comments and Reviews</name>
    <instructions>
    **CRITICAL:** Get existing feedback BEFORE reviewing:

    <!-- TOOL CALL -->
    ```
    <execute_command>
    <command>gh pr view [PR_NUMBER] --repo [owner]/[repo] --comments</command>
    </execute_command>
    ```

    <!-- TOOL CALL -->
    ```
    <execute_command>
    <command>gh api repos/[owner]/[repo]/pulls/[PR_NUMBER]/reviews</command>
    </execute_command>
    ```

    Note all existing issues, files/lines mentioned, and resolution status.

    <!-- TOOL CALL -->
    ```
    <update_todo_list>
    <todos>
    [x] Fetch pull request information
    [x] Fetch associated issue (if any)
    [x] Fetch pull request diff
    [x] Fetch existing PR comments and reviews
    [ ] Check out pull request locally
    [ ] Verify existing comments against current code
    [ ] Review changes
    [ ] Present review to the user
    </todos>
    </update_todo_list>
    ```
    </instructions>

</step>

<step number="6">
    <name>Check Out Pull Request Locally</name>
    <instructions>
    <!-- TOOL CALL -->
    ```
    <execute_command>
    <command>gh pr checkout [PR_NUMBER] --repo [owner]/[repo]</command>
    </execute_command>
    ```

    <!-- TOOL CALL -->
    ```
    <update_todo_list>
    <todos>
    [x] Fetch pull request information
    [x] Fetch associated issue (if any)
    [x] Fetch pull request diff
    [x] Fetch existing PR comments and reviews
    [x] Check out pull request locally
    [ ] Verify existing comments against current code
    [ ] Review changes
    [ ] Present review to the user
    </todos>
    </update_todo_list>
    ```
    </instructions>

</step>

<step number="7">
    <name>Verify Existing Comments Against Current Code</name>
    <instructions>
    For each existing comment:
    - Check if issue addressed in current code
    - Mark as resolved or pending
    - Examine the relevant code areas to verify fixes

    Track:
    - Resolved comments (DON'T repeat)
    - Still valid comments
    - New issues (main focus)

    <update_todo_list>
    <todos>
    [x] Fetch pull request information
    [x] Fetch associated issue (if any)
    [x] Fetch pull request diff
    [x] Fetch existing PR comments and reviews
    [x] Check out pull request locally
    [x] Verify existing comments against current code
    [ ] Review changes
    [ ] Present review to the user
    </todos>
    </update_todo_list>
    </instructions>

</step>

<step number="8">
    <name>Review Changes</name>
    <instructions>
    **Review methodology:**

    1. **Contract Consistency:**
       - Verify all referenced properties exist in their types/interfaces/classes
       - Check for invalid, missing, or renamed properties
       - Confirm changes don’t break inheritance, composition, or overrides
       - Look for contract violations across related entities

    2. **Reference and Usage Review:**
       - Trace references to changed functions, methods, or classes
       - Ensure usages remain compatible with changes
       - Watch for subtle breaking changes

    3. **Security review:**
       - Check for exposed sensitive data
       - Verify input validation
       - Look for injection vulnerabilities

    4. **Code quality checks:**
       - Identify code smells (long methods, complex logic, tight coupling)
       - Find duplicated code that should be refactored
       - Check for hardcoded English strings (should use i18n)
       - Verify test coverage for new/changed code

    5. **Performance considerations:**
       - Look for inefficient algorithms
       - Identify potential memory leaks

    **NEVER** run tests or execute code - only review.

    <!-- TOOL CALL -->
    ```
    <update_todo_list>
    <todos>
    [x] Fetch pull request information
    [x] Fetch associated issue (if any)
    [x] Fetch pull request diff
    [x] Fetch existing PR comments and reviews
    [x] Check out pull request locally
    [x] Verify existing comments against current code
    [x] Review changes
    [ ] Present review to the user
    </todos>
    </update_todo_list>
    ```
    </instructions>

</step>

<step number="9">
    <name>Present Review to the User</name>
    <instructions>
    <!-- TOOL CALL -->
    ```
    <ask_followup_question>
    <question>I've completed my review of PR #[number]. Here's what I found:

    [If applicable: **Existing comments resolved:**
    - Comment about X - now addressed]

    **Review Findings:**
    - Critical, important, and minor items are summarized above.

    Inline Comments (edit as needed):

    List all review comments below using fenced code blocks, one per comment, with the info string "inline_comment".
    Use these fields:
    - path
    - line
    - side (LEFT/RIGHT)
    - body

    Example format (replace with real comments):
    ```inline_comment
    path: src/services/marketplace/SimpleInstaller.ts
    line: 87
    side: RIGHT
    body: Installing a marketplace mode overwrites a local mode with the same slug. Consider blocking or prompting to avoid unintended data loss.
    ```

    What would you like to do with these findings?</question>
    <follow_up>
    <suggest mode="code">Switch to Code mode and fix the issues/suggestions</suggest>
    <suggest>Let me modify the suggestions first</suggest>
    </follow_up>
    </ask_followup_question>
    ```

    **If switching to Code mode:**
    <!-- TOOL CALL -->
    ```
    <update_todo_list>
    <todos>
    [x] Fetch pull request information
    [x] Fetch associated issue (if any)
    [x] Fetch pull request diff
    [x] Fetch existing PR comments and reviews
    [x] Check out pull request locally
    [x] Verify existing comments against current code
    [x] Review changes
    [x] Present review to the user
    [ ] Address critical issues
    [ ] Implement important suggestions
    [ ] Apply minor improvements (if time permits)
    [ ] Test changes
    [ ] Commit and push fixes
    </todos>
    </update_todo_list>
    ```

    <!-- TOOL CALL -->
    ```
    <switch_mode>
    <mode_slug>code</mode_slug>
    <reason>User requested to fix the issues and suggestions found during PR review</reason>
    </switch_mode>
    ```

    <!-- TOOL CALL -->
    ```
    <update_todo_list>
    <todos>
    [x] Fetch pull request information
    [x] Fetch associated issue (if any)
    [x] Fetch pull request diff
    [x] Fetch existing PR comments and reviews
    [x] Check out pull request locally
    [x] Verify existing comments against current code
    [x] Review changes
    [x] Present review to the user
    </todos>
    </update_todo_list>
    ```
    </instructions>

</step>
