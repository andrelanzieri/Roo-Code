# Ask Mode Rules

## Non-Obvious Documentation Context

- `src/` contains VSCode extension code, NOT generic source (counterintuitive naming)
- Two separate i18n systems: root `locales/` for extension, `webview-ui/src/i18n/` for UI
- Provider examples in `src/api/providers/` are canonical reference (docs may be outdated)
- Webview runs in VSCode context with restrictions (no localStorage, limited browser APIs)
