# Architect Mode Rules

## Non-Obvious Architecture Constraints

- Providers MUST be stateless - hidden caching layer assumes this
- Webview and extension communicate through specific IPC channel patterns only
- React hooks required because external state libraries break webview isolation
- Large JSON operations must use `safeWriteJson()` for streaming (prevents memory issues)
- TypeScript `noUncheckedIndexedAccess: true` - array/object access may return undefined
- Import paths in packages/ require `.js` extensions despite TypeScript source
