export type TimeOfDay =
  | "night"
  | "dawn"
  | "morning"
  | "noon"
  | "afternoon"
  | "dusk"
  | "evening";

export type Shichen = {
  earthly: string;
  name: string;
  poetic: string;
  range: string;
};

export type SolarTerm = {
  name: string;
  season: string;
};

export type TemporalContext = {
  at: number;
  iso: string;
  timezone: string;
  utcOffset: string;
  year: number;
  month: number;
  day: number;
  localeDate: string;
  weekday: string;
  weekdayShort: string;
  time: string;
  timeShort: string;
  hour: number;
  minute: number;
  second: number;
  timeOfDay: TimeOfDay;
  timeOfDayLabel: string;
  shichen: Shichen;
  season: string;
  solarTerm: SolarTerm;
  dayOfYear: number;
  weekOfYear: number;
  isWeekend: boolean;
  greeting: string;
  dayProgress: number;
};

export type GapCategory =
  | "first"
  | "continuous"
  | "brief"
  | "hours"
  | "overnight"
  | "days"
  | "weeks"
  | "months";

export type ConversationGap = {
  ms: number;
  human: string;
  category: GapCategory;
  previousAt: number | null;
  previousLabel: string | null;
};

/** MCP 面向的「距上次交互」结果（无聊天语气，纯数据）。 */
export type ConversationGapResult = {
  hasPrevious: boolean;
  previousAt: string | null;
  now: string;
  durationMs: number;
  humanReadable: string;
};

const WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];
const WEEKDAYS_SHORT = ["日", "一", "二", "三", "四", "五", "六"];

const SHICHEN: Shichen[] = [
  { earthly: "子", name: "子时", poetic: "夜半", range: "23:00–01:00" },
  { earthly: "丑", name: "丑时", poetic: "鸡鸣", range: "01:00–03:00" },
  { earthly: "寅", name: "寅时", poetic: "平旦", range: "03:00–05:00" },
  { earthly: "卯", name: "卯时", poetic: "日出", range: "05:00–07:00" },
  { earthly: "辰", name: "辰时", poetic: "食时", range: "07:00–09:00" },
  { earthly: "巳", name: "巳时", poetic: "隅中", range: "09:00–11:00" },
  { earthly: "午", name: "午时", poetic: "日中", range: "11:00–13:00" },
  { earthly: "未", name: "未时", poetic: "日昳", range: "13:00–15:00" },
  { earthly: "申", name: "申时", poetic: "晡时", range: "15:00–17:00" },
  { earthly: "酉", name: "酉时", poetic: "日入", range: "17:00–19:00" },
  { earthly: "戌", name: "戌时", poetic: "黄昏", range: "19:00–21:00" },
  { earthly: "亥", name: "亥时", poetic: "人定", range: "21:00–23:00" },
];

const SOLAR_TERMS: { m: number; d: number; name: string; season: string }[] = [
  { m: 1, d: 5, name: "小寒", season: "冬" },
  { m: 1, d: 20, name: "大寒", season: "冬" },
  { m: 2, d: 4, name: "立春", season: "春" },
  { m: 2, d: 19, name: "雨水", season: "春" },
  { m: 3, d: 6, name: "惊蛰", season: "春" },
  { m: 3, d: 21, name: "春分", season: "春" },
  { m: 4, d: 5, name: "清明", season: "春" },
  { m: 4, d: 20, name: "谷雨", season: "春" },
  { m: 5, d: 6, name: "立夏", season: "夏" },
  { m: 5, d: 21, name: "小满", season: "夏" },
  { m: 6, d: 6, name: "芒种", season: "夏" },
  { m: 6, d: 21, name: "夏至", season: "夏" },
  { m: 7, d: 7, name: "小暑", season: "夏" },
  { m: 7, d: 23, name: "大暑", season: "夏" },
  { m: 8, d: 8, name: "立秋", season: "秋" },
  { m: 8, d: 23, name: "处暑", season: "秋" },
  { m: 9, d: 8, name: "白露", season: "秋" },
  { m: 9, d: 23, name: "秋分", season: "秋" },
  { m: 10, d: 8, name: "寒露", season: "秋" },
  { m: 10, d: 23, name: "霜降", season: "秋" },
  { m: 11, d: 7, name: "立冬", season: "冬" },
  { m: 11, d: 22, name: "小雪", season: "冬" },
  { m: 12, d: 7, name: "大雪", season: "冬" },
  { m: 12, d: 22, name: "冬至", season: "冬" },
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/**
 * 在指定 IANA 时区下，把一个时间戳（epoch 毫秒）拆成墙上时钟字段。
 *
 * 这是整个项目「唯一的时间计算核心」的时区基础：UI 与 MCP 都经由
 * `buildTemporalContext` / `formatDateTime` 等函数走过这里，绝不依赖
 * 服务器或浏览器的本地时区来推日期、时辰、节气。
 */
type ZonedContext = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  minute: number;
  second: number;
  weekday: number; // 0–6，0 = 星期日
  offsetLabel: string;
  dayMs: number;
};

function zonedContext(at: number, timeZone: string): ZonedContext {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) {
    parts[part.type] = part.value;
  }

  const year = Number(parts.year ?? 0);
  const month = Number(parts.month ?? 1);
  const day = Number(parts.day ?? 1);
  const hour = Number(parts.hour ?? 0) % 24;
  const minute = Number(parts.minute ?? 0);
  const second = Number(parts.second ?? 0);

  // 周几由「该时区的年月日」推得，避免被 Intl 的星期名称本地化干扰。
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  // 该时刻在该时区相对 UTC 的偏移（含夏令时）。
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = wallClockAsUtc - (at - (at % 1000));
  const offsetMinutes = Math.round(offsetMs / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "−";
  const abs = Math.abs(offsetMinutes);
  const offsetLabel = `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;

  const dayMs =
    hour * 3_600_000 + minute * 60_000 + second * 1000 + (at % 1000);

  return { year, month, day, hour, minute, second, weekday, offsetLabel, dayMs };
}

export function getShichen(hour: number): Shichen {
  const idx = Math.floor(((hour + 1) % 24) / 2);
  return SHICHEN[idx] ?? SHICHEN[0];
}

export function getSolarTerm(month: number, day: number): SolarTerm {
  let current = SOLAR_TERMS[SOLAR_TERMS.length - 1];
  for (const term of SOLAR_TERMS) {
    if (month > term.m || (month === term.m && day >= term.d)) current = term;
    else break;
  }
  return { name: current.name, season: current.season };
}

export function getTimeOfDay(hour: number): {
  key: TimeOfDay;
  label: string;
  greeting: string;
} {
  if (hour < 5) return { key: "night", label: "凌晨", greeting: "夜深了" };
  if (hour < 7) return { key: "dawn", label: "清晨", greeting: "清晨好" };
  if (hour < 11) return { key: "morning", label: "上午", greeting: "上午好" };
  if (hour < 13) return { key: "noon", label: "中午", greeting: "中午好" };
  if (hour < 17) return { key: "afternoon", label: "下午", greeting: "下午好" };
  if (hour < 19) return { key: "dusk", label: "傍晚", greeting: "傍晚好" };
  if (hour < 22) return { key: "evening", label: "晚上", greeting: "晚上好" };
  return { key: "night", label: "深夜", greeting: "夜深了" };
}

function dayOfYear(year: number, month: number, day: number) {
  const start = Date.UTC(year, 0, 0);
  const cur = Date.UTC(year, month - 1, day);
  return Math.round((cur - start) / 86_400_000);
}

function weekOfYear(year: number, month: number, day: number) {
  const t = new Date(Date.UTC(year, month - 1, day));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function buildTemporalContext(
  at = Date.now(),
  timezone = defaultTimezone(),
): TemporalContext {
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
    dayProgress: z.dayMs / 86_400_000,
  };
}

export function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
  } catch {
    return "Local";
  }
}

export function formatDateTime(at: number, timezone = defaultTimezone()) {
  const z = zonedContext(at, timezone);
  return `${z.month}月${z.day}日 ${pad(z.hour)}:${pad(z.minute)}`;
}

export function formatClockParts(at: number, timezone = defaultTimezone()) {
  const z = zonedContext(at, timezone);
  return {
    h: pad(z.hour),
    m: pad(z.minute),
    s: pad(z.second),
  };
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function describeDuration(ms: number): string {
  const abs = Math.max(0, Math.round(ms));
  if (abs < 15_000) return "刚刚";
  if (abs < MIN) return `${Math.max(1, Math.round(abs / 1000))} 秒`;
  if (abs < HOUR) {
    const m = Math.round(abs / MIN);
    return `${m} 分钟`;
  }
  if (abs < DAY) {
    const h = Math.floor(abs / HOUR);
    const m = Math.round((abs % HOUR) / MIN);
    return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
  }
  if (abs < WEEK * 8) {
    const d = Math.floor(abs / DAY);
    const h = Math.round((abs % DAY) / HOUR);
    return h > 0 ? `${d} 天 ${h} 小时` : `${d} 天`;
  }
  const months = Math.floor(abs / (DAY * 30));
  if (months >= 1) {
    const remDays = Math.floor((abs % (DAY * 30)) / DAY);
    return remDays > 0 ? `${months} 个月 ${remDays} 天` : `${months} 个月`;
  }
  const weeks = Math.floor(abs / WEEK);
  return `${weeks} 周`;
}

export function buildGap(
  now: number,
  previousAt: number | null,
  timezone = defaultTimezone(),
): ConversationGap {
  if (previousAt == null) {
    return {
      ms: 0,
      human: "尚未有过交互",
      category: "first",
      previousAt: null,
      previousLabel: null,
    };
  }

  const ms = Math.max(0, now - previousAt);
  const previousLabel = formatDateTime(previousAt, timezone);

  if (ms < 5 * MIN) {
    return { ms, human: describeDuration(ms), category: "continuous", previousAt, previousLabel };
  }
  if (ms < 3 * HOUR) {
    return { ms, human: describeDuration(ms), category: "brief", previousAt, previousLabel };
  }

  const prev = zonedContext(previousAt, timezone);
  const cur = zonedContext(now, timezone);
  const sameDay =
    prev.year === cur.year && prev.month === cur.month && prev.day === cur.day;
  const overnight = !sameDay && ms < 36 * HOUR;

  if (sameDay && ms < DAY) {
    return { ms, human: describeDuration(ms), category: "hours", previousAt, previousLabel };
  }
  if (overnight) {
    return { ms, human: describeDuration(ms), category: "overnight", previousAt, previousLabel };
  }
  if (ms < WEEK * 2) {
    return { ms, human: describeDuration(ms), category: "days", previousAt, previousLabel };
  }
  if (ms < DAY * 45) {
    return { ms, human: describeDuration(ms), category: "weeks", previousAt, previousLabel };
  }
  return { ms, human: describeDuration(ms), category: "months", previousAt, previousLabel };
}

/** 供 MCP `get_conversation_gap` 与 UI「时间间隔测试」共用的纯数据结果。 */
export function buildConversationGapResult(
  now: number,
  previousAt: number | null,
): ConversationGapResult {
  const nowIso = new Date(now).toISOString();
  if (previousAt == null) {
    return {
      hasPrevious: false,
      previousAt: null,
      now: nowIso,
      durationMs: 0,
      humanReadable: "尚未有过交互",
    };
  }
  const durationMs = Math.max(0, now - previousAt);
  return {
    hasPrevious: true,
    previousAt: new Date(previousAt).toISOString(),
    now: nowIso,
    durationMs,
    humanReadable: describeDuration(durationMs),
  };
}