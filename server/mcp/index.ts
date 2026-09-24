import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  buildConversationGapResult,
  buildTemporalContext,
  defaultTimezone,
} from "../../src/lib/time.ts";

export const SERVER_NAME = "shigan-mcp";
export const SERVER_VERSION = "1.0.0";

export const TOOL_DESCRIPTIONS = {
  get_current_time:
    "返回当前日期与时间（可指定时区），包含 ISO 时间、日期、时间、时区、星期与时段。",
  get_temporal_context:
    "返回完整「时感」：日期、时间、时区、星期、时段、十二时辰、节气与时间戳。",
  get_conversation_gap:
    "计算「距离上一次交互过去了多久」。传入 previousAt（ISO 时间）返回间隔；未传则明确返回 hasPrevious: false。",
} as const;

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function resolveAt(at?: string | number): number {
  if (at == null) return Date.now();
  if (typeof at === "number") return at;
  const t = Date.parse(at);
  return Number.isNaN(t) ? Date.now() : t;
}

function resolveTimezone(timezone?: string): string {
  return timezone && timezone.trim() ? timezone.trim() : defaultTimezone();
}

export const currentTimeInputSchema = z.object({
  timezone: z
    .string()
    .optional()
    .describe("IANA 时区，例如 Asia/Shanghai；缺省使用项目默认时区"),
  at: z
    .union([z.string(), z.number()])
    .optional()
    .describe("可选时间戳（ISO 字符串或 epoch 毫秒），缺省为当前时刻"),
});

export const temporalContextInputSchema = z.object({
  timezone: z
    .string()
    .optional()
    .describe("IANA 时区，缺省使用项目默认时区"),
  at: z
    .union([z.string(), z.number()])
    .optional()
    .describe("可选时间戳，缺省为当前时刻"),
});

export const conversationGapInputSchema = z.object({
  previousAt: z
    .string()
    .optional()
    .describe("上一次交互时间（ISO 8601）；缺省表示没有上次记录"),
  at: z
    .union([z.string(), z.number()])
    .optional()
    .describe("可选基准时间戳，缺省为当前时刻"),
});

export type GetCurrentTimeArgs = {
  timezone?: string;
  at?: string | number;
};

export type GetConversationGapArgs = {
  previousAt?: string;
  at?: string | number;
};

/**
 * 三个工具的核心逻辑。这里返回「原始结果对象」，由调用方决定如何封装：
 * - 官方 SDK 适配层（buildMcpServer）包装成 `{ content: [{ type: "text", text }] }`；
 * - Horizon 入口（server.ts 的 FastMCP）直接返回对象，由 fastmcp-ts 序列化。
 * 解析失败通过抛 Error 表达，调用方负责转成 isError。
 */
export function runGetCurrentTime(args: GetCurrentTimeArgs) {
  const ctx = buildTemporalContext(resolveAt(args.at), resolveTimezone(args.timezone));
  return {
    iso: ctx.iso,
    date: `${ctx.year}-${pad2(ctx.month)}-${pad2(ctx.day)}`,
    time: ctx.time,
    timezone: ctx.timezone,
    weekday: ctx.weekday,
    timeOfDay: ctx.timeOfDay,
    timestamp: ctx.at,
    utcOffset: ctx.utcOffset,
  };
}

export function runGetTemporalContext(args: GetCurrentTimeArgs) {
  return buildTemporalContext(resolveAt(args.at), resolveTimezone(args.timezone));
}

export function runGetConversationGap(args: GetConversationGapArgs) {
  const now = resolveAt(args.at);
  let prev: number | null = null;
  if (args.previousAt != null && args.previousAt.trim() !== "") {
    const t = Date.parse(args.previousAt);
    if (Number.isNaN(t)) {
      throw new Error(
        `无法解析 previousAt：「${args.previousAt}」。请使用 ISO 8601 时间字符串。`,
      );
    }
    prev = t;
  }
  return buildConversationGapResult(now, prev);
}

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "get_current_time",
    {
      description: TOOL_DESCRIPTIONS.get_current_time,
      inputSchema: currentTimeInputSchema,
    },
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(runGetCurrentTime(args), null, 2) },
      ],
    }),
  );

  server.registerTool(
    "get_temporal_context",
    {
      description: TOOL_DESCRIPTIONS.get_temporal_context,
      inputSchema: temporalContextInputSchema,
    },
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(runGetTemporalContext(args), null, 2) },
      ],
    }),
  );

  server.registerTool(
    "get_conversation_gap",
    {
      description: TOOL_DESCRIPTIONS.get_conversation_gap,
      inputSchema: conversationGapInputSchema,
    },
    async (args) => {
      try {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(runGetConversationGap(args), null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    },
  );

  return server;
}

export const mcpHandler = createMcpHandler(() => buildMcpServer());