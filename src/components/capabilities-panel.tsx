import type { TemporalContext } from "@/lib/time";

const TOOLS = [
  {
    name: "get_current_time",
    title: "当前时间",
    desc: "此刻的日期、时间、时区、星期与时段。",
  },
  {
    name: "get_temporal_context",
    title: "完整时感",
    desc: "日期时间、十二时辰、节气与时段，合而为一。",
  },
  {
    name: "get_conversation_gap",
    title: "时间间隔",
    desc: "距离上一次交互过去了多久。",
  },
];

export function CapabilitiesPanel({ now }: { now: TemporalContext }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3 lg:px-6">
        <p className="text-xs text-muted" suppressHydrationWarning>
          <span className="text-fg">{now.greeting}</span>
          <span className="text-subtle"> · </span>
          {now.localeDate} {now.timeShort} {now.timeOfDayLabel}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 lg:px-8">
        <div className="mx-auto flex max-w-xl flex-col gap-8">
          <div className="stagger-in flex flex-col gap-2">
            <p className="text-xs font-medium tracking-widest text-muted">
              MCP · 已就绪
            </p>
            <p className="font-serif text-3xl leading-snug text-fg">
              时感已就绪
            </p>
            <p className="text-sm leading-relaxed text-muted">
              时感内置三个时间能力，外部 AI 通过 MCP
              直接调用即可，不需要复制粘贴任何提示词。
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="rounded-xl bg-surface-2 p-4 shadow-[var(--shadow-border)]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-fg">{tool.title}</p>
                  <code className="font-mono text-xs text-subtle">
                    {tool.name}
                  </code>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {tool.desc}
                </p>
              </div>
            ))}
          </div>

          <p className="font-mono text-xs tracking-wide text-subtle">
            Endpoint <span className="text-fg">/mcp</span>
          </p>
        </div>
      </div>
    </section>
  );
}