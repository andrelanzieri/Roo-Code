# Code Mode Rules

## Critical Non-Obvious Patterns

- **MANDATORY**: Use `safeWriteJson()` from `src/utils/safeWriteJson.ts` for ALL JSON writes (prevents corruption via atomic writes with locking)
- Tests MUST run from workspace directory: `cd src && npx vitest run` (NOT from root)
- VSCode CSS variables must be added to `webview-ui/src/index.css` before use
- State management via React hooks only (external state libraries break webview isolation)
- Providers MUST be stateless (hidden caching layer assumes this)
- Import paths in packages/ require `.js` extensions despite TypeScript source
