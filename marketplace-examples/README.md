# Marketplace Examples

This directory contains example configurations for items that could be added to the Roo Code Marketplace.

## Purpose

Since the Roo Code Marketplace items are managed through an external API (`https://api.roocode.com/api/marketplace/`), this directory serves as:

1. **Reference examples** for new marketplace submissions
2. **Documentation** of the expected format for MCP servers and modes
3. **Testing ground** for validating configurations before they're added to the marketplace backend

## Structure

```
marketplace-examples/
├── mcp-servers/        # Example MCP server configurations
│   └── windows-mcp.yaml
└── modes/             # Example custom mode configurations (future)
```

## MCP Server Configuration Format

MCP server configurations follow the schema defined in `packages/types/src/marketplace.ts`. Each configuration should include:

### Required Fields

- `id`: Unique identifier for the MCP server
- `name`: Display name
- `description`: Clear description of what the server does
- `url`: GitHub repository or project URL
- `content`: Installation configuration(s)

### Optional Fields

- `author`: Creator's name
- `authorUrl`: Link to author's profile
- `tags`: Array of relevant tags for discovery
- `prerequisites`: System requirements or dependencies
- `parameters`: Configurable options for the server

## Example: Windows MCP

The `mcp-servers/windows-mcp.yaml` file demonstrates a complete configuration for the Windows MCP server, which allows AI agents to control Windows desktop applications, browsers, and file operations.

### Key Features Highlighted:

- Multiple installation methods (uvx, pip, development)
- Clear prerequisites for each installation method
- Optional configuration parameters
- Comprehensive tagging for discoverability

## How to Submit to Marketplace

Currently, marketplace items are managed through the Roo Code backend API. To submit a new MCP server:

1. Create a configuration file following the examples in this directory
2. Test the configuration locally to ensure it works
3. Submit an issue using the [Marketplace Feedback template](https://github.com/RooCodeInc/Roo-Code/issues/new?template=marketplace.yml)
4. Include your configuration file in the issue
5. The Roo Code team will review and add it to the marketplace backend

## Testing Locally

While these configurations cannot be directly used in the extension (as it fetches from the API), you can manually test MCP servers by:

1. Installing them according to their documentation
2. Adding them to your `.roo/mcp.json` (project-level) or global MCP settings
3. Verifying they work correctly with Roo Code

## Contributing

If you'd like to add more example configurations:

1. Follow the existing format and structure
2. Ensure all required fields are present
3. Test the installation instructions
4. Submit a PR with your example configuration

## Notes

- These examples are for reference only and don't automatically appear in the marketplace
- The actual marketplace data is served from `https://api.roocode.com/api/marketplace/mcps`
- Changes to the marketplace require backend updates by the Roo Code team
