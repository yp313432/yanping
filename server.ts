import { FastMCP } from "@prefecthq/fastmcp-ts/server";
import {
  SERVER_NAME,
  SERVER_VERSION,
  TOOL_DESCRIPTIONS,
  conversationGapInputSchema,
  currentTimeInputSchema,
  runGetConversationGap,
  runGetCurrentTime,
  runGetTemporalContext,
  temporalContextInputSchema,
} from "./server/mcp/index.ts";

/**
 * Prefect Horizon 的 MCP 启动入口。
 *
 * Horizon 要求 TypeScript entrypoint 导出 `@prefecthq/fastmcp-ts` 的
 * `FastMCP` 实例（不支持直接基于官方 MCP SDK v2 的对象）。这里新建一个
 * FastMCP 实例，并直接复用 `server/mcp/index.ts` 里同一套工具核心逻辑——
 * 三个工具只有一份实现，Web App 的 /mcp 与 Horizon 的 MCP 服务共享它。
 *
 * 本文件不调用 `run()`：由 Horizon（或本地 `npx fastmcp run server.ts`）
 * 负责以 HTTP transport 启动。Horizon 的 Entrypoint 填写：
 *   `server.ts:server`（或 `server.ts`，自动检测 default/server 导出）。
 */
const server = new FastMCP({ name: SERVER_NAME, version: SERVER_VERSION });

server.tool(
  {
    name: "get_current_time",
    description: TOOL_DESCRIPTIONS.get_current_time,
    input: currentTimeInputSchema,
  },
  (args) => runGetCurrentTime(args),
);

server.tool(
  {
    name: "get_temporal_context",
    description: TOOL_DESCRIPTIONS.get_temporal_context,
    input: temporalContextInputSchema,
  },
  (args) => runGetTemporalContext(args),
);

server.tool(
  {
    name: "get_conversation_gap",
    description: TOOL_DESCRIPTIONS.get_conversation_gap,
    input: conversationGapInputSchema,
  },
  (args) => runGetConversationGap(args),
);

export { server };
export default server;