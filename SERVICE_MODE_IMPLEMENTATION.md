# Service 模式实现总结

## 概述

本次改造实现了命令执行的 Service 模式，解决了长时间运行命令（如启动开发服务器）阻塞整个执行链的问题。系统现在可以自动识别服务命令，在后台运行，并在底部状态栏显示运行状态。

## 修改文件清单

### 1. 类型定义扩展

#### `packages/types/src/terminal.ts`

- **修改内容**：扩展 `CommandExecutionStatus` 类型，添加三个新的服务状态
    - `service_started`: 服务已启动
    - `service_ready`: 服务已就绪
    - `service_failed`: 服务启动失败

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

- **修改内容**：扩展 `ExecuteCommandOptions` 类型，添加服务模式相关字段
    - `mode?: "oneshot" | "service"` - 命令执行模式
    - `serviceId?: string` - 服务 ID
    - `readyPattern?: string | RegExp` - 就绪模式匹配
    - `readyTimeoutMs?: number` - 就绪超时时间
    - `healthCheckUrl?: string` - 健康检查 URL
    - `healthCheckIntervalMs?: number` - 健康检查间隔

#### `src/shared/ExtensionMessage.ts`

- **修改内容**：
    - 添加 `backgroundServicesUpdate` 消息类型
    - 添加 `services` 字段用于传递服务列表

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

- **修改内容**：
    - 添加 `requestBackgroundServices` 消息类型
    - 添加 `stopService` 消息类型
    - 添加 `serviceId` 字段

### 2. 新创建的文件

#### `src/integrations/terminal/ServiceManager.ts`

- **功能**：服务生命周期管理核心类
- **主要方法**：

    - `startService()` - 启动服务
    - `stopService()` - 停止服务
    - `getService()` - 获取服务信息
    - `listServices()` - 列出所有运行中的服务（包括正在停止的服务，只排除已完全停止或失败的服务）
    - `getServiceLogs()` - 获取服务日志
    - `onServiceStatusChange()` - 注册状态变化回调

- **服务状态**：

    - `pending` - 等待启动
    - `starting` - 启动中
    - `ready` - 已就绪
    - `running` - 运行中
    - `stopping` - 停止中
    - `stopped` - 已停止
    - `failed` - 失败

- **特性**：
    - 支持日志模式匹配检测就绪状态
    - 支持 HTTP 健康检查
    - 自动收集和限制日志行数
    - 状态变化通知机制

#### `webview-ui/src/components/chat/BackgroundTasksBadge.tsx`

- **功能**：前端后台任务显示组件（按钮）
- **位置**：位于 `ChatTextArea` 组件的底部状态栏右侧，与 `IndexingStatusBadge` 并列显示
- **显示条件**：仅当有运行中的服务（状态为 `starting`、`ready`、`running` 或 `stopping`）时显示，否则不渲染
- **多语言支持**：组件已完全国际化，支持所有 18 种语言（ca, de, en, es, fr, hi, id, it, ja, ko, nl, pl, pt-BR, ru, tr, vi, zh-CN, zh-TW）
    - 使用 `useAppTranslation` hook 获取翻译
    - 所有文本均从 `common.json` 的 `backgroundTasks` 命名空间读取
    - 翻译键包括：`title`、`ariaLabel`、`tooltip`、`stopService` 和状态文本（`status.starting`、`status.ready`、`status.running`、`status.stopping`、`status.failed`）
- **按钮设计**：
    - 使用 `Server` 图标（lucide-react）
    - 显示运行中的服务数量（数字徽章）
    - 当有服务处于 `starting` 状态时，显示黄色脉冲动画指示点
    - 按钮样式：ghost 变体，小尺寸，半透明背景，悬停时高亮
    - 工具提示：使用翻译键 `common:backgroundTasks.tooltip`，支持动态数量显示
- **交互方式**：
    - 点击按钮打开弹出窗口（Popover）
    - 弹出窗口宽度 320px，右对齐显示
- **弹出窗口内容**：
    - 标题：使用翻译键 `common:backgroundTasks.title`
    - 服务列表：每个服务显示为卡片形式
        - 状态指示点：彩色圆点（黄色=启动中，绿色=就绪，蓝色=运行中，橙色=停止中，红色=失败）
        - 命令名称：截断显示（最多 35 字符），使用等宽字体
        - 状态文本：使用翻译键 `common:backgroundTasks.status.*`，根据当前语言显示对应翻译
        - PID 信息：如果可用，显示进程 ID
        - 停止按钮：每个服务右侧提供 X 图标按钮，工具提示使用翻译键 `common:backgroundTasks.stopService`
            - 点击停止按钮时会阻止事件冒泡，确保消息正确发送到后端
            - 停止操作会立即更新服务状态并通知前端
            - 服务在停止过程中会显示为 `stopping` 状态，只有完全停止后才会从列表中移除
- **数据更新**：
    - 组件挂载时请求初始服务列表（`requestBackgroundServices`）
    - 监听 `backgroundServicesUpdate` 消息，自动更新服务列表
    - 状态变化时实时反映在 UI 上

### 3. 核心逻辑修改

#### `src/core/tools/ExecuteCommandTool.ts`

- **新增方法**：

    1. `detectServiceCommand(command: string): boolean`

        - 自动检测命令是否为服务命令
        - 支持 70+ 种常见开发服务器命令模式
        - 涵盖 JavaScript/TypeScript、Python、Ruby、Java、Go、Rust、PHP、C#/.NET、Dart/Flutter、Swift、Kotlin、Elixir、Clojure、Scala、Haskell 等

    2. `getReadyPattern(command: string): string | undefined`

        - 根据命令返回对应的就绪模式
        - 针对不同框架提供精确的就绪检测模式
        - 包含通用后备模式

    3. `executeServiceCommand()` - 执行服务模式命令

        - 使用 ServiceManager 启动服务
        - 等待服务就绪（通过 readyPattern 或 healthCheckUrl）
        - 立即返回，不阻塞执行链

    4. `waitForServiceReady()` - 等待服务就绪
    5. `waitForPattern()` - 等待日志模式匹配
    6. `waitForHealthCheck()` - 等待 HTTP 健康检查通过

- **修改方法**：
    - `execute()` - 添加服务命令自动检测逻辑
    - `executeCommandInTerminal()` - 添加 service 模式分支处理

#### `src/core/webview/webviewMessageHandler.ts`

- **新增消息处理**：

    1. `requestBackgroundServices`

        - 获取当前运行中的服务列表
        - 返回服务信息（serviceId、command、status、pid 等）

    2. `stopService`
        - 停止指定的服务
        - 更新服务列表并通知前端

#### `src/core/webview/ClineProvider.ts`

- **新增方法**：

    - `initializeServiceStatusUpdates()` - 初始化服务状态更新机制
        - 注册 ServiceManager 状态变化回调
        - 自动向前端推送服务状态更新

- **修改位置**：
    - 在构造函数中调用 `initializeServiceStatusUpdates()`

#### `webview-ui/src/components/chat/ChatTextArea.tsx`

- **修改内容**：
    - 导入 `BackgroundTasksBadge` 组件
    - 在底部状态栏添加 `<BackgroundTasksBadge />` 组件

## 工作流程

### 服务命令执行流程

1. **命令检测**

    - AI 或用户执行命令
    - `ExecuteCommandTool.execute()` 调用 `detectServiceCommand()` 检测
    - 如果匹配服务模式，设置 `mode: "service"`

2. **服务启动**

    - `executeCommandInTerminal()` 检测到 `mode === "service"`
    - 调用 `executeServiceCommand()`
    - `ServiceManager.startService()` 启动服务
    - 发送 `service_started` 状态到前端

3. **就绪检测**

    - 如果提供了 `readyPattern`，监听日志匹配
    - 如果提供了 `healthCheckUrl`，定期进行 HTTP 检查
    - 匹配成功或健康检查通过后，发送 `service_ready` 状态

4. **非阻塞返回**

    - 服务就绪后立即返回
    - 不等待进程结束
    - 后续命令可以继续执行
    - **AI 会收到明确的返回消息**：`Service started with ID: ${serviceId}. Status: ${status}. The service is running in the background.`
    - AI 知道任务已经变成后台任务，可以继续执行后续命令

5. **状态管理**

    - ServiceManager 持续跟踪服务状态
    - 状态变化时通过回调通知 ClineProvider
    - ClineProvider 推送更新到前端

6. **前端显示**
    - BackgroundTasksBadge 按钮组件在底部状态栏显示
    - 组件监听 `backgroundServicesUpdate` 消息，自动更新服务列表
    - 按钮显示运行中的服务数量，带有 Server 图标
    - 点击按钮打开弹出窗口，显示所有运行中服务的详细信息：
        - 服务命令（截断显示）
        - 服务状态（启动中/就绪/运行中等）
        - 进程 ID（如果可用）
        - 每个服务提供停止按钮（X 图标）
    - 用户可以点击弹出窗口中的停止按钮终止指定服务
    - 当所有服务停止后，按钮自动隐藏

## 支持的服务命令模式

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

- `swift run` (Vapor 等)
- `vapor serve`

### Kotlin

- `./gradlew run` (Ktor 等)
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

### 其他

- `docker-compose up`
- `docker up -d`
- `hugo server`
- `jekyll serve`
- `hexo server`
- `mkdocs serve`
- `sphinx-autobuild`

## 就绪模式示例

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

## 技术细节

### 服务状态机

```
pending → starting → ready → running
                    ↓
                 stopping → stopped
                    ↓
                  failed
```

### 日志管理

- 默认最多保存 1000 行日志
- 自动移除最旧的日志
- 支持查询最近 N 行日志

### 健康检查

- 默认间隔：1000ms
- 超时时间：2000ms
- 成功即停止检查

### 超时设置

- 默认就绪超时：60 秒
- Docker 相关命令：120 秒

## 使用示例

### 如何看到 BackgroundTasksBadge 按钮？

**重要提示**：按钮只在有运行中的服务时才会显示。如果没有服务在运行，按钮不会出现（这是正常的设计行为）。

要看到按钮，您需要：

1. 执行一个服务命令（如 `npm run dev`、`python manage.py runserver` 等）
2. 等待服务启动并进入 `starting`、`ready`、`running` 或 `stopping` 状态
3. 按钮会自动出现在底部状态栏右侧（Server 图标 + 服务数量）

### AI 执行服务命令

```bash
npm run dev
```

系统会自动：

1. 检测为服务命令
2. 启动服务
3. 等待就绪（匹配 "Local:.\*http://localhost" 模式）
4. 立即返回，不阻塞
5. **AI 收到返回消息**：`Service started with ID: xxx. Status: ready. The service is running in the background.`
6. **按钮自动出现在底部状态栏右侧**，显示运行中的服务数量

### 用户停止服务

1. 在底部状态栏右侧找到 BackgroundTasksBadge 按钮（Server 图标 + 服务数量）
2. 点击按钮打开弹出窗口，查看所有运行中的服务
3. 在弹出窗口中，找到要停止的服务
4. 点击该服务右侧的 X 图标按钮
5. 服务状态立即变为 `stopping`（停止中），显示橙色状态指示点
6. 系统等待服务进程完全终止
7. 服务完全停止后，状态变为 `stopped` 或 `failed`，从列表中移除
8. 如果所有服务都已停止，按钮自动隐藏

## 注意事项

1. **服务命令自动检测**：系统会自动识别常见服务命令，无需手动指定 `mode: "service"`

2. **就绪检测**：如果命令匹配失败或没有提供就绪模式，系统会等待 2 秒后直接返回

3. **进程管理**：服务进程由 ServiceManager 管理，确保正确终止和清理

4. **状态同步**：服务状态变化会自动同步到前端，无需手动刷新

5. **多服务支持**：可以同时运行多个服务，每个服务有独立的 serviceId

6. **多语言支持**：BackgroundTasksBadge 组件已完全国际化
    - 支持所有 18 种语言：ca, de, en, es, fr, hi, id, it, ja, ko, nl, pl, pt-BR, ru, tr, vi, zh-CN, zh-TW
    - 翻译文件位于 `webview-ui/src/i18n/locales/{语言代码}/common.json`
    - 所有 UI 文本都会根据用户的语言设置自动切换
    - 翻译键统一使用 `common:backgroundTasks.*` 命名空间

## 服务启动失败处理

当服务启动失败时，系统会按照以下机制进行处理：

### AI 失败通知总结

**AI 会收到失败通知的情况**：

- ✅ **启动阶段失败**：AI 会立即收到错误消息（通过 `pushToolResult` 传递）
- ✅ **就绪检测阶段失败**：AI 会立即收到错误消息（通过 `pushToolResult` 传递）

**AI 不会收到失败通知的情况**：

- ❌ **运行中意外退出**：AI 不会收到新的错误消息（因为 `executeServiceCommand` 已经返回了成功消息），但前端 UI 会通过状态更新机制显示失败状态

**代码流程**：

1. `execute()` → `executeCommandInTerminal()` → `executeServiceCommand()`
2. `executeServiceCommand()` 返回 `[boolean, ToolResponse]`
3. 返回值通过 `pushToolResult(result)` 传递给 AI
4. 前两种失败情况在 `executeServiceCommand()` 返回时就会传递错误消息给 AI
5. 第三种情况是异步的，`executeServiceCommand()` 已经返回了，所以不会再次调用 `pushToolResult`

### 失败场景分类

1. **启动阶段失败**

    - **触发条件**：`ServiceManager.startService()` 抛出异常
    - **常见原因**：
        - 工作目录不存在
        - 命令执行失败（如命令不存在、权限不足等）
        - 终端创建失败
    - **处理流程**：
        - 捕获异常并提取错误信息
        - 发送 `service_failed` 状态到前端，包含 `reason` 字段说明失败原因
        - 返回错误消息给 AI：`Failed to start service: ${errorMessage}`
        - **AI 会收到明确的失败通知**，可以据此采取后续行动（如检查命令、修复配置等）

2. **就绪检测阶段失败**

    - **触发条件**：`waitForServiceReady()` 超时或失败
    - **常见原因**：
        - 就绪模式（`readyPattern`）在超时时间内未匹配
        - HTTP 健康检查（`healthCheckUrl`）持续失败
        - 服务进程在启动过程中意外退出（此时 `onShellExecutionComplete` 回调会将状态设置为 `failed`，但 `waitForServiceReady` 仍会等待直到超时）
    - **处理流程**：
        - `waitForPattern` 或 `waitForHealthCheck` 超时后抛出错误
        - 在 `executeServiceCommand` 的 catch 块中，将服务状态设置为 `failed`
        - 发送 `service_failed` 状态到前端，包含失败原因（如 `Service ready pattern not matched within ${timeoutMs}ms`）
        - 返回错误消息给 AI：`Service failed to become ready: ${errorMessage}`
        - **注意**：如果服务进程在等待就绪时退出，`onShellExecutionComplete` 回调会立即将状态设置为 `failed`，但 `waitForServiceReady` 不会立即检测到，会继续等待直到超时
        - **AI 会收到明确的失败通知**，可以检查服务日志或重新尝试启动

3. **运行中意外退出**
    - **触发条件**：服务进程意外退出且退出码不为 0
    - **常见原因**：
        - 服务代码错误导致崩溃
        - 资源不足（内存、端口占用等）
        - 依赖服务不可用
    - **处理流程**：
        - `ExecaTerminalProcess` 检测到进程退出，触发 `shell_execution_complete` 事件
        - ServiceManager 的 `onShellExecutionComplete` 回调被调用
        - 根据退出码判断：退出码为 0 则标记为 `stopped`，非 0 则标记为 `failed`
        - 调用 `notifyStatusChange` 更新服务状态并通知前端（通过 ClineProvider 推送状态更新）
        - **注意**：这种情况是异步处理的，不会立即返回错误消息给 AI（因为 `executeServiceCommand` 已经返回了），而是通过状态更新机制通知前端
        - **失败的服务会保留在列表中**，不会自动移除，用户可以在 UI 中看到失败状态

### 失败状态显示

- **前端 UI**：

    - 失败的服务会在 BackgroundTasksBadge 弹出窗口中显示
    - 状态指示点显示为**红色**（`failed` 状态）
    - 状态文本显示为"失败"（根据用户语言设置显示对应翻译）
    - 用户可以查看失败的服务信息（命令、PID、启动时间等）

- **服务列表**：
    - `failed` 状态的服务会保留在 `ServiceManager` 的服务列表中
    - `listServices()` 方法会包含 `failed` 状态的服务
    - 用户可以通过 UI 查看失败的服务，并手动清理或重试

### AI 处理建议

当 AI 收到服务启动失败的通知时，可以采取以下行动：

1. **检查错误信息**：根据返回的错误消息（`reason` 字段）判断失败原因
2. **查看服务日志**：如果服务已启动但未就绪，可以查看服务日志定位问题
3. **修复问题**：根据错误原因修复配置、代码或环境问题
4. **重试启动**：修复问题后重新执行服务启动命令
5. **清理失败服务**：如果服务已失败但仍在列表中，可以建议用户通过 UI 手动清理

### 错误消息示例

- **启动失败**：`Failed to start service: Working directory '/path/to/dir' does not exist.`
- **就绪超时（模式匹配）**：`Service failed to become ready: Service ready pattern not matched within 60000ms`
- **就绪超时（健康检查）**：`Service failed to become ready: Health check failed within 60000ms`
- **进程退出**：服务状态通过 `onShellExecutionComplete` 回调异步更新为 `failed`，前端会通过状态更新机制显示失败状态（不会立即返回错误消息给 AI）

### 注意事项

1. **失败服务不会自动清理**：`failed` 状态的服务会保留在列表中，需要用户手动处理或系统重启后清理
2. **进程可能仍在运行**：就绪检测失败时，服务进程可能仍在后台运行，需要手动终止
3. **错误信息传递**：
    - **启动阶段失败**和**就绪检测阶段失败**：会立即返回错误消息给 AI，AI 可以立即采取行动
    - **运行中意外退出**：通过异步状态更新机制通知前端，不会立即返回错误消息给 AI（因为 `executeServiceCommand` 已经返回），但前端 UI 会显示失败状态
4. **状态更新机制**：服务状态变化通过 `ServiceManager.notifyStatusChange()` → `ClineProvider` → 前端的方式传递，确保前端 UI 能实时反映服务状态

## 未来改进方向

1. **服务配置持久化**：保存服务配置，重启后恢复
2. **服务日志查看**：提供更详细的日志查看界面
3. **服务依赖管理**：支持服务之间的依赖关系
4. **自定义就绪检测**：允许用户自定义就绪检测逻辑
5. **服务性能监控**：添加 CPU、内存使用率监控

## 测试建议

1. **基本功能测试**

    - 执行 `npm run dev`，验证服务启动和就绪检测
    - 验证底部状态栏右侧显示 BackgroundTasksBadge 按钮
    - 验证按钮显示正确的服务数量
    - 验证点击按钮打开弹出窗口
    - 验证弹出窗口显示服务详情（命令、状态、PID）
    - 验证点击停止按钮可以终止服务
    - 验证服务停止后按钮自动更新或隐藏

2. **多服务测试**

    - 同时启动多个服务
    - 验证所有服务正确显示
    - 验证独立停止功能

3. **异常情况测试**

    - 服务启动失败
    - 服务超时未就绪
    - 服务意外退出

4. **不同框架测试**
    - 测试各种框架的服务命令
    - 验证就绪模式匹配准确性

## 测试 Prompt（用于空项目测试）

以下是一个完整的测试 prompt，可以在一个空项目中测试 roocode 的服务模式功能：

```
请帮我创建一个简单的 Next.js 项目来测试开发服务器功能。

要求：
1. 创建一个新的 Next.js 项目（使用 TypeScript）
2. 配置基本的开发环境（package.json、tsconfig.json 等）
3. 创建一个简单的首页，显示 "Hello, RooCode Service Mode Test"
4. 启动开发服务器（使用 npm run dev 或 pnpm dev）

请按步骤执行：
- 首先初始化项目结构
- 安装必要的依赖
- 创建基础文件
- 最后启动开发服务器

注意：启动开发服务器后，请告诉我服务是否成功启动，以及是否收到了服务在后台运行的通知。
```

### 测试 Prompt 说明

这个 prompt 设计用于测试以下功能：

1. **服务命令自动检测**：当执行 `npm run dev` 时，roocode 应该自动识别这是一个服务命令
2. **服务启动和就绪检测**：系统应该启动服务并等待就绪（匹配 "Local:.\*http://localhost" 模式）
3. **非阻塞执行**：服务启动后应该立即返回，不阻塞后续命令执行
4. **AI 反馈**：AI 应该收到类似 "Service started with ID: xxx. Status: ready. The service is running in the background." 的返回消息
5. **UI 显示**：底部状态栏右侧应该自动显示 BackgroundTasksBadge 按钮，显示运行中的服务数量
6. **服务管理**：用户可以通过点击按钮查看服务详情并停止服务

### 预期测试结果

执行上述 prompt 后，应该观察到：

1. ✅ 项目成功创建并配置完成
2. ✅ 开发服务器成功启动
3. ✅ AI 收到服务在后台运行的通知
4. ✅ 底部状态栏右侧出现 Server 图标按钮，显示服务数量（如 "1"）
5. ✅ 点击按钮可以打开弹出窗口，查看服务详情（命令、状态、PID）
6. ✅ 可以通过弹出窗口中的停止按钮终止服务
7. ✅ 服务停止后，按钮自动隐藏

### 其他测试场景的 Prompt

#### 测试多服务场景

```
请帮我创建两个独立的项目：
1. 一个 Next.js 前端项目（端口 3000）
2. 一个简单的 Node.js Express API 项目（端口 3001）

然后同时启动两个开发服务器，验证它们都能在后台运行。
```

#### 测试 Python 服务

```
请帮我创建一个简单的 Flask 应用：
1. 创建 requirements.txt 和基本的 Flask 应用文件
2. 启动 Flask 开发服务器（flask run 或 python app.py）

验证服务是否正确启动并在后台运行。
```

#### 测试服务停止功能

```
请启动一个开发服务器，然后：
1. 验证服务在后台运行
2. 通过 UI 停止服务
3. 验证服务已正确终止
```
