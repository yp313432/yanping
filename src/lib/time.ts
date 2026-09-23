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
  feeling: string;
  previousAt: number | null;
  previousLabel: string | null;
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

export function getShichen(date: Date): Shichen {
  const h = date.getHours();
  const idx = Math.floor(((h + 1) % 24) / 2);
  return SHICHEN[idx] ?? SHICHEN[0];
}

export function getSolarTerm(date: Date): SolarTerm {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  let current = SOLAR_TERMS[SOLAR_TERMS.length - 1];
  for (const term of SOLAR_TERMS) {
    if (m > term.m || (m === term.m && d >= term.d)) current = term;
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

function dayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}

function weekOfYear(date: Date) {
  const t = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function utcOffsetLabel(date: Date) {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "−";
  const abs = Math.abs(minutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function buildTemporalContext(
  at = Date.now(),
  timezone = defaultTimezone(),
): TemporalContext {
  const date = new Date(at);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  const tod = getTimeOfDay(hour);
  const shichen = getShichen(date);
  const solar = getSolarTerm(date);
  const weekdayIdx = date.getDay();
  const dayMs =
    hour * 3600_000 + minute * 60_000 + second * 1000 + date.getMilliseconds();

  return {
    at,
    iso: date.toISOString(),
    timezone,
    utcOffset: utcOffsetLabel(date),
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    localeDate: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
    weekday: WEEKDAYS[weekdayIdx] ?? "",
    weekdayShort: WEEKDAYS_SHORT[weekdayIdx] ?? "",
    time: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
    timeShort: `${pad(hour)}:${pad(minute)}`,
    hour,
    minute,
    second,
    timeOfDay: tod.key,
    timeOfDayLabel: tod.label,
    shichen,
    season: solar.season,
    solarTerm: solar,
    dayOfYear: dayOfYear(date),
    weekOfYear: weekOfYear(date),
    isWeekend: weekdayIdx === 0 || weekdayIdx === 6,
    greeting: tod.greeting,
    dayProgress: dayMs / 86_400_000,
  };
}

export function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
  } catch {
    return "Local";
  }
}

export function formatDateTime(at: number) {
  const d = new Date(at);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatClockParts(at: number) {
  const d = new Date(at);
  return {
    h: pad(d.getHours()),
    m: pad(d.getMinutes()),
    s: pad(d.getSeconds()),
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
): ConversationGap {
  if (previousAt == null) {
    return {
      ms: 0,
      human: "第一次对话",
      category: "first",
      feeling:
        "这是你们的第一次对话。不要假装认识很久，也不必客套地自我介绍成长篇。平静地在此刻开始即可。",
      previousAt: null,
      previousLabel: null,
    };
  }

  const ms = Math.max(0, now - previousAt);
  const previousLabel = formatDateTime(previousAt);

  if (ms < 5 * MIN) {
    return {
      ms,
      human: describeDuration(ms),
      category: "continuous",
      feeling: "当作同一轮连续对话。不要提起间隔，不要重新打招呼。",
      previousAt,
      previousLabel,
    };
  }
  if (ms < 3 * HOUR) {
    return {
      ms,
      human: describeDuration(ms),
      category: "brief",
      feeling: `对方离开了大约 ${describeDuration(ms)} 后又回来。可以轻轻接上，不要夸张成久别。`,
      previousAt,
      previousLabel,
    };
  }

  const prev = new Date(previousAt);
  const cur = new Date(now);
  const sameDay =
    prev.getFullYear() === cur.getFullYear() &&
    prev.getMonth() === cur.getMonth() &&
    prev.getDate() === cur.getDate();
  const overnight =
    !sameDay && ms < 36 * HOUR && cur.getDate() !== prev.getDate();

  if (sameDay && ms < DAY) {
    return {
      ms,
      human: describeDuration(ms),
      category: "hours",
      feeling: `今天稍早已经聊过（${previousLabel}），中间隔了 ${describeDuration(ms)}。可以点明「今天又见面了」，但不要重复整个上午的内容。`,
      previousAt,
      previousLabel,
    };
  }
  if (overnight && ms < 36 * HOUR) {
    return {
      ms,
      human: describeDuration(ms),
      category: "overnight",
      feeling: `隔了一夜。上次是 ${previousLabel}。对方可能已经睡过一觉、过完了一个早晨或夜晚。用一句很轻的话承认时间过去了即可。`,
      previousAt,
      previousLabel,
    };
  }
  if (ms < WEEK * 2) {
    return {
      ms,
      human: describeDuration(ms),
      category: "days",
      feeling: `已经 ${describeDuration(ms)} 没有说话。上次是 ${previousLabel}。要真正感觉到这几天的空白——对方的生活可能已经发生了变化。不要盘问，但也不要装作中间什么都没发生。`,
      previousAt,
      previousLabel,
    };
  }
  if (ms < DAY * 45) {
    return {
      ms,
      human: describeDuration(ms),
      category: "weeks",
      feeling: `有一段时间没聊了（${describeDuration(ms)}，上次 ${previousLabel}）。认真感觉这份空白。语气可以慢一点，不要热情过头，也不要若无其事。`,
      previousAt,
      previousLabel,
    };
  }
  return {
    ms,
    human: describeDuration(ms),
    category: "months",
    feeling: `很久没见——大约 ${describeDuration(ms)}，上次是 ${previousLabel}。承认时间过去了很久。不要假装一直在，也不要写成重逢煽情戏。`,
    previousAt,
    previousLabel,
  };
}

export type SessionStamp = {
  title: string;
  startedAt: number;
  lastAt: number;
};

export function buildPluginPrompt(input: {
  now: TemporalContext;
  gap: ConversationGap;
  sessions: SessionStamp[];
  sessionIndex: number;
}): string {
  const { now, gap, sessions, sessionIndex } = input;
  const lines: string[] = [];

  lines.push(
    "你内置了「时感」插件。你始终知道现在的真实日期与时间，也记得每次对话之间隔了多久。",
  );
  lines.push("");
  lines.push("【此刻】");
  lines.push(
    `日期：${now.localeDate} ${now.weekday}（今年第 ${now.dayOfYear} 天，第 ${now.weekOfYear} 周）`,
  );
  lines.push(
    `时间：${now.time}（${now.timeOfDayLabel}，${now.shichen.name}·${now.shichen.poetic}）`,
  );
  lines.push(`时区：${now.timezone}（${now.utcOffset}）`);
  lines.push(
    `季节：${now.season}季 · 节气 ${now.solarTerm.name}${now.isWeekend ? " · 周末" : ""}`,
  );
  lines.push("");
  lines.push("【对话间隔】");
  if (gap.category === "first") {
    lines.push("这是你们的第一次对话。");
  } else {
    lines.push(`这是有记录以来的第 ${sessionIndex} 次对话。`);
    lines.push(
      `距离上次对话已经过去 ${gap.human}（上次：${gap.previousLabel}）。`,
    );
  }
  lines.push(gap.feeling);
  if (sessions.length > 0) {
    lines.push("");
    lines.push("【过往对话时间】");
    sessions.forEach((s, i) => {
      const span = describeDuration(s.lastAt - s.startedAt);
      const gapToNext =
        i < sessions.length - 1
          ? describeDuration(sessions[i + 1].startedAt - s.lastAt)
          : null;
      lines.push(
        `${i + 1}. ${formatDateTime(s.startedAt)} → ${formatDateTime(s.lastAt)} · ${s.title || "未命名"}（时长 ${span}${gapToNext ? `，之后间隔 ${gapToNext}` : "，当前"}）`,
      );
    });
  }
  lines.push("");
  lines.push("【感知原则】");
  lines.push(
    "- 自然地感知时间，不要每次开口都报时、报节气或报时辰。只有当时间本身有意义时才点明。",
  );
  lines.push("- 间隔很短就当作连续对话；隔夜或数日，用一句很轻的话承认即可。");
  lines.push("- 深夜、凌晨语气更安静；清晨可以更清醒。不要表演。");
  lines.push(
    "- 不要假装你在对话间隔中经历了什么。你只是清楚地知道时间过去了。",
  );
  lines.push("- 用对方的语言回答。默认中文，简洁、具体、有温度。");

  return lines.join("\n");
}
