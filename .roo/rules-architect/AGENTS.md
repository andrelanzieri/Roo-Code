# Architect Mode Rules

## Design Principles

- **VSCode Extension Architecture**: Work within VSCode's webview + extension host model
- **Monorepo Organization**: Maintain clear separation between packages
- **Provider Pattern**: New AI providers must follow existing interface patterns
- **State Management**: React hooks for UI, VSCode context for extension state

## Package Structure Requirements

- New packages go in `packages/` directory
- Must include proper TypeScript configuration extending base
- Shared types belong in `packages/types/src/`
- Follow existing naming conventions (e.g., @roo-code/package-name)

## API Design

- All providers implement Provider interface from packages/types
- IPC messages must be strongly typed
- Backwards compatibility required for existing provider contracts
- Error handling must include proper error types and recovery

## Performance Considerations

- Large JSON operations must use streaming (see safeWriteJson)
- Webview content should lazy-load heavy components
- Code indexing happens asynchronously in background
- Terminal operations should not block UI

## Evals Database & Migrations

- Evals database schemas in `packages/evals/src/db/`
- Migrations required for schema changes
- Use proper transaction handling for data consistency

## Security Patterns

- Never expose sensitive data in webview
- API keys stored in VSCode SecretStorage
- File operations must validate paths
- Command execution requires user approval
