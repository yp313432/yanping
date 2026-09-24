import { Button } from "@/components/ui/button";
import { INTERVAL_DEMOS } from "@/lib/interval-store";
import type { ConversationGap, ConversationGapResult } from "@/lib/time";

type Props = {
  gap: ConversationGap;
  gapResult: ConversationGapResult;
  simulated: boolean;
  onSimulate: (ms: number) => void;
  onClearSimulation: () => void;
  onReset: () => void;
};

const CATEGORY_LABELS: Record<ConversationGap["category"], string> = {
  first: "尚无记录",
  continuous: "连续",
  brief: "片刻",
  hours: "数小时",
  overnight: "隔夜",
  days: "数天",
  weeks: "数周",
  months: "数月",
};

export function TimelinePanel({
  gap,
  gapResult,
  simulated,
  onSimulate,
  onClearSimulation,
  onReset,
}: Props) {
  return (
    <section className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted">间隔</p>
        <p className="mt-1 font-serif text-lg">时间间隔测试</p>
      </div>

      <div className="rounded-xl bg-surface-2 p-4 shadow-[var(--shadow-border)]">
        <p className="text-xs text-muted">距上次交互</p>
        <p className="mt-2 font-serif text-2xl leading-snug text-fg" suppressHydrationWarning>
          {gap.human}
        </p>
        <p className="mt-1 font-mono text-xs tabular-nums text-subtle" suppressHydrationWarning>
          {gapResult.hasPrevious
            ? `${gapResult.durationMs} ms · ${CATEGORY_LABELS[gap.category]}`
            : "hasPrevious: false"}
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs text-subtle">模拟「上一次交互是多久以前」</p>
        <div className="flex flex-wrap gap-2">
          {INTERVAL_DEMOS.map((demo) => (
            <Button
              key={demo.key}
              variant="secondary"
              size="sm"
              onClick={() => onSimulate(demo.ms)}
            >
              {demo.label}
            </Button>
          ))}
          {simulated ? (
            <Button variant="ghost" size="sm" onClick={onClearSimulation}>
              清除模拟
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-subtle">
        用于验证 MCP 的{" "}
        <code className="font-mono">get_conversation_gap</code>
        ：把任意档位当作「上一次交互」，观察间隔如何被计算出来。
      </p>

      <div className="mt-auto">
        <Button variant="ghost" className="w-full" onClick={onReset}>
          重置
        </Button>
      </div>
    </section>
  );
}