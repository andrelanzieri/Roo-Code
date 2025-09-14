# Marketplace Submissions

This directory contains marketplace item submissions for the Roo Code extension marketplace.

## About This Submission

This submission adds the **IDA Pro MCP** to the marketplace, as requested in issue #7982.

### IDA Pro MCP

The IDA Pro MCP (Model Context Protocol) server enables advanced reverse engineering capabilities through LLM integration with IDA Pro. It provides a comprehensive set of tools for binary analysis, including:

- **Decompilation and Disassembly**: Get decompiled pseudocode and assembly code for functions
- **Function Analysis**: List, search, and analyze functions by name or address
- **Cross-References**: Track references to addresses and struct fields
- **Variable Management**: Rename and retype local and global variables
- **Code Annotation**: Add comments to disassembly and pseudocode
- **Debugging Support**: Control debugger, set breakpoints, and inspect registers (with --unsafe flag)
- **Type Management**: Declare C types and manage local types

### Submission Details

- **Repository**: https://github.com/mrexodia/ida-pro-mcp
- **Author**: mrexodia
- **License**: Check repository for license details
- **Requirements**:
    - Python 3.11 or higher
    - IDA Pro 8.3 or higher (IDA Free is not supported)
    - Installation via pip: `pip install https://github.com/mrexodia/ida-pro-mcp/archive/refs/heads/main.zip`

### Installation Process

Users need to:

1. Install the Python package: `pip install https://github.com/mrexodia/ida-pro-mcp/archive/refs/heads/main.zip`
2. Run the configuration: `ida-pro-mcp --install`
3. Restart IDA Pro and their MCP client

### Integration with Roo Code

The MCP server runs as a command-line tool `ida-pro-mcp` and can be configured with the `--unsafe` flag for debugging features. The server communicates with IDA Pro through a plugin that must be installed and running.

## Submission Format

The `ida-pro-mcp.yaml` file follows the marketplace format used by the Roo Code API at `https://app.roocode.com/api/marketplace/mcps`. The entry includes:

- Unique identifier
- Name and description
- Author information
- Repository URL
- Relevant tags for discoverability
- Prerequisites
- Command configuration for running the server

## Note to Maintainers

This submission is created in response to issue #7982. Since the marketplace data is managed server-side, this submission provides all the necessary information for adding the IDA Pro MCP to the marketplace API.

The YAML format matches the existing marketplace structure observed in the API responses. Please review and add this entry to the server-side marketplace data when appropriate.

## Related Issues

- Issue #7982: Add Mcp https://github.com/mrexodia/ida-pro-mcp/
