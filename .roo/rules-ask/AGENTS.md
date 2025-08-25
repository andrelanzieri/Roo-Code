# Ask Mode Rules

## Documentation Sources

- Main documentation: README.md, CONTRIBUTING.md, CHANGELOG.md
- API docs: Check provider implementations in `src/api/providers/`
- UI patterns: Reference `webview-ui/src/components/` for React components
- Types: Refer to `packages/types/src/` for TypeScript interfaces

## Code Examples

- Provider examples: Each provider in `src/api/providers/` shows implementation patterns
- Test examples: `src/__tests__/` and `webview-ui/src/**/*.test.tsx`
- IPC patterns: `packages/ipc/src/` for communication examples
- Custom modes: Check `.roo/rules-*/` directories for mode-specific patterns

## Architecture Explanations

- **Monorepo Structure**:
    - `src/` - VSCode extension backend
    - `webview-ui/` - React frontend
    - `packages/` - Shared libraries
    - `apps/` - Additional applications
- **Webview Architecture**: VSCode extension hosts React app via webview API
- **Provider Pattern**: All AI providers implement common interface for consistency
- **IPC Communication**: Typed messages between extension and webview

## Command References

- Build commands: See `package.json` scripts section
- Test commands: Must run from workspace directory with package.json
- Development: F5 launches extension in new VSCode window
- VSIX packaging: `pnpm vsix` creates installable package

## Localization

- i18n files in `locales/` directory
- Extension uses vscode.l10n API for translations
- Webview uses i18next for React component translations
