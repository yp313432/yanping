# 时感 · Shigan

一个「有漂亮 UI 的 MCP 时间能力 App」。

它保留了一个具有进阶视觉的时间网页，同时内置一个 MCP Server，让外部 AI
（任何支持 MCP 的客户端）可以直接调用它的时间能力。

这不是一个聊天软件。

## 架构

```
        外部 AI
          │
          ▼
         MCP (/mcp)
          │
   ┌──────┴───────┐
   │              │
 时间核心      其他能力
   │
   ▼
 漂亮 Web App
```

UI 与 MCP 共用同一套核心时间逻辑 `src/lib/time.ts`，不复制算法。

## Web App

- 当前时间 / 日期 / 时钟
- 十二时辰、节气、季节、时段
- 时区（显式处理，不依赖服务器本地时区）
- PWA、响应式布局

## MCP Server

- Endpoint：`/mcp`
- 基于官方 MCP TypeScript SDK v2（`createMcpHandler`）的 Streamable HTTP。

三个工具：

| 工具 | 作用 |
| --- | --- |
| `get_current_time` | 返回当前日期与时间：`iso`、`date`、`time`、`timezone`、`weekday`、`timeOfDay` |
| `get_temporal_context` | 返回完整「时感」：日期、时间、时区、星期、时段、十二时辰、节气、时间戳 |
| `get_conversation_gap` | 计算距上一次交互过去了多久：`hasPrevious`、`previousAt`、`now`、`durationMs`、`humanReadable` |

每个工具都接受可选的 `timezone`（IANA 时区，例如 `Asia/Shanghai`）；未提供时使用项目默认时区。

## 本地启动

```bash
npm install
npm run dev
```

- Web App：http://localhost:8080
- MCP Endpoint：http://localhost:8080/mcp

## 如何测试 MCP

浏览器直接打开 `/mcp` 不是 MCP 的调用方式。请用 MCP 客户端或 Inspector 连接：

```json
{
  "mcpServers": {
    "shigan": { "url": "http://localhost:8080/mcp" }
  }
}
```

或运行项目自带的 MCP 集成测试：

```bash
npm test
```

代码质量检查：

```bash
npm run typecheck
npm run build
```

## 说明

本项目不调用任何 LLM API，不写入、不提交任何真实 API Key。