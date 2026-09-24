import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { i as Clock3, n as Sparkles, r as Rows3 } from "../_libs/lucide-react.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as Slot } from "../_libs/radix-ui__react-slot.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-vg9dUGYx.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var TOOLS = [
	{
		name: "get_current_time",
		title: "当前时间",
		desc: "此刻的日期、时间、时区、星期与时段。"
	},
	{
		name: "get_temporal_context",
		title: "完整时感",
		desc: "日期时间、十二时辰、节气与时段，合而为一。"
	},
	{
		name: "get_conversation_gap",
		title: "时间间隔",
		desc: "距离上一次交互过去了多久。"
	}
];
function CapabilitiesPanel({ now }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "flex min-h-0 flex-1 flex-col",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "border-b border-border px-4 py-3 lg:px-6",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-xs text-muted",
				suppressHydrationWarning: true,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-fg",
						children: now.greeting
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-subtle",
						children: " · "
					}),
					now.localeDate,
					" ",
					now.timeShort,
					" ",
					now.timeOfDayLabel
				]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "min-h-0 flex-1 overflow-y-auto px-4 py-8 lg:px-8",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto flex max-w-xl flex-col gap-8",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "stagger-in flex flex-col gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-xs font-medium tracking-widest text-muted",
								children: "MCP · 已就绪"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-serif text-3xl leading-snug text-fg",
								children: "时感已就绪"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm leading-relaxed text-muted",
								children: "时感内置三个时间能力，外部 AI 通过 MCP 直接调用即可，不需要复制粘贴任何提示词。"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex flex-col gap-3",
						children: TOOLS.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-xl bg-surface-2 p-4 shadow-[var(--shadow-border)]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-baseline justify-between gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm font-medium text-fg",
									children: tool.title
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
									className: "font-mono text-xs text-subtle",
									children: tool.name
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm leading-relaxed text-muted",
								children: tool.desc
							})]
						}, tool.name))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "font-mono text-xs tracking-wide text-subtle",
						children: ["Endpoint ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-fg",
							children: "/mcp"
						})]
					})
				]
			})
		})]
	});
}
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function round(n) {
	return Math.round(n * 1e3) / 1e3;
}
function ClockFace({ at, className, size = 220 }) {
	const hourRef = (0, import_react.useRef)(null);
	const minuteRef = (0, import_react.useRef)(null);
	const secondRef = (0, import_react.useRef)(null);
	const arcRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		const apply = (t) => {
			const d = new Date(t);
			const s = d.getSeconds() + d.getMilliseconds() / 1e3;
			const m = d.getMinutes() + s / 60;
			const h = d.getHours() % 12 + m / 60;
			const day = (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
			if (hourRef.current) hourRef.current.style.transform = `rotate(${h * 30}deg)`;
			if (minuteRef.current) minuteRef.current.style.transform = `rotate(${m * 6}deg)`;
			if (secondRef.current) secondRef.current.style.transform = `rotate(${s * 6}deg)`;
			if (arcRef.current) {
				const c = 2 * Math.PI * 46;
				arcRef.current.style.strokeDasharray = `${c * day} ${c}`;
			}
		};
		apply(at);
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		let frame = 0;
		const loop = () => {
			apply(Date.now());
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	}, []);
	const ticks = Array.from({ length: 60 }, (_, i) => i);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 100 100",
		width: size,
		height: size,
		className: cn("text-fg", className),
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "50",
				cy: "50",
				r: "48",
				fill: "none",
				stroke: "currentColor",
				strokeOpacity: "0.12",
				strokeWidth: "0.6"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				ref: arcRef,
				cx: "50",
				cy: "50",
				r: "46",
				fill: "none",
				stroke: "var(--color-accent)",
				strokeWidth: "0.7",
				strokeLinecap: "round",
				strokeDasharray: "0 289",
				transform: "rotate(-90 50 50)",
				opacity: "0.7"
			}),
			ticks.map((i) => {
				const major = i % 5 === 0;
				const a = i / 60 * Math.PI * 2;
				const inner = major ? 41.5 : 43.2;
				const outer = 45.6;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
					x1: round(50 + Math.sin(a) * inner),
					y1: round(50 - Math.cos(a) * inner),
					x2: round(50 + Math.sin(a) * outer),
					y2: round(50 - Math.cos(a) * outer),
					stroke: "currentColor",
					strokeOpacity: major ? .55 : .18,
					strokeWidth: major ? .7 : .35,
					strokeLinecap: "round"
				}, i);
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				ref: hourRef,
				className: "clock-hand",
				x1: "50",
				y1: "50",
				x2: "50",
				y2: "29",
				stroke: "currentColor",
				strokeWidth: "1.8",
				strokeLinecap: "round"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				ref: minuteRef,
				className: "clock-hand",
				x1: "50",
				y1: "50",
				x2: "50",
				y2: "22",
				stroke: "currentColor",
				strokeWidth: "1.1",
				strokeLinecap: "round",
				opacity: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
				ref: secondRef,
				className: "clock-hand clock-hand-second",
				x1: "50",
				y1: "56",
				x2: "50",
				y2: "18",
				stroke: "var(--color-accent)",
				strokeWidth: "0.5",
				strokeLinecap: "round"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "50",
				cy: "50",
				r: "1.6",
				fill: "var(--color-accent)"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "50",
				cy: "50",
				r: "0.7",
				fill: "var(--color-bg)"
			})
		]
	});
}
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
function formatDateTime(at, timezone = defaultTimezone()) {
	const z = zonedContext(at, timezone);
	return `${z.month}月${z.day}日 ${pad(z.hour)}:${pad(z.minute)}`;
}
function formatClockParts(at, timezone = defaultTimezone()) {
	const z = zonedContext(at, timezone);
	return {
		h: pad(z.hour),
		m: pad(z.minute),
		s: pad(z.second)
	};
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
function buildGap(now, previousAt, timezone = defaultTimezone()) {
	if (previousAt == null) return {
		ms: 0,
		human: "尚未有过交互",
		category: "first",
		previousAt: null,
		previousLabel: null
	};
	const ms = Math.max(0, now - previousAt);
	const previousLabel = formatDateTime(previousAt, timezone);
	if (ms < 5 * MIN) return {
		ms,
		human: describeDuration(ms),
		category: "continuous",
		previousAt,
		previousLabel
	};
	if (ms < 3 * HOUR) return {
		ms,
		human: describeDuration(ms),
		category: "brief",
		previousAt,
		previousLabel
	};
	const prev = zonedContext(previousAt, timezone);
	const cur = zonedContext(now, timezone);
	const sameDay = prev.year === cur.year && prev.month === cur.month && prev.day === cur.day;
	const overnight = !sameDay && ms < 36 * HOUR;
	if (sameDay && ms < DAY) return {
		ms,
		human: describeDuration(ms),
		category: "hours",
		previousAt,
		previousLabel
	};
	if (overnight) return {
		ms,
		human: describeDuration(ms),
		category: "overnight",
		previousAt,
		previousLabel
	};
	if (ms < WEEK * 2) return {
		ms,
		human: describeDuration(ms),
		category: "days",
		previousAt,
		previousLabel
	};
	if (ms < DAY * 45) return {
		ms,
		human: describeDuration(ms),
		category: "weeks",
		previousAt,
		previousLabel
	};
	return {
		ms,
		human: describeDuration(ms),
		category: "months",
		previousAt,
		previousLabel
	};
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
function timezoneLine(now) {
	if (now.timezone === "UTC") return now.utcOffset;
	return `${now.timezone} · ${now.utcOffset}`;
}
function TimeAside({ now, gap, compact }) {
	const parts = formatClockParts(now.at, now.timezone);
	if (compact) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "flex items-center gap-3 border-b border-border px-4 py-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClockFace, {
			at: now.at,
			size: 48,
			className: "shrink-0"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0 flex-1",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "font-mono text-xl tabular-nums leading-none tracking-tight",
				suppressHydrationWarning: true,
				children: [
					parts.h,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-muted",
						children: ":"
					}),
					parts.m,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-subtle",
						children: [":", parts.s]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-1 truncate text-xs text-muted",
				suppressHydrationWarning: true,
				children: [
					now.weekdayShort,
					" · ",
					now.timeOfDayLabel,
					" · ",
					now.shichen.name,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-subtle",
						children: " · "
					}),
					gap.category === "first" ? "初次" : `间隔 ${gap.human}`
				]
			})]
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
		className: "flex h-full min-h-0 flex-col gap-6 p-6 lg:p-8",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "stagger-in flex flex-col gap-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-medium tracking-widest text-muted",
					children: "时感"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 font-serif text-lg text-fg",
					children: "让 AI 感觉到时间"
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex justify-center py-2",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClockFace, {
						at: now.at,
						size: 200
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "font-mono text-5xl leading-none tracking-tight tabular-nums",
						"aria-live": "polite",
						"aria-atomic": "true",
						suppressHydrationWarning: true,
						children: [
							parts.h,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-muted",
								children: ":"
							}),
							parts.m,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "text-2xl text-subtle",
								children: [":", parts.s]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 font-serif text-lg text-fg",
						suppressHydrationWarning: true,
						children: [
							now.localeDate,
							" ",
							now.weekday
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-sm text-muted",
						suppressHydrationWarning: true,
						children: [
							now.timeOfDayLabel,
							" · ",
							now.shichen.name,
							" ",
							now.shichen.poetic,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-subtle",
								children: " · "
							}),
							now.season,
							"季 ",
							now.solarTerm.name
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-subtle",
						suppressHydrationWarning: true,
						children: timezoneLine(now)
					})
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl bg-surface-2 p-4 shadow-[var(--shadow-border)]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs font-medium tracking-wide text-muted",
							children: "距上次交互"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 font-serif text-2xl leading-snug",
							suppressHydrationWarning: true,
							children: gap.category === "first" ? "尚未有过交互" : gap.human
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-sm leading-relaxed text-muted",
							suppressHydrationWarning: true,
							children: gap.category === "first" ? "从这里开始，时间会被记住。" : gap.previousLabel ? `上次是 ${gap.previousLabel}` : ""
						})
					]
				})
			]
		})
	});
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:not-disabled:scale-[0.96] transition-[scale,background-color,color,opacity] duration-150 ease-out", {
	variants: {
		variant: {
			primary: "bg-accent text-accent-fg hover:bg-fg",
			secondary: "bg-surface-2 text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
			ghost: "bg-transparent text-muted hover:text-fg hover:bg-surface-2",
			danger: "bg-danger/15 text-danger hover:bg-danger/25"
		},
		size: {
			sm: "h-9 rounded-sm px-3 text-sm",
			md: "h-11 rounded-md px-4 text-sm",
			lg: "h-12 rounded-lg px-5 text-base",
			icon: "size-11 rounded-md"
		}
	},
	defaultVariants: {
		variant: "primary",
		size: "md"
	}
});
function Button({ className, variant, size, asChild = false, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		...props
	});
}
/** 「时间间隔测试」的演示档位，供 UI 验证 get_conversation_gap。 */
var INTERVAL_DEMOS = [
	{
		key: "2h",
		label: "两小时",
		ms: 72e5
	},
	{
		key: "overnight",
		label: "隔夜",
		ms: 504e5
	},
	{
		key: "3d",
		label: "三天",
		ms: 2592e5
	},
	{
		key: "1w",
		label: "一周",
		ms: 6048e5
	},
	{
		key: "1m",
		label: "一个月",
		ms: 2592e6
	}
];
function previousInteractionAt(lastSeenAt, simulatedLastAt) {
	return simulatedLastAt ?? lastSeenAt;
}
var useIntervalStore = create()(persist((set, get) => ({
	firstSeenAt: null,
	lastSeenAt: null,
	simulatedLastAt: null,
	touch: (at = Date.now()) => {
		set({
			lastSeenAt: at,
			firstSeenAt: get().firstSeenAt ?? at
		});
	},
	simulateAgo: (ms) => {
		set({ simulatedLastAt: Date.now() - ms });
	},
	clearSimulation: () => set({ simulatedLastAt: null }),
	reset: () => set({
		simulatedLastAt: null,
		lastSeenAt: null,
		firstSeenAt: null
	})
}), {
	name: "shigan-interval-v1",
	partialize: (s) => ({
		firstSeenAt: s.firstSeenAt,
		lastSeenAt: s.lastSeenAt,
		simulatedLastAt: s.simulatedLastAt
	})
}));
var CATEGORY_LABELS = {
	first: "尚无记录",
	continuous: "连续",
	brief: "片刻",
	hours: "数小时",
	overnight: "隔夜",
	days: "数天",
	weeks: "数周",
	months: "数月"
};
function TimelinePanel({ gap, gapResult, simulated, onSimulate, onClearSimulation, onReset }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "flex h-full flex-col gap-5 p-5 lg:p-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs font-medium tracking-widest text-muted",
				children: "间隔"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 font-serif text-lg",
				children: "时间间隔测试"
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface-2 p-4 shadow-[var(--shadow-border)]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-muted",
						children: "距上次交互"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 font-serif text-2xl leading-snug text-fg",
						suppressHydrationWarning: true,
						children: gap.human
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 font-mono text-xs tabular-nums text-subtle",
						suppressHydrationWarning: true,
						children: gapResult.hasPrevious ? `${gapResult.durationMs} ms · ${CATEGORY_LABELS[gap.category]}` : "hasPrevious: false"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mb-2 text-xs text-subtle",
				children: "模拟「上一次交互是多久以前」"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [INTERVAL_DEMOS.map((demo) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => onSimulate(demo.ms),
					children: demo.label
				}, demo.key)), simulated ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					size: "sm",
					onClick: onClearSimulation,
					children: "清除模拟"
				}) : null]
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-xs leading-relaxed text-subtle",
				children: [
					"用于验证 MCP 的",
					" ",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", {
						className: "font-mono",
						children: "get_conversation_gap"
					}),
					"：把任意档位当作「上一次交互」，观察间隔如何被计算出来。"
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-auto",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "ghost",
					className: "w-full",
					onClick: onReset,
					children: "重置"
				})
			})
		]
	});
}
function useNow(intervalMs = 1e3) {
	const [now, setNow] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		setNow(Date.now());
		const ms = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? Math.max(intervalMs, 1e3) : intervalMs;
		const id = window.setInterval(() => setNow(Date.now()), ms);
		return () => window.clearInterval(id);
	}, [intervalMs]);
	return now;
}
function AppShell() {
	const nowMs = useNow(1e3);
	if (nowMs == null) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-dvh flex-col items-center justify-center bg-bg text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs font-medium tracking-widest text-muted",
			children: "时感"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-2 font-serif text-lg",
			children: "让 AI 感觉到时间"
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShellLive, { nowMs });
}
function AppShellLive({ nowMs }) {
	const timezone = (0, import_react.useMemo)(() => defaultTimezone(), []);
	const now = (0, import_react.useMemo)(() => buildTemporalContext(nowMs, timezone), [nowMs, timezone]);
	const lastSeenAt = useIntervalStore((s) => s.lastSeenAt);
	const simulatedLastAt = useIntervalStore((s) => s.simulatedLastAt);
	const touch = useIntervalStore((s) => s.touch);
	const simulateAgo = useIntervalStore((s) => s.simulateAgo);
	const clearSimulation = useIntervalStore((s) => s.clearSimulation);
	const reset = useIntervalStore((s) => s.reset);
	const [tab, setTab] = (0, import_react.useState)("capabilities");
	(0, import_react.useEffect)(() => {
		document.documentElement.dataset.tod = now.timeOfDay;
	}, [now.timeOfDay]);
	(0, import_react.useEffect)(() => {
		touch();
		const id = window.setInterval(() => touch(), 15e3);
		return () => window.clearInterval(id);
	}, [touch]);
	const previousAt = previousInteractionAt(lastSeenAt, simulatedLastAt);
	const gap = buildGap(now.at, previousAt, timezone);
	const gapResult = buildConversationGapResult(now.at, previousAt);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-dvh flex-col bg-bg text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col lg:flex-row",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "hidden w-80 shrink-0 overflow-y-auto border-r border-border lg:block",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeAside, {
						now,
						gap
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: cn("lg:hidden", tab === "time" && "min-h-0 flex-1 overflow-y-auto"),
					children: tab === "time" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeAside, {
						now,
						gap
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeAside, {
						now,
						gap,
						compact: true
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
					className: cn("min-h-0 min-w-0 flex-1 flex-col bg-bg", tab === "capabilities" ? "flex" : "hidden lg:flex"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CapabilitiesPanel, { now })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: cn("min-h-0 w-full shrink-0 overflow-y-auto border-t border-border lg:w-72 lg:border-t-0 lg:border-l", tab === "gaps" ? "flex-1 lg:flex-none" : "hidden lg:block"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimelinePanel, {
						gap,
						gapResult,
						simulated: simulatedLastAt != null,
						onSimulate: simulateAgo,
						onClearSimulation: clearSimulation,
						onReset: reset
					})
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("nav", {
			className: "grid grid-cols-3 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden",
			"aria-label": "主导航",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavBtn, {
					active: tab === "time",
					onClick: () => setTab("time"),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock3, { className: "size-4" }),
					label: "此刻"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavBtn, {
					active: tab === "capabilities",
					onClick: () => setTab("capabilities"),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { className: "size-4" }),
					label: "能力"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavBtn, {
					active: tab === "gaps",
					onClick: () => setTab("gaps"),
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rows3, { className: "size-4" }),
					label: "间隔"
				})
			]
		})]
	});
}
function NavBtn({ active, onClick, icon, label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: cn("flex h-14 flex-col items-center justify-center gap-1 text-xs tracking-wide", "transition-colors duration-150 ease-out", active ? "text-fg" : "text-subtle"),
		children: [icon, label]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {});
}
//#endregion
export { Home as component };
