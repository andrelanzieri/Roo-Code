# Perl Support for Tree-sitter

This implementation adds Perl language support to the tree-sitter codebase indexing feature.

## Implementation Status

✅ **Completed:**

- Added Perl file extensions (.pl, .pm, .pod, .t) to supported extensions
- Created comprehensive Perl query patterns for tree-sitter parsing
- Added Perl language parser configuration in languageParser.ts
- Created test suite for Perl parsing
- Added sample Perl fixture for testing

⚠️ **Pending:**

- The `tree-sitter-perl.wasm` file needs to be added to `src/dist/`

## Missing WASM File

The tree-sitter-perl WASM file is not available via npm package manager and needs to be built from source.

### How to obtain tree-sitter-perl.wasm:

1. Clone the tree-sitter-perl repository:

    ```bash
    git clone https://github.com/tree-sitter-grammars/tree-sitter-perl
    ```

2. Build the WASM file using tree-sitter CLI:

    ```bash
    cd tree-sitter-perl
    npm install
    npx tree-sitter build-wasm
    ```

3. Copy the generated `tree-sitter-perl.wasm` file to `src/dist/`

## Testing

Once the WASM file is in place, you can run the tests:

```bash
cd src
npx vitest run services/tree-sitter/__tests__/parseSourceCodeDefinitions.perl.spec.ts
```

## Supported Perl Constructs

The implementation supports parsing of:

- Package declarations
- Subroutine definitions (including prototypes and attributes)
- Variable declarations (my, our, local, state)
- Constants
- Use and require statements
- BEGIN, END, CHECK, INIT, UNITCHECK blocks
- AUTOLOAD and DESTROY special subroutines
- Regular expressions (match, substitution, transliteration)
- Format declarations
- Labels
- POD documentation blocks
- Anonymous subroutines
- Moose/Moo style attributes (has declarations)
