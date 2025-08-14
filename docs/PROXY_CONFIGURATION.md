# Proxy Configuration Guide

## Issue: Connection Errors with Proxy Settings

If you're experiencing "Connection error" messages when using Roo Code with a proxy (SOCKS5, HTTP proxy, or PAC file), this guide will help you resolve the issue.

## Problem

When VSCode is configured to use a proxy (via environment variables, settings, or command-line arguments), but the `http.electronFetch` setting is disabled (which is the default), the extension may fail to connect to API endpoints. This particularly affects:

- OpenAI API connections
- OpenAI-compatible API providers
- Other providers that use the native `fetch` API

## Symptoms

- Generic "Connection error" messages when trying to use the extension
- Models populate correctly but chat completions fail
- Network Logger shows requests but they don't reach the server
- The same configuration works in other extensions (like Cline)

## Solution

### Option 1: Enable Electron Fetch (Recommended)

1. Open VSCode Settings (`Cmd/Ctrl + ,`)
2. Search for `http.electronFetch`
3. Check the box to enable the setting
4. Restart VSCode
5. Try using Roo Code again

### Option 2: Use Command Line

Add this to your VSCode settings.json:

```json
{
	"http.electronFetch": true
}
```

### Option 3: Configure VSCode Launch

If you're launching VSCode with a PAC file, ensure both settings are configured:

```bash
code --proxy-pac-url=http://localhost:8000/proxy.pac
```

And enable `http.electronFetch` in settings.

## Why This Happens

VSCode has two different implementations for making HTTP requests:

1. **Node.js fetch** (default): Doesn't fully support all proxy configurations
2. **Electron fetch**: Better proxy support but disabled by default

When `http.electronFetch` is `false` (default), extensions using the native fetch API may fail to route requests through your proxy correctly.

## Supported Proxy Types

With `http.electronFetch` enabled, the following proxy configurations are supported:

- HTTP/HTTPS proxies (via `http.proxy` setting or environment variables)
- SOCKS5 proxies
- PAC (Proxy Auto-Configuration) files
- Environment variables: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`

## Troubleshooting

If you're still experiencing issues after enabling `http.electronFetch`:

1. **Verify proxy settings**: Ensure your proxy configuration is correct
2. **Check firewall rules**: Make sure VSCode is allowed through your firewall
3. **Test connectivity**: Try accessing the API endpoint directly via curl or browser
4. **Check API credentials**: Ensure your API keys are valid and have the necessary permissions
5. **Review logs**: Check the Roo Code output channel for detailed error messages

## Alternative Solutions

If enabling `http.electronFetch` doesn't resolve your issue:

1. **Temporarily disable proxy**: If the proxy isn't required for the API endpoint
2. **Use a different provider**: Some providers may work better with your proxy setup
3. **Configure proxy exceptions**: Add API endpoints to your proxy bypass list

## Related Issues

- [VSCode Issue #12588](https://github.com/microsoft/vscode/issues/12588) - Original discussion about proxy support
- [Roo Code Issue #6991](https://github.com/RooCodeInc/Roo-Code/issues/6991) - Specific issue about connection errors with proxies

## Need Help?

If you're still experiencing issues, please:

1. Open an issue on [GitHub](https://github.com/RooCodeInc/Roo-Code/issues)
2. Include your proxy configuration (without sensitive information)
3. Provide the error messages from the Roo Code output channel
4. Mention whether `http.electronFetch` is enabled
