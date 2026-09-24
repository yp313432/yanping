import { i as fromNodeHandler } from "../_libs/h3+rou3+srvx.mjs";
import { Rr as number, Ur as string, Wr as union, zr as object } from "../_libs/modelcontextprotocol__core+zod.mjs";
import { n as createMcpHandler, r as McpServer, t as toNodeHandler } from "../_libs/@modelcontextprotocol/node+[...].mjs";
//#region src/lib/time.ts
var WEEKDAYS = [
	"星期日",
	"星期一",
	"星期二",
	"星期三",
	"星期四",
	"星期五",
	"星期六"
];
var WEEKDAYS_SHORT = [
	"日",
	"一",
	"二",
	"三",
	"四",
	"五",
	"六"
];
var SHICHEN = [
	{
		earthly: "子",
		name: "子时",
		poetic: "夜半",
		range: "23:00–01:00"
	},
	{
		earthly: "丑",
		name: "丑时",
		poetic: "鸡鸣",
		range: "01:00–03:00"
	},
	{
		earthly: "寅",
		name: "寅时",
		poetic: "平旦",
		range: "03:00–05:00"
	},
	{
		earthly: "卯",
		name: "卯时",
		poetic: "日出",
		range: "05:00–07:00"
	},
	{
		earthly: "辰",
		name: "辰时",
		poetic: "食时",
		range: "07:00–09:00"
	},
	{
		earthly: "巳",
		name: "巳时",
		poetic: "隅中",
		range: "09:00–11:00"
	},
	{
		earthly: "午",
		name: "午时",
		poetic: "日中",
		range: "11:00–13:00"
	},
	{
		earthly: "未",
		name: "未时",
		poetic: "日昳",
		range: "13:00–15:00"
	},
	{
		earthly: "申",
		name: "申时",
		poetic: "晡时",
		range: "15:00–17:00"
	},
	{
		earthly: "酉",
		name: "酉时",
		poetic: "日入",
		range: "17:00–19:00"
	},
	{
		earthly: "戌",
		name: "戌时",
		poetic: "黄昏",
		range: "19:00–21:00"
	},
	{
		earthly: "亥",
		name: "亥时",
		poetic: "人定",
		range: "21:00–23:00"
	}
];
var SOLAR_TERMS = [
	{
		m: 1,
		d: 5,
		name: "小寒",
		season: "冬"
	},
	{
		m: 1,
		d: 20,
		name: "大寒",
		season: "冬"
	},
	{
		m: 2,
		d: 4,
		name: "立春",
		season: "春"
	},
	{
		m: 2,
		d: 19,
		name: "雨水",
		season: "春"
	},
	{
		m: 3,
		d: 6,
		name: "惊蛰",
		season: "春"
	},
	{
		m: 3,
		d: 21,
		name: "春分",
		season: "春"
	},
	{
		m: 4,
		d: 5,
		name: "清明",
		season: "春"
	},
	{
		m: 4,
		d: 20,
		name: "谷雨",
		season: "春"
	},
	{
		m: 5,
		d: 6,
		name: "立夏",
		season: "夏"
	},
	{
		m: 5,
		d: 21,
		name: "小满",
		season: "夏"
	},
	{
		m: 6,
		d: 6,
		name: "芒种",
		season: "夏"
	},
	{
		m: 6,
		d: 21,
		name: "夏至",
		season: "夏"
	},
	{
		m: 7,
		d: 7,
		name: "小暑",
		season: "夏"
	},
	{
		m: 7,
		d: 23,
		name: "大暑",
		season: "夏"
	},
	{
		m: 8,
		d: 8,
		name: "立秋",
		season: "秋"
	},
	{
		m: 8,
		d: 23,
		name: "处暑",
		season: "秋"
	},
	{
		m: 9,
		d: 8,
		name: "白露",
		season: "秋"
	},
	{
		m: 9,
		d: 23,
		name: "秋分",
		season: "秋"
	},
	{
		m: 10,
		d: 8,
		name: "寒露",
		season: "秋"
	},
	{
		m: 10,
		d: 23,
		name: "霜降",
		season: "秋"
	},
	{
		m: 11,
		d: 7,
		name: "立冬",
		season: "冬"
	},
	{
		m: 11,
		d: 22,
		name: "小雪",
		season: "冬"
	},
	{
		m: 12,
		d: 7,
		name: "大雪",
		season: "冬"
	},
	{
		m: 12,
		d: 22,
		name: "冬至",
		season: "冬"
	}
];
function pad(n) {
	return n.toString().padStart(2, "0");
}
function zonedContext(at, timeZone) {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	});
	const parts = {};
	for (const part of fmt.formatToParts(at)) parts[part.type] = part.value;
	const year = Number(parts.year ?? 0);
	const month = Number(parts.month ?? 1);
	const day = Number(parts.day ?? 1);
	const hour = Number(parts.hour ?? 0) % 24;
	const minute = Number(parts.minute ?? 0);
	const second = Number(parts.second ?? 0);
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	const offsetMs = Date.UTC(year, month - 1, day, hour, minute, second) - (at - at % 1e3);
	const offsetMinutes = Math.round(offsetMs / 6e4);
	const sign = offsetMinutes >= 0 ? "+" : "−";
	const abs = Math.abs(offsetMinutes);
	return {
		year,
		month,
		day,
		hour,
		minute,
		second,
		weekday,
		offsetLabel: `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`,
		dayMs: hour * 36e5 + minute * 6e4 + second * 1e3 + at % 1e3
	};
}
function getShichen(hour) {
	return SHICHEN[Math.floor((hour + 1) % 24 / 2)] ?? SHICHEN[0];
}
function getSolarTerm(month, day) {
	let current = SOLAR_TERMS[SOLAR_TERMS.length - 1];
	for (const term of SOLAR_TERMS) if (month > term.m || month === term.m && day >= term.d) current = term;
	else break;
	return {
		name: current.name,
		season: current.season
	};
}
function getTimeOfDay(hour) {
	if (hour < 5) return {
		key: "night",
		label: "凌晨",
		greeting: "夜深了"
	};
	if (hour < 7) return {
		key: "dawn",
		label: "清晨",
		greeting: "清晨好"
	};
	if (hour < 11) return {
		key: "morning",
		label: "上午",
		greeting: "上午好"
	};
	if (hour < 13) return {
		key: "noon",
		label: "中午",
		greeting: "中午好"
	};
	if (hour < 17) return {
		key: "afternoon",
		label: "下午",
		greeting: "下午好"
	};
	if (hour < 19) return {
		key: "dusk",
		label: "傍晚",
		greeting: "傍晚好"
	};
	if (hour < 22) return {
		key: "evening",
		label: "晚上",
		greeting: "晚上好"
	};
	return {
		key: "night",
		label: "深夜",
		greeting: "夜深了"
	};
}
function dayOfYear(year, month, day) {
	const start = Date.UTC(year, 0, 0);
	const cur = Date.UTC(year, month - 1, day);
	return Math.round((cur - start) / 864e5);
}
function weekOfYear(year, month, day) {
	const t = new Date(Date.UTC(year, month - 1, day));
	const dayNum = t.getUTCDay() || 7;
	t.setUTCDate(t.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
	return Math.ceil(((t.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
}
function buildTemporalContext(at = Date.now(), timezone = defaultTimezone()) {
	const z = zonedContext(at, timezone);
	const tod = getTimeOfDay(z.hour);
	const shichen = getShichen(z.hour);
	const solar = getSolarTerm(z.month, z.day);
	return {
		at,
		iso: new Date(at).toISOString(),
		timezone,
		utcOffset: z.offsetLabel,
		year: z.year,
		month: z.month,
		day: z.day,
		localeDate: `${z.year}年${z.month}月${z.day}日`,
		weekday: WEEKDAYS[z.weekday] ?? "",
		weekdayShort: WEEKDAYS_SHORT[z.weekday] ?? "",
		time: `${pad(z.hour)}:${pad(z.minute)}:${pad(z.second)}`,
		timeShort: `${pad(z.hour)}:${pad(z.minute)}`,
		hour: z.hour,
		minute: z.minute,
		second: z.second,
		timeOfDay: tod.key,
		timeOfDayLabel: tod.label,
		shichen,
		season: solar.season,
		solarTerm: solar,
		dayOfYear: dayOfYear(z.year, z.month, z.day),
		weekOfYear: weekOfYear(z.year, z.month, z.day),
		isWeekend: z.weekday === 0 || z.weekday === 6,
		greeting: tod.greeting,
		dayProgress: z.dayMs / 864e5
	};
}
function defaultTimezone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
	} catch {
		return "Local";
	}
}
var MIN = 6e4;
var HOUR = 60 * MIN;
var DAY = 24 * HOUR;
var WEEK = 7 * DAY;
function describeDuration(ms) {
	const abs = Math.max(0, Math.round(ms));
	if (abs < 15e3) return "刚刚";
	if (abs < MIN) return `${Math.max(1, Math.round(abs / 1e3))} 秒`;
	if (abs < HOUR) return `${Math.round(abs / MIN)} 分钟`;
	if (abs < DAY) {
		const h = Math.floor(abs / HOUR);
		const m = Math.round(abs % HOUR / MIN);
		return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
	}
	if (abs < WEEK * 8) {
		const d = Math.floor(abs / DAY);
		const h = Math.round(abs % DAY / HOUR);
		return h > 0 ? `${d} 天 ${h} 小时` : `${d} 天`;
	}
	const months = Math.floor(abs / (DAY * 30));
	if (months >= 1) {
		const remDays = Math.floor(abs % (DAY * 30) / DAY);
		return remDays > 0 ? `${months} 个月 ${remDays} 天` : `${months} 个月`;
	}
	return `${Math.floor(abs / WEEK)} 周`;
}
/** 供 MCP `get_conversation_gap` 与 UI「时间间隔测试」共用的纯数据结果。 */
function buildConversationGapResult(now, previousAt) {
	const nowIso = new Date(now).toISOString();
	if (previousAt == null) return {
		hasPrevious: false,
		previousAt: null,
		now: nowIso,
		durationMs: 0,
		humanReadable: "尚未有过交互"
	};
	const durationMs = Math.max(0, now - previousAt);
	return {
		hasPrevious: true,
		previousAt: new Date(previousAt).toISOString(),
		now: nowIso,
		durationMs,
		humanReadable: describeDuration(durationMs)
	};
}
//#endregion
//#region server/mcp/index.ts
var SERVER_NAME = "shigan-mcp";
var SERVER_VERSION = "1.0.0";
var TOOL_DESCRIPTIONS = {
	get_current_time: "返回当前日期与时间（可指定时区），包含 ISO 时间、日期、时间、时区、星期与时段。",
	get_temporal_context: "返回完整「时感」：日期、时间、时区、星期、时段、十二时辰、节气与时间戳。",
	get_conversation_gap: "计算「距离上一次交互过去了多久」。传入 previousAt（ISO 时间）返回间隔；未传则明确返回 hasPrevious: false。"
};
function pad2(n) {
	return n.toString().padStart(2, "0");
}
function resolveAt(at) {
	if (at == null) return Date.now();
	if (typeof at === "number") return at;
	const t = Date.parse(at);
	return Number.isNaN(t) ? Date.now() : t;
}
function resolveTimezone(timezone) {
	return timezone && timezone.trim() ? timezone.trim() : defaultTimezone();
}
var currentTimeInputSchema = object({
	timezone: string().optional().describe("IANA 时区，例如 Asia/Shanghai；缺省使用项目默认时区"),
	at: union([string(), number()]).optional().describe("可选时间戳（ISO 字符串或 epoch 毫秒），缺省为当前时刻")
});
var temporalContextInputSchema = object({
	timezone: string().optional().describe("IANA 时区，缺省使用项目默认时区"),
	at: union([string(), number()]).optional().describe("可选时间戳，缺省为当前时刻")
});
var conversationGapInputSchema = object({
	previousAt: string().optional().describe("上一次交互时间（ISO 8601）；缺省表示没有上次记录"),
	at: union([string(), number()]).optional().describe("可选基准时间戳，缺省为当前时刻")
});
/**
* 三个工具的核心逻辑。这里返回「原始结果对象」，由调用方决定如何封装：
* - 官方 SDK 适配层（buildMcpServer）包装成 `{ content: [{ type: "text", text }] }`；
* - Horizon 入口（server.ts 的 FastMCP）直接返回对象，由 fastmcp-ts 序列化。
* 解析失败通过抛 Error 表达，调用方负责转成 isError。
*/
function runGetCurrentTime(args) {
	const ctx = buildTemporalContext(resolveAt(args.at), resolveTimezone(args.timezone));
	return {
		iso: ctx.iso,
		date: `${ctx.year}-${pad2(ctx.month)}-${pad2(ctx.day)}`,
		time: ctx.time,
		timezone: ctx.timezone,
		weekday: ctx.weekday,
		timeOfDay: ctx.timeOfDay,
		timestamp: ctx.at,
		utcOffset: ctx.utcOffset
	};
}
function runGetTemporalContext(args) {
	return buildTemporalContext(resolveAt(args.at), resolveTimezone(args.timezone));
}
function runGetConversationGap(args) {
	const now = resolveAt(args.at);
	let prev = null;
	if (args.previousAt != null && args.previousAt.trim() !== "") {
		const t = Date.parse(args.previousAt);
		if (Number.isNaN(t)) throw new Error(`无法解析 previousAt：「${args.previousAt}」。请使用 ISO 8601 时间字符串。`);
		prev = t;
	}
	return buildConversationGapResult(now, prev);
}
function buildMcpServer() {
	const server = new McpServer({
		name: SERVER_NAME,
		version: SERVER_VERSION
	});
	server.registerTool("get_current_time", {
		description: TOOL_DESCRIPTIONS.get_current_time,
		inputSchema: currentTimeInputSchema
	}, async (args) => ({ content: [{
		type: "text",
		text: JSON.stringify(runGetCurrentTime(args), null, 2)
	}] }));
	server.registerTool("get_temporal_context", {
		description: TOOL_DESCRIPTIONS.get_temporal_context,
		inputSchema: temporalContextInputSchema
	}, async (args) => ({ content: [{
		type: "text",
		text: JSON.stringify(runGetTemporalContext(args), null, 2)
	}] }));
	server.registerTool("get_conversation_gap", {
		description: TOOL_DESCRIPTIONS.get_conversation_gap,
		inputSchema: conversationGapInputSchema
	}, async (args) => {
		try {
			return { content: [{
				type: "text",
				text: JSON.stringify(runGetConversationGap(args), null, 2)
			}] };
		} catch (err) {
			return {
				isError: true,
				content: [{
					type: "text",
					text: err instanceof Error ? err.message : String(err)
				}]
			};
		}
	});
	return server;
}
var mcpHandler = createMcpHandler(() => buildMcpServer());
//#endregion
//#region server/routes/mcp.ts
/**
* Nitro（生产 / preview）侧的 /mcp 挂载。
* 与 vite.config.ts 里的开发侧中间件共用同一个 `mcpHandler`，
* 因此 Web App 与 MCP Server 属于同一个运行环境、同一套时间核心逻辑。
*/
var mcp_default = fromNodeHandler(toNodeHandler(mcpHandler));
//#endregion
export { mcp_default as default };
