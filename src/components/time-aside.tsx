import { ClockFace } from "@/components/clock-face";
import type { ConversationGap, TemporalContext } from "@/lib/time";
import { formatClockParts } from "@/lib/time";

type Props = {
  now: TemporalContext;
  gap: ConversationGap;
  compact?: boolean;
};

function timezoneLine(now: TemporalContext) {
  if (now.timezone === "UTC") return now.utcOffset;
  return `${now.timezone} · ${now.utcOffset}`;
}

export function TimeAside({ now, gap, compact }: Props) {
  const parts = formatClockParts(now.at, now.timezone);

  if (compact) {
    return (
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <ClockFace at={now.at} size={48} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p
            className="font-mono text-xl tabular-nums leading-none tracking-tight"
            suppressHydrationWarning
          >
            {parts.h}
            <span className="text-muted">:</span>
            {parts.m}
            <span className="text-subtle">:{parts.s}</span>
          </p>
          <p className="mt-1 truncate text-xs text-muted" suppressHydrationWarning>
            {now.weekdayShort} · {now.timeOfDayLabel} · {now.shichen.name}
            <span className="text-subtle"> · </span>
            {gap.category === "first" ? "初次" : `间隔 ${gap.human}`}
          </p>
        </div>
      </header>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col gap-6 p-6 lg:p-8">
      <div className="stagger-in flex flex-col gap-5">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted">时感</p>
          <p className="mt-1 font-serif text-lg text-fg">让 AI 感觉到时间</p>
        </div>

        <div className="flex justify-center py-2">
          <ClockFace at={now.at} size={200} />
        </div>

        <div>
          <p
            className="font-mono text-5xl leading-none tracking-tight tabular-nums"
            aria-live="polite"
            aria-atomic="true"
            suppressHydrationWarning
          >
            {parts.h}
            <span className="text-muted">:</span>
            {parts.m}
            <span className="text-2xl text-subtle">:{parts.s}</span>
          </p>
          <p className="mt-3 font-serif text-lg text-fg" suppressHydrationWarning>
            {now.localeDate} {now.weekday}
          </p>
          <p className="mt-1 text-sm text-muted" suppressHydrationWarning>
            {now.timeOfDayLabel} · {now.shichen.name} {now.shichen.poetic}
            <span className="text-subtle"> · </span>
            {now.season}季 {now.solarTerm.name}
          </p>
          <p className="mt-1 text-xs text-subtle" suppressHydrationWarning>
            {timezoneLine(now)}
          </p>
        </div>

        <div className="rounded-xl bg-surface-2 p-4 shadow-[var(--shadow-border)]">
          <p className="text-xs font-medium tracking-wide text-muted">
            距上次交互
          </p>
          <p className="mt-2 font-serif text-2xl leading-snug" suppressHydrationWarning>
            {gap.category === "first" ? "尚未有过交互" : gap.human}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted" suppressHydrationWarning>
            {gap.category === "first"
              ? "从这里开始，时间会被记住。"
              : gap.previousLabel
                ? `上次是 ${gap.previousLabel}`
                : ""}
          </p>
        </div>
      </div>
    </aside>
  );
}