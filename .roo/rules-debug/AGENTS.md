# Debug Mode Rules

## Debugging Entry Points

- VSCode Debug Console shows extension logs via `outputChannel`
- Webview DevTools accessible via Command Palette → "Developer: Open Webview Developer Tools"
- Extension host debugging: Press F5 to launch new VSCode window with extension loaded

## Common Debug Patterns

- Provider issues: Check `src/api/providers/__tests__/` for test patterns
- IPC communication: Review `packages/ipc/src/` for message flow
- Webview state issues: Check React DevTools in webview developer tools
- Extension activation: Review `src/extension.ts` and `src/activate/`

## Log Locations

- Extension logs: VSCode Output panel → "Roo Code"
- Terminal command logs: Check TerminalRegistry in `src/integrations/terminal/`
- MCP server logs: Check McpServerManager output
- Cloud service logs: Check CloudService initialization in extension.ts

## Testing Debug Workflow

1. Add console.log or debugger statements
2. Run tests with: `cd src && npx vitest run --reporter=verbose`
3. For UI tests: `cd webview-ui && npx vitest run --reporter=verbose`
4. Use VSCode's built-in debugger for stepping through code

## Performance Debugging

- Memory issues: Check for proper cleanup in `deactivate()` function
- Slow operations: Profile with Chrome DevTools for webview
- Extension performance: Use VSCode's Extension Host profiler

## Error Handling

- All async operations should have try-catch blocks
- Errors should be logged to outputChannel
- Critical errors should provide user-friendly messages via vscode.window.showErrorMessage
