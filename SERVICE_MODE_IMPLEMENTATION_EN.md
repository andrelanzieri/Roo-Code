# Service Mode Implementation Summary

## Overview

This refactoring implements the Service mode for command execution, solving the problem of long-running commands (such as starting development servers) blocking the entire execution chain. The system can now automatically identify service commands, run them in the background, and display their running status in the bottom status bar.

## Modified Files List

### 1. Type Definition Extensions

#### `packages/types/src/terminal.ts`

- **Changes**: Extended `CommandExecutionStatus` type, added three new service states
    - `service_started`: Service has started
    - `service_ready`: Service is ready
    - `service_failed`: Service startup failed

```typescript
z.object({
  executionId: z.string(),
  status: z.literal("service_started"),
  serviceId: z.string(),
  pid: z.number().optional(),
}),
z.object({
  executionId: z.string(),
  status: z.literal("service_ready"),
  serviceId: z.string(),
}),
z.object({
  executionId: z.string(),
  status: z.literal("service_failed"),
  serviceId: z.string(),
  reason: z.string(),
}),
```

#### `src/core/tools/ExecuteCommandTool.ts`

- **Changes**: Extended `ExecuteCommandOptions` type, added service mode related fields
    - `mode?: "oneshot" | "service"` - Command execution mode
    - `serviceId?: string` - Service ID
    - `readyPattern?: string | RegExp` - Ready pattern matching
    - `readyTimeoutMs?: number` - Ready timeout
    - `healthCheckUrl?: string` - Health check URL
    - `healthCheckIntervalMs?: number` - Health check interval

#### `src/shared/ExtensionMessage.ts`

- **Changes**:
    - Added `backgroundServicesUpdate` message type
    - Added `services` field for passing service list

```typescript
type: "backgroundServicesUpdate"
services?: Array<{
  serviceId: string
  command: string
  status: string
  pid?: number
  startedAt: number
  readyAt?: number
}>
```

#### `src/shared/WebviewMessage.ts`

- **Changes**:
    - Added `requestBackgroundServices` message type
    - Added `stopService` message type
    - Added `serviceId` field

### 2. Newly Created Files

#### `src/integrations/terminal/ServiceManager.ts`

- **Function**: Core class for service lifecycle management
- **Main Methods**:

    - `startService()` - Start service
    - `stopService()` - Stop service
    - `getService()` - Get service information
    - `listServices()` - List all running services (including services being stopped, excluding only fully stopped or failed services)
    - `getServiceLogs()` - Get service logs
    - `onServiceStatusChange()` - Register status change callback

- **Service States**:

    - `pending` - Waiting to start
    - `starting` - Starting
    - `ready` - Ready
    - `running` - Running
    - `stopping` - Stopping
    - `stopped` - Stopped
    - `failed` - Failed

- **Features**:
    - Supports log pattern matching for ready state detection
    - Supports HTTP health checks
    - Automatically collects and limits log lines
    - Status change notification mechanism

#### `webview-ui/src/components/chat/BackgroundTasksBadge.tsx`

- **Function**: Frontend background task display component (button)
- **Location**: Located at the bottom status bar right side of the `ChatTextArea` component, displayed alongside `IndexingStatusBadge`
- **Display Condition**: Only displays when there are running services (status is `starting`, `ready`, `running`, or `stopping`), otherwise not rendered
- **Multi-language Support**: Component is fully internationalized, supporting all 18 languages (ca, de, en, es, fr, hi, id, it, ja, ko, nl, pl, pt-BR, ru, tr, vi, zh-CN, zh-TW)
    - Uses `useAppTranslation` hook to get translations
    - All text is read from `common.json`'s `backgroundTasks` namespace
    - Translation keys include: `title`, `ariaLabel`, `tooltip`, `stopService`, and status texts (`status.starting`, `status.ready`, `status.running`, `status.stopping`, `status.failed`)
- **Button Design**:
    - Uses `Server` icon (lucide-react)
    - Displays number of running services (numeric badge)
    - Shows yellow pulsing animation indicator when services are in `starting` state
    - Button style: ghost variant, small size, semi-transparent background, highlights on hover
    - Tooltip: Uses translation key `common:backgroundTasks.tooltip`, supports dynamic count display
- **Interaction**:
    - Click button to open popover
    - Popover width 320px, right-aligned
- **Popover Content**:
    - Title: Uses translation key `common:backgroundTasks.title`
    - Service list: Each service displayed as a card
        - Status indicator: Colored dot (yellow=starting, green=ready, blue=running, orange=stopping, red=failed)
        - Command name: Truncated display (max 35 characters), uses monospace font
        - Status text: Uses translation key `common:backgroundTasks.status.*`, displays corresponding translation based on current language
        - PID information: Displays process ID if available
        - Stop button: X icon button on the right side of each service, tooltip uses translation key `common:backgroundTasks.stopService`
            - Clicking stop button prevents event bubbling to ensure message is correctly sent to backend
            - Stop operation immediately updates service status and notifies frontend
            - Service displays as `stopping` status during stop process, only removed from list after fully stopped
- **Data Updates**:
    - Requests initial service list on component mount (`requestBackgroundServices`)
    - Listens to `backgroundServicesUpdate` messages, automatically updates service list
    - Real-time UI updates on status changes

### 3. Core Logic Modifications

#### `src/core/tools/ExecuteCommandTool.ts`

- **New Methods**:

    1. `detectServiceCommand(command: string): boolean`

        - Automatically detects if command is a service command
        - Supports 70+ common development server command patterns
        - Covers JavaScript/TypeScript, Python, Ruby, Java, Go, Rust, PHP, C#/.NET, Dart/Flutter, Swift, Kotlin, Elixir, Clojure, Scala, Haskell, etc.

    2. `getReadyPattern(command: string): string | undefined`

        - Returns corresponding ready pattern based on command
        - Provides precise ready detection patterns for different frameworks
        - Includes generic fallback patterns

    3. `executeServiceCommand()` - Execute service mode command

        - Uses ServiceManager to start service
        - Waits for service ready (via readyPattern or healthCheckUrl)
        - Returns immediately without blocking execution chain

    4. `waitForServiceReady()` - Wait for service ready
    5. `waitForPattern()` - Wait for log pattern match
    6. `waitForHealthCheck()` - Wait for HTTP health check to pass

- **Modified Methods**:
    - `execute()` - Added service command auto-detection logic
    - `executeCommandInTerminal()` - Added service mode branch handling

#### `src/core/webview/webviewMessageHandler.ts`

- **New Message Handlers**:

    1. `requestBackgroundServices`

        - Gets current list of running services
        - Returns service information (serviceId, command, status, pid, etc.)

    2. `stopService`
        - Stops specified service
        - Updates service list and notifies frontend

#### `src/core/webview/ClineProvider.ts`

- **New Method**:

    - `initializeServiceStatusUpdates()` - Initialize service status update mechanism
        - Registers ServiceManager status change callback
        - Automatically pushes service status updates to frontend

- **Modification Location**:
    - Calls `initializeServiceStatusUpdates()` in constructor

#### `webview-ui/src/components/chat/ChatTextArea.tsx`

- **Changes**:
    - Imports `BackgroundTasksBadge` component
    - Adds `<BackgroundTasksBadge />` component to bottom status bar

## Workflow

### Service Command Execution Flow

1. **Command Detection**

    - AI or user executes command
    - `ExecuteCommandTool.execute()` calls `detectServiceCommand()` to detect
    - If service pattern matches, sets `mode: "service"`

2. **Service Startup**

    - `executeCommandInTerminal()` detects `mode === "service"`
    - Calls `executeServiceCommand()`
    - `ServiceManager.startService()` starts service
    - Sends `service_started` status to frontend

3. **Ready Detection**

    - If `readyPattern` provided, listens for log matching
    - If `healthCheckUrl` provided, performs periodic HTTP checks
    - After successful match or health check passes, sends `service_ready` status

4. **Non-blocking Return**

    - Returns immediately after service is ready
    - Does not wait for process to end
    - Subsequent commands can continue executing
    - **AI receives clear return message**: `Service started with ID: ${serviceId}. Status: ${status}. The service is running in the background.`
    - AI knows task has become background task and can continue executing subsequent commands

5. **Status Management**

    - ServiceManager continuously tracks service status
    - Status changes notify ClineProvider via callback
    - ClineProvider pushes updates to frontend

6. **Frontend Display**
    - BackgroundTasksBadge button component displays in bottom status bar
    - Component listens to `backgroundServicesUpdate` messages, automatically updates service list
    - Button displays number of running services with Server icon
    - Clicking button opens popover, displaying detailed information for all running services:
        - Service command (truncated display)
        - Service status (starting/ready/running/etc.)
        - Process ID (if available)
        - Stop button (X icon) for each service
    - Users can click stop button in popover to terminate specified service
    - When all services stop, button automatically hides

## Supported Service Command Patterns

### JavaScript/TypeScript/Node.js

- `npm run dev/start/serve`
- `yarn dev/start/serve`
- `pnpm dev/start/serve`
- `vite dev`
- `next dev/start`
- `nuxt dev/start`
- `nest start:dev`
- `react-scripts start`
- `webpack-dev-server serve/start`
- `parcel serve/watch`
- `rollup -w/--watch`
- `ts-node-dev/nodemon/tsx watch/dev`
- `ng serve` (Angular)
- `ember serve`
- `gatsby develop`

### Python

- `python manage.py runserver` (Django)
- `django-admin runserver`
- `uvicorn --reload/dev`
- `flask run/--debug`
- `fastapi dev/run`
- `gunicorn --reload`
- `python -m http.server`
- `streamlit run`
- `jupyter notebook/lab`

### Ruby

- `rails server/s`
- `rackup`
- `puma/unicorn/thin/passenger start`

### Java

- `mvn spring-boot:run`
- `mvn jetty:run`
- `mvn tomcat7:run`
- `gradle bootRun`
- `gradle run`
- `./gradlew bootRun`

### Go

- `air start`
- `fresh start`
- `realize start`
- `bee run`
- `buffalo dev`

### Rust

- `trunk serve`
- `dx serve`

### PHP

- `php artisan serve`
- `php -S localhost`
- `symfony server:start`
- `composer serve`

### C#/.NET

- `dotnet run`
- `dotnet watch run`
- `dotnet --project run`

### Dart/Flutter

- `flutter run`
- `dart run`
- `dart pub serve`

### Swift

- `swift run` (Vapor, etc.)
- `vapor serve`

### Kotlin

- `./gradlew run` (Ktor, etc.)
- `mvn kotlin:run`

### Elixir

- `mix phx.server`
- `mix phoenix.server`
- `iex -S mix`

### Clojure

- `lein run`
- `lein ring server`
- `boot dev`

### Scala

- `sbt run`
- `sbt ~run`
- `activator run`

### Haskell

- `stack exec yesod devel`
- `cabal run`

### Others

- `docker-compose up`
- `docker up -d`
- `hugo server`
- `jekyll serve`
- `hexo server`
- `mkdocs serve`
- `sphinx-autobuild`

## Ready Pattern Examples

### Vite/Next.js/Nuxt

```
Local:.*http://localhost|ready in|compiled successfully
```

### Django

```
Starting development server|Django version|System check identified
```

### Flask

```
Running on|Debug mode: on|\\* Debugger is active!
```

### Spring Boot

```
Started.*Application|Tomcat started on port|Netty started on port
```

## Technical Details

### Service State Machine

```
pending → starting → ready → running
                    ↓
                 stopping → stopped
                    ↓
                  failed
```

### Log Management

- Default maximum 1000 log lines saved
- Automatically removes oldest logs
- Supports querying recent N lines of logs

### Health Check

- Default interval: 1000ms
- Timeout: 2000ms
- Stops checking after success

### Timeout Settings

- Default ready timeout: 60 seconds
- Docker-related commands: 120 seconds

## Usage Examples

### How to See BackgroundTasksBadge Button?

**Important Note**: The button only displays when there are running services. If no services are running, the button will not appear (this is normal design behavior).

To see the button, you need to:

1. Execute a service command (such as `npm run dev`, `python manage.py runserver`, etc.)
2. Wait for service to start and enter `starting`, `ready`, `running`, or `stopping` state
3. Button will automatically appear in bottom status bar right side (Server icon + service count)

### AI Executes Service Command

```bash
npm run dev
```

System will automatically:

1. Detect as service command
2. Start service
3. Wait for ready (match "Local:.\*http://localhost" pattern)
4. Return immediately without blocking
5. **AI receives return message**: `Service started with ID: xxx. Status: ready. The service is running in the background.`
6. **Button automatically appears in bottom status bar right side**, displaying number of running services

### User Stops Service

1. Find BackgroundTasksBadge button in bottom status bar right side (Server icon + service count)
2. Click button to open popover, view all running services
3. In popover, find service to stop
4. Click X icon button on the right side of that service
5. Service status immediately changes to `stopping` (stopping), displays orange status indicator
6. System waits for service process to fully terminate
7. After service fully stops, status changes to `stopped` or `failed`, removed from list
8. If all services have stopped, button automatically hides

## Notes

1. **Service Command Auto-detection**: System automatically identifies common service commands, no need to manually specify `mode: "service"`

2. **Ready Detection**: If command matching fails or no ready pattern provided, system waits 2 seconds then returns directly

3. **Process Management**: Service processes are managed by ServiceManager, ensuring proper termination and cleanup

4. **Status Synchronization**: Service status changes automatically sync to frontend, no manual refresh needed

5. **Multi-service Support**: Can run multiple services simultaneously, each service has independent serviceId

6. **Multi-language Support**: BackgroundTasksBadge component is fully internationalized
    - Supports all 18 languages: ca, de, en, es, fr, hi, id, it, ja, ko, nl, pl, pt-BR, ru, tr, vi, zh-CN, zh-TW
    - Translation files located at `webview-ui/src/i18n/locales/{language code}/common.json`
    - All UI text automatically switches based on user's language settings
    - Translation keys uniformly use `common:backgroundTasks.*` namespace

## Service Startup Failure Handling

When a service fails to start, the system handles it according to the following mechanisms:

### AI Failure Notification Summary

**Cases where AI receives failure notification**:

- ✅ **Startup Phase Failure**: AI immediately receives error message (via `pushToolResult`)
- ✅ **Ready Detection Phase Failure**: AI immediately receives error message (via `pushToolResult`)

**Cases where AI does NOT receive failure notification**:

- ❌ **Unexpected Exit During Runtime**: AI does not receive new error message (because `executeServiceCommand` has already returned success message), but frontend UI will display failure status through status update mechanism

**Code Flow**:

1. `execute()` → `executeCommandInTerminal()` → `executeServiceCommand()`
2. `executeServiceCommand()` returns `[boolean, ToolResponse]`
3. Return value is passed to AI via `pushToolResult(result)`
4. First two failure cases pass error message to AI when `executeServiceCommand()` returns
5. Third case is asynchronous, `executeServiceCommand()` has already returned, so `pushToolResult` is not called again

### Failure Scenario Categories

1. **Startup Phase Failure**

    - **Trigger Condition**: `ServiceManager.startService()` throws an exception
    - **Common Causes**:
        - Working directory does not exist
        - Command execution failure (e.g., command not found, insufficient permissions)
        - Terminal creation failure
    - **Handling Process**:
        - Catch exception and extract error message
        - Send `service_failed` status to frontend, including `reason` field explaining failure cause
        - Return error message to AI: `Failed to start service: ${errorMessage}`
        - **AI receives clear failure notification** and can take subsequent actions (e.g., check command, fix configuration)

2. **Ready Detection Phase Failure**

    - **Trigger Condition**: `waitForServiceReady()` times out or fails
    - **Common Causes**:
        - Ready pattern (`readyPattern`) not matched within timeout period
        - HTTP health check (`healthCheckUrl`) continuously fails
        - Service process unexpectedly exits during startup (in this case, `onShellExecutionComplete` callback will set status to `failed`, but `waitForServiceReady` will still wait until timeout)
    - **Handling Process**:
        - `waitForPattern` or `waitForHealthCheck` throws error after timeout
        - In `executeServiceCommand` catch block, set service status to `failed`
        - Send `service_failed` status to frontend, including failure reason (e.g., `Service ready pattern not matched within ${timeoutMs}ms`)
        - Return error message to AI: `Service failed to become ready: ${errorMessage}`
        - **Note**: If service process exits while waiting for ready, `onShellExecutionComplete` callback will immediately set status to `failed`, but `waitForServiceReady` won't detect it immediately and will continue waiting until timeout
        - **AI receives clear failure notification** and can check service logs or retry startup

3. **Unexpected Exit During Runtime**
    - **Trigger Condition**: Service process unexpectedly exits with non-zero exit code
    - **Common Causes**:
        - Service code error causing crash
        - Insufficient resources (memory, port occupied, etc.)
        - Dependent service unavailable
    - **Handling Process**:
        - `ExecaTerminalProcess` detects process exit, triggers `shell_execution_complete` event
        - ServiceManager's `onShellExecutionComplete` callback is called
        - Determine based on exit code: exit code 0 marks as `stopped`, non-zero marks as `failed`
        - Call `notifyStatusChange` to update service status and notify frontend (via ClineProvider pushing status updates)
        - **Note**: This is handled asynchronously, does not immediately return error message to AI (because `executeServiceCommand` has already returned), but notifies frontend through status update mechanism
        - **Failed services remain in the list** and are not automatically removed, users can see failure status in UI

### Failure Status Display

- **Frontend UI**:

    - Failed services are displayed in BackgroundTasksBadge popover
    - Status indicator shows **red** (`failed` status)
    - Status text displays "Failed" (shows corresponding translation based on user's language settings)
    - Users can view failed service information (command, PID, start time, etc.)

- **Service List**:
    - Services with `failed` status remain in ServiceManager's service list
    - `listServices()` method includes services with `failed` status
    - Users can view failed services through UI and manually clean up or retry

### AI Handling Recommendations

When AI receives a service startup failure notification, it can take the following actions:

1. **Check Error Message**: Determine failure cause based on returned error message (`reason` field)
2. **View Service Logs**: If service started but not ready, check service logs to locate issue
3. **Fix Problem**: Fix configuration, code, or environment issues based on error cause
4. **Retry Startup**: Re-execute service startup command after fixing the problem
5. **Clean Up Failed Service**: If service has failed but still in list, suggest user manually clean up through UI

### Error Message Examples

- **Startup Failure**: `Failed to start service: Working directory '/path/to/dir' does not exist.`
- **Ready Timeout (Pattern Match)**: `Service failed to become ready: Service ready pattern not matched within 60000ms`
- **Ready Timeout (Health Check)**: `Service failed to become ready: Health check failed within 60000ms`
- **Process Exit**: Service status is asynchronously updated to `failed` via `onShellExecutionComplete` callback, frontend displays failure status through status update mechanism (does not immediately return error message to AI)

### Notes

1. **Failed Services Not Automatically Cleaned**: Services with `failed` status remain in the list and require manual handling or system restart to clean up
2. **Process May Still Be Running**: When ready detection fails, service process may still be running in background and needs manual termination
3. **Error Information Propagation**:
    - **Startup Phase Failure** and **Ready Detection Phase Failure**: Immediately return error message to AI, AI can take immediate action
    - **Unexpected Exit During Runtime**: Notify frontend through asynchronous status update mechanism, does not immediately return error message to AI (because `executeServiceCommand` has already returned), but frontend UI will display failure status
4. **Status Update Mechanism**: Service status changes are propagated through `ServiceManager.notifyStatusChange()` → `ClineProvider` → frontend, ensuring frontend UI can reflect service status in real-time

## Future Improvements

1. **Service Configuration Persistence**: Save service configuration, restore after restart
2. **Service Log Viewing**: Provide more detailed log viewing interface
3. **Service Dependency Management**: Support dependency relationships between services
4. **Custom Ready Detection**: Allow users to customize ready detection logic
5. **Service Performance Monitoring**: Add CPU, memory usage monitoring

## Testing Recommendations

1. **Basic Functionality Testing**

    - Execute `npm run dev`, verify service startup and ready detection
    - Verify BackgroundTasksBadge button displays in bottom status bar right side
    - Verify button displays correct service count
    - Verify clicking button opens popover
    - Verify popover displays service details (command, status, PID)
    - Verify clicking stop button can terminate service
    - Verify button automatically updates or hides after service stops

2. **Multi-service Testing**

    - Start multiple services simultaneously
    - Verify all services display correctly
    - Verify independent stop functionality

3. **Exception Case Testing**

    - Service startup failure
    - Service timeout without ready
    - Service unexpected exit

4. **Different Framework Testing**
    - Test service commands for various frameworks
    - Verify ready pattern matching accuracy

## Test Prompt (for Empty Project Testing)

The following is a complete test prompt that can be used to test roocode's service mode functionality in an empty project:

```
Please help me create a simple Next.js project to test the development server functionality.

Requirements:
1. Create a new Next.js project (using TypeScript)
2. Configure basic development environment (package.json, tsconfig.json, etc.)
3. Create a simple homepage displaying "Hello, RooCode Service Mode Test"
4. Start the development server (using npm run dev or pnpm dev)

Please execute step by step:
- First initialize project structure
- Install necessary dependencies
- Create basic files
- Finally start the development server

Note: After starting the development server, please tell me if the service started successfully and if you received a notification that the service is running in the background.
```

### Test Prompt Description

This prompt is designed to test the following functionality:

1. **Service Command Auto-detection**: When executing `npm run dev`, roocode should automatically identify this as a service command
2. **Service Startup and Ready Detection**: System should start service and wait for ready (match "Local:.\*http://localhost" pattern)
3. **Non-blocking Execution**: After service starts, should return immediately without blocking subsequent command execution
4. **AI Feedback**: AI should receive a return message like "Service started with ID: xxx. Status: ready. The service is running in the background."
5. **UI Display**: Bottom status bar right side should automatically display BackgroundTasksBadge button, showing number of running services
6. **Service Management**: Users can view service details and stop services by clicking the button

### Expected Test Results

After executing the above prompt, you should observe:

1. ✅ Project successfully created and configured
2. ✅ Development server successfully started
3. ✅ AI received notification that service is running in background
4. ✅ Server icon button appears in bottom status bar right side, displaying service count (e.g., "1")
5. ✅ Clicking button opens popover, viewing service details (command, status, PID)
6. ✅ Can terminate service via stop button in popover
7. ✅ Button automatically hides after service stops

### Other Test Scenario Prompts

#### Test Multi-service Scenario

```
Please help me create two independent projects:
1. A Next.js frontend project (port 3000)
2. A simple Node.js Express API project (port 3001)

Then start both development servers simultaneously, verifying they can both run in the background.
```

#### Test Python Service

```
Please help me create a simple Flask application:
1. Create requirements.txt and basic Flask application files
2. Start Flask development server (flask run or python app.py)

Verify the service starts correctly and runs in the background.
```

#### Test Service Stop Functionality

```
Please start a development server, then:
1. Verify service is running in background
2. Stop service via UI
3. Verify service has correctly terminated
```
