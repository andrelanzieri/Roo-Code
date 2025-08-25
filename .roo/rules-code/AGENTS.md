# Code Mode Rules

## JSON File Operations

- **MANDATORY**: Use `safeWriteJson()` from `src/utils/safeWriteJson.ts` for ALL JSON writes
- Never use `JSON.stringify` with direct file writes - always use `safeWriteJson`
- `safeWriteJson` handles directory creation, atomic writes, and locking automatically

## Provider Implementation

- All new providers MUST implement the Provider interface from `packages/types/src/`
- Provider implementations go in `src/api/providers/`
- Each provider needs proper error handling and retry mechanisms

## UI Component Guidelines

- Use Tailwind CSS classes exclusively - no inline styles
- VSCode CSS variables must be added to `webview-ui/src/index.css` before use
- React components use functional components with hooks
- State management via React hooks, not external state libraries

## Testing Requirements

- All new features require test coverage
- Tests use vitest framework (vi, describe, test, it are global)
- Run tests from workspace directory: `cd src && npx vitest run`
- Never run tests from project root

## IPC Communication

- Use packages/ipc for webview ↔ extension communication
- Messages must be typed using interfaces from packages/types
- Handle all async operations with proper error boundaries

## File Restrictions

- Code mode can edit all file types
- Always verify file exists before operations
- Use proper file locking for concurrent access safety
