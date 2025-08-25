# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Critical Non-Obvious Patterns

- **JSON Writes**: MUST use `safeWriteJson()` from `src/utils/safeWriteJson.ts` for ALL JSON writes (atomic writes with locking, handles streaming)
- **Test Execution**: Tests MUST run from workspace directory: `cd src && npx vitest run` or `cd webview-ui && npx vitest run` (NOT from root)
- **Import Extensions**: Use `.js` extensions in packages/ imports despite TypeScript source files
- **Bootstrap**: `pnpm install` auto-bootstraps via `scripts/bootstrap.mjs` if pnpm not found
- **Webview DevTools**: Access via Command Palette → "Developer: Open Webview Developer Tools" (not F12)
- **VSCode CSS Variables**: Must be added to `webview-ui/src/index.css` before use in components
- **React Hooks Required**: External state libraries break webview isolation - use React hooks only
- **noUncheckedIndexedAccess**: TypeScript strict mode with this enabled - array/object access may return undefined

## Architecture Gotchas

- `src/` contains VSCode extension backend (not generic source)
- `webview-ui/` is React frontend in VSCode webview (restricted APIs, no localStorage)
- IPC messages between extension/webview must use typed interfaces from `packages/types`
- Provider implementations must be stateless (hidden caching layer assumes this)
