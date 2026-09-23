import { ClockFace } from "@/components/clock-face";
import { Button } from "@/components/ui/button";
import type { ConversationGap, TemporalContext } from "@/lib/time";
import { formatClockParts } from "@/lib/time";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

type Props = {
  now: TemporalContext;
  gap: ConversationGap;
  prompt: string;
  compact?: boolean;
};

function timezoneLine(now: TemporalContext) {
  if (now.timezone === "UTC") return now.utcOffset;
  return `${now.timezone} · ${now.utcOffset}`;
}

export function TimeAside({ now, gap, prompt, compact }: Props) {
  const parts = formatClockParts(now.at);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

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
        <Button
          variant="ghost"
          size="icon"
          aria-label="复制时感提示词"
          onClick={copyPrompt}
          className="shrink-0"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
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
            距上次对话
          </p>
          <p className="mt-2 font-serif text-2xl leading-snug" suppressHydrationWarning>
            {gap.category === "first" ? "尚未开始" : gap.human}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted" suppressHydrationWarning>
            {gap.category === "first"
              ? "说第一句话，时间就会被记住。"
              : gap.previousLabel
                ? `上次是 ${gap.previousLabel}`
                : ""}
          </p>
        </div>

        <details className="group rounded-xl bg-surface-2 shadow-[var(--shadow-border)]">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm text-muted transition-colors duration-150 hover:text-fg">
            查看将注入模型的提示词
          </summary>
          <pre
            className="max-h-48 overflow-auto px-4 pb-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-subtle"
            suppressHydrationWarning
          >
            {prompt}
          </pre>
        </details>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Button onClick={copyPrompt} variant="secondary" className="w-full">
          {copied ? (
            <>
              <Check className="size-4" />
              已复制提示词
            </>
          ) : (
            <>
              <Copy className="size-4" />
              复制时感提示词
            </>
          )}
        </Button>
        <p className="text-center text-xs leading-relaxed text-subtle">
          可贴到其他对话里，让那边的模型也知道此刻。
        </p>
      </div>
    </aside>
  );
}
