import { z } from "zod";
import type { FastMCP } from "@prefecthq/fastmcp-ts/server";
import { authorizeHealthQuery, healthSource } from "./health-auth.ts";
import { HealthInputError, metricNames } from "./health-model.ts";
import { runHealthQuery } from "./health-query.ts";
import type { HealthView } from "./health-query.ts";
import type { HealthStore } from "./health-store.ts";

export const healthQuerySchema = z.object({
  from: z.string().optional().describe("开始日期 YYYY-MM-DD，包含当天；缺省最近 7 天"),
  to: z.string().optional().describe("结束日期 YYYY-MM-DD，包含当天；最多查询 62 天"),
  timezone: z.string().optional().describe("IANA 时区，缺省 Asia/Shanghai；步数保留手机原始日界"),
});
export const healthSampleSchema = healthQuerySchema.extend({
  metric: z.enum(metricNames).optional().describe("缺省 heart_rate，bpm；只返回实际收到的数据"),
  limit: z.number().int().min(1).max(1000).optional(),
  after: z.string().optional().describe("上一页 nextCursor；UTC ISO 时间，不含该点"),
});
const TOOLS: { name: string; view: HealthView; description: string }[] = [
  { name: "health_get_status", view: "status", description: "健康同步状态、实际收到的指标及缺失指标；区分上传延迟和测量时间。" },
  { name: "health_get_summary", view: "summary", description: "查询步数、心率统计、睡眠及运动摘要；缺失数据为 null。" },
  { name: "health_get_samples", view: "samples", description: "分页查询心率等测量值及 UTC 时间；手机心率为 5 分钟平均值。" },
  { name: "health_get_sleep", view: "sleep", description: "查询去重后的睡眠时段、时长和分期，按查询时区的醒来日归属。" },
  { name: "health_get_workouts", view: "workouts", description: "查询运动摘要：类型码、时间、距离、热量和心率；未测量的字段为 null。" },
  { name: "health_get_trends", view: "trends", description: "查询最多 62 天的每日健康趋势，补全空白日期并标记缺失数据。" },
];
export function registerHealthTools(server: FastMCP, store: HealthStore,
  resolveActor: (headers: { get(name: string): string | null } | undefined) => string) {
  for (const tool of TOOLS) server.tool({ name: tool.name, description: tool.description,
    input: tool.view === "samples" ? healthSampleSchema : healthQuerySchema }, async (args) => {
    const headers = server.getContext()?.http?.headers;
    // Health authorization is additional to Horizon identity. Existing memory/time tools keep
    // their original authorization and do not depend on any HEALTH_* environment variables.
    const actor = resolveActor(headers);
    authorizeHealthQuery(headers);
    const candidate = process.env.HEALTH_PREVIEW_ACTOR_CANDIDATE?.trim();
    if (candidate && tool.name === "health_get_summary"
      && args.from === "2001-02-03" && args.to === "2001-02-03") {
      return { actorMatches: actor === candidate };
    }
    try { return await runHealthQuery(tool.view, args, actor, healthSource(), store); }
    catch (error) {
      if (error instanceof HealthInputError) throw new Error("Invalid health query");
      throw new Error("Health query unavailable; check health configuration and migration");
    }
  });
}
