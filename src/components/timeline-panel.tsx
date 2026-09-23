import { Button } from "@/components/ui/button";
import type { Conversation } from "@/lib/sessions";
import { buildGap, describeDuration, formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const DEMOS: { label: string; ms: number }[] = [
  { label: "两小时", ms: 2 * 60 * 60 * 1000 },
  { label: "隔夜", ms: 14 * 60 * 60 * 1000 },
  { label: "三天", ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "一周", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "一个月", ms: 30 * 24 * 60 * 60 * 1000 },
];

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  simulated: boolean;
  onSimulate: (ms: number) => void;
  onClearSimulation: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onReset: () => void;
};

export function TimelinePanel({
  conversations,
  activeId,
  simulated,
  onSimulate,
  onClearSimulation,
  onSelect,
  onNew,
  onReset,
}: Props) {
  const items = conversations.filter(
    (c) => c.messages.length > 0 || c.id === activeId,
  );

  return (
    <section className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted">间隔</p>
        <p className="mt-1 font-serif text-lg">每次对话之间</p>
      </div>

      <div>
        <p className="mb-2 text-xs text-subtle">模拟距上次的间隔</p>
        <div className="flex flex-wrap gap-2">
          {DEMOS.map((d) => (
            <Button
              key={d.label}
              variant="secondary"
              size="sm"
              onClick={() => onSimulate(d.ms)}
            >
              {d.label}
            </Button>
          ))}
          {simulated ? (
            <Button variant="ghost" size="sm" onClick={onClearSimulation}>
              清除
            </Button>
          ) : null}
        </div>
      </div>

      <ol className="min-h-0 flex-1 space-y-0 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <li className="text-sm leading-relaxed text-muted">
            还没有对话。开口之后，这里会记下每一次，以及中间隔了多久。
          </li>
        ) : (
          items.map((c, i) => {
            const prev = i > 0 ? items[i - 1] : null;
            const gap = prev ? buildGap(c.startedAt, prev.lastAt) : null;
            const active = c.id === activeId;
            const duration = describeDuration(
              Math.max(0, c.lastAt - c.startedAt),
            );
            return (
              <li key={c.id}>
                {gap && gap.category !== "continuous" ? (
                  <div className="relative ml-3 border-l border-border py-3 pl-5">
                    <p className="text-xs tracking-wide text-subtle">
                      间隔 {gap.human}
                    </p>
                  </div>
                ) : i > 0 ? (
                  <div className="ml-3 h-3 border-l border-border" />
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "relative flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left",
                    "transition-[background-color,box-shadow] duration-150 ease-out",
                    active
                      ? "bg-surface-2 shadow-[var(--shadow-border)]"
                      : "hover:bg-surface-2/60",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2.5 shrink-0 rounded-full",
                      c.ghost ? "bg-subtle" : active ? "bg-accent" : "bg-muted",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">
                      {c.ghost ? "演示 · " : ""}
                      {c.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-subtle">
                      {formatDateTime(c.startedAt)}
                      {c.messages.length > 1 ? ` · ${duration}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ol>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onNew}>
          新对话
        </Button>
        <Button variant="ghost" onClick={onReset}>
          清空
        </Button>
      </div>
    </section>
  );
}
