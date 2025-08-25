# Debug Mode Rules

## Non-Obvious Debug Access

- Webview DevTools: Command Palette → "Developer: Open Webview Developer Tools" (NOT F12)
- Extension logs: VSCode Output panel → "Roo Code" channel
- Extension Host output channel shows different logs than Debug Console

## Critical Debug Patterns

- IPC messages fail silently without try/catch in `packages/ipc/src/`
- Tests MUST run from workspace directory: `cd src && npx vitest run`
- Webview runs in restricted context (no localStorage, limited browser APIs)
