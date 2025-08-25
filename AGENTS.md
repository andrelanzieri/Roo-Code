# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

Roo Code - AI-powered autonomous coding agent VSCode extension with React webview UI, supporting multiple AI providers and custom modes.

## Build/Test/Lint Commands

```bash
# Install dependencies (from root)
pnpm install

# Build entire project
pnpm build

# Run tests (CRITICAL: run from workspace directory containing package.json)
cd src && npx vitest run tests/user.test.ts  # Backend tests
cd webview-ui && npx vitest run src/components/Button.test.tsx  # UI tests

# Lint/format
pnpm lint
pnpm format
```

## Code Style

- **Formatting**: Tabs (4 width), 120 char lines, no semicolons, bracket same line
- **Imports**: ESM modules, use `.js` extensions in packages/
- **Types**: TypeScript strict mode, `noUncheckedIndexedAccess: true`
- **Naming**: camelCase functions/variables, PascalCase components/classes
- **UI**: Tailwind CSS classes only (no inline styles), VSCode CSS vars via webview-ui/src/index.css

## Architecture

```
src/                 # VSCode extension backend (TypeScript)
├── extension.ts     # Entry point, registers providers & commands
├── api/providers/   # AI provider implementations
├── core/webview/    # Webview provider & IPC
└── utils/          # Utilities (MUST use safeWriteJson for JSON writes)

webview-ui/         # React frontend
├── src/components/ # React components with Tailwind CSS
└── src/hooks/     # Custom React hooks

packages/           # Shared packages
├── types/         # Shared TypeScript types
├── ipc/          # IPC communication layer
└── evals/        # Evaluation framework
```

## Critical Patterns

- **JSON Writes**: ALWAYS use `safeWriteJson()` from src/utils/safeWriteJson.ts (atomic writes with locking)
- **Testing**: Run vitest from workspace directory containing package.json, NOT from project root
- **Providers**: Implement Provider interface from packages/types/src/
- **Webview**: VSCode webview architecture with IPC messaging between extension and UI

## Development

- **Debug**: Press F5 in VSCode to launch extension host
- **Hot Reload**: Webview changes appear immediately, core changes auto-reload in dev mode
- **VSIX**: `pnpm vsix` to build, `pnpm install:vsix` to install locally
