import { FastMCP } from "@prefecthq/fastmcp-ts/server";
import {
  SERVER_NAME,
  SERVER_VERSION,
  TOOL_DESCRIPTIONS,
  conversationGapAutoInputSchema,
  currentTimeInputSchema,
  runGetConversationGapAuto,
  runGetCurrentTime,
  runGetTemporalContext,
  temporalContextInputSchema,
} from "./server/mcp/index.ts";
import { createPostgresGapStore } from "./server/mcp/gap-store.ts";
import {
  MEMORY_TOOL_DESCRIPTIONS,
  memoryAddInputSchema,
  memoryArchiveInputSchema,
  memoryContextInputSchema,
  memorySearchInputSchema,
  memoryUpdateInputSchema,
  runMemoryAdd,
  runMemoryArchive,
  runMemoryContext,
  runMemorySearch,
  runMemoryUpdate,
} from "./server/mcp/memory.ts";
import { createPostgresMemoryStore } from "./server/mcp/memory-store.ts";

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

// 诊断用：确认部署运行时是否读到 DATABASE_URL（结果见 Horizon 服务日志）。
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "已读到" : "未读到");
// 诊断用：列出运行时环境里数据库相关的变量名（仅名字，不打印值），
// 用于判断变量有没有被 Horizon 注入、以及名字是否打错。
console.log(
  "DEBUG db env keys:",
  (Object.keys(process.env)
    .filter((k) => /DATABASE|DB|NEON|POSTGRES|PG|SQL/i.test(k))
    .sort()
    .join(", ")) || "(none)",
);

// get_conversation_gap 的持久化 store：Postgres（actor_id -> last_seen_at）。
// 连接串从 DATABASE_URL 读取，首次调用时懒建连接池与表。
const gapStore = createPostgresGapStore();

// Memory MCP 的持久化 store（memories 表）。与 gap 一样用 Postgres、按 actor 隔离。
const memoryStore = createPostgresMemoryStore();

/**
 * Horizon 网关认证通过后会剥离客户端伪造的 horizon-* 头，再注入可信的
 * horizon-actor / horizon-actor-type / horizon-actor-email。以 horizon-actor
 * 作为「用户身份」持久化主键；取不到即无法识别用户，按需求明确报错。
 */
export function resolveActorId(
  headers: { get(name: string): string | null } | undefined,
): string {
  const actorId = headers?.get("horizon-actor")?.trim();
  if (!actorId) {
    throw new Error(
      "无法识别用户身份：请求缺少 Horizon 注入的 horizon-actor 请求头。" +
        "请确认部署已启用 Horizon Authentication，并通过 Horizon 网关访问该 MCP。",
    );
  }
  return actorId;
}

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
    description: TOOL_DESCRIPTIONS.get_conversation_gap_auto,
    input: conversationGapAutoInputSchema,
  },
  async (args) => {
    // 从 FastMCP 的每请求上下文里取网关注入的用户身份。
    const ctx = server.getContext();
    const actorId = resolveActorId(ctx?.http?.headers);
    await gapStore.ready();
    return runGetConversationGapAuto(
      { at: (args as { at?: string | number }).at },
      actorId,
      gapStore,
    );
  },
);

server.tool(
  {
    name: "memory_context",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_context,
    input: memoryContextInputSchema,
  },
  async () => {
    const actorId = resolveActorId(server.getContext()?.http?.headers);
    await memoryStore.ready();
    await gapStore.ready(); // 只读读取 last_seen_at 前先确保表存在（不写数据）
    return runMemoryContext(actorId, memoryStore, gapStore);
  },
);

server.tool(
  {
    name: "memory_search",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_search,
    input: memorySearchInputSchema,
  },
  async (args) => {
    const actorId = resolveActorId(server.getContext()?.http?.headers);
    await memoryStore.ready();
    return runMemorySearch(args, actorId, memoryStore);
  },
);

server.tool(
  {
    name: "memory_add",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_add,
    input: memoryAddInputSchema,
  },
  async (args) => {
    const actorId = resolveActorId(server.getContext()?.http?.headers);
    await memoryStore.ready();
    return runMemoryAdd(args, actorId, memoryStore);
  },
);

server.tool(
  {
    name: "memory_update",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_update,
    input: memoryUpdateInputSchema,
  },
  async (args) => {
    const actorId = resolveActorId(server.getContext()?.http?.headers);
    await memoryStore.ready();
    return runMemoryUpdate(args, actorId, memoryStore);
  },
);

server.tool(
  {
    name: "memory_archive",
    description: MEMORY_TOOL_DESCRIPTIONS.memory_archive,
    input: memoryArchiveInputSchema,
  },
  async (args) => {
    const actorId = resolveActorId(server.getContext()?.http?.headers);
    await memoryStore.ready();
    return runMemoryArchive(args, actorId, memoryStore);
  },
);

export { server };
export default server;