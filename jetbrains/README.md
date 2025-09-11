# JetBrains Integration for Roo-Code

This directory contains the JetBrains integration layer that allows Roo-Code to run as a plugin within JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, etc.).

## Architecture Overview

The JetBrains integration consists of two main components:

### 1. Host Bridge (`/jetbrains/host/`)

A Node.js application that:

- Starts the VSCode extension host process
- Provides socket-based IPC communication between JetBrains and the extension
- Translates between JetBrains and VSCode APIs via RPC
- Manages the extension lifecycle

### 2. JetBrains Plugin (`/jetbrains/plugin/`)

A Kotlin/Java plugin that:

- Integrates with JetBrains IDE APIs
- Spawns the Node.js host process
- Handles UI integration within the IDE
- Maps IDE actions to extension commands

## Setup Instructions

### Prerequisites

- Node.js 18.x or higher
- Java 17 or higher
- JetBrains IDE (IntelliJ IDEA, WebStorm, etc.)
- Git with submodule support

### Building the Host Bridge

1. Install dependencies:

```bash
cd jetbrains/host
npm install
```

2. Apply VSCode patches:

```bash
npm run deps:patch
```

3. Build the host:

```bash
npm run build
```

### Building the JetBrains Plugin

1. Navigate to the plugin directory:

```bash
cd jetbrains/plugin
```

2. Build the plugin:

```bash
./gradlew buildPlugin
```

3. The plugin will be available in `build/distributions/`

## Development

### Running in Development Mode

1. Start the host in development mode:

```bash
cd jetbrains/host
npm run dev
```

2. Open the plugin project in IntelliJ IDEA:

```bash
cd jetbrains/plugin
idea .
```

3. Run the plugin using the "Run Plugin" configuration

### Debugging

Enable debug logging by setting environment variables:

- `JETBRAINS_DEBUG_IPC=true` - Logs IPC messages
- `JETBRAINS_RPC_DEBUG=true` - Logs RPC protocol messages

### Testing

Run tests for the host:

```bash
cd jetbrains/host
npm test
```

Run tests for the plugin:

```bash
cd jetbrains/plugin
./gradlew test
```

## Configuration

### Host Configuration

The host can be configured via `jetbrains/host/src/config.ts`:

- `DEFAULT_PORT`: Default socket port (51234)
- `SOCKET_TIMEOUT`: Connection timeout in milliseconds
- `MAX_RECONNECT_ATTEMPTS`: Maximum reconnection attempts

### Plugin Configuration

Plugin settings are in `jetbrains/plugin/gradle.properties`:

- `pluginVersion`: Plugin version
- `platformVersion`: Target IDE version
- `platformType`: IDE type (IC for IntelliJ Community)

## Architecture Details

### Communication Flow

```
JetBrains IDE <-> Kotlin Plugin <-> Socket (TCP) <-> Node.js Host <-> VSCode Extension API <-> Roo-Code Extension
```

### RPC Protocol

The RPC manager (`host/src/rpcManager.ts`) handles bidirectional communication:

- Incoming calls from JetBrains to VSCode APIs
- Outgoing calls from VSCode to JetBrains APIs
- Event subscriptions and notifications

### API Translation

Main thread actors in the plugin map JetBrains APIs to VSCode equivalents:

- `MainThreadCommandsShape`: Command execution
- `MainThreadDocumentsShape`: Document management
- `MainThreadTextEditorsShape`: Editor operations
- `MainThreadTerminalServiceShape`: Terminal integration
- And many more...

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the socket port in the configuration
2. **VSCode patch fails**: Ensure the VSCode submodule is at the correct version
3. **Plugin doesn't load**: Check IDE compatibility in gradle.properties
4. **Extension not found**: Verify the extension is built and in the correct location

### Logs Location

- Host logs: `jetbrains/host/logs/`
- Plugin logs: Check IDE's log directory

## Contributing

When contributing to the JetBrains integration:

1. Follow the existing code style
2. Add tests for new functionality
3. Update documentation as needed
4. Test in multiple JetBrains IDEs if possible

## License

This JetBrains integration follows the same license as Roo-Code.

## Support

For issues specific to JetBrains integration:

1. Check this README's troubleshooting section
2. Search existing issues on GitHub
3. Create a new issue with the "jetbrains" label

## Credits

This integration is adapted from similar VSCode-to-JetBrains bridge implementations and modified for Roo-Code's specific requirements.
