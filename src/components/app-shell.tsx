import { CapabilitiesPanel } from "@/components/capabilities-panel";
import { TimeAside } from "@/components/time-aside";
import { TimelinePanel } from "@/components/timeline-panel";
import { previousInteractionAt, useIntervalStore } from "@/lib/interval-store";
import {
  buildConversationGapResult,
  buildGap,
  buildTemporalContext,
  defaultTimezone,
} from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { Clock3, Rows3, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type MobileTab = "time" | "capabilities" | "gaps";

export function AppShell() {
  const nowMs = useNow(1000);

  if (nowMs == null) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-bg text-fg">
        <p className="text-xs font-medium tracking-widest text-muted">时感</p>
        <p className="mt-2 font-serif text-lg">让 AI 感觉到时间</p>
      </div>
    );
  }

  return <AppShellLive nowMs={nowMs} />;
}

function AppShellLive({ nowMs }: { nowMs: number }) {
  const timezone = useMemo(() => defaultTimezone(), []);
  const now = useMemo(
    () => buildTemporalContext(nowMs, timezone),
    [nowMs, timezone],
  );

  const lastSeenAt = useIntervalStore((s) => s.lastSeenAt);
  const simulatedLastAt = useIntervalStore((s) => s.simulatedLastAt);
  const touch = useIntervalStore((s) => s.touch);
  const simulateAgo = useIntervalStore((s) => s.simulateAgo);
  const clearSimulation = useIntervalStore((s) => s.clearSimulation);
  const reset = useIntervalStore((s) => s.reset);

  const [tab, setTab] = useState<MobileTab>("capabilities");

  useEffect(() => {
    document.documentElement.dataset.tod = now.timeOfDay;
  }, [now.timeOfDay]);

  useEffect(() => {
    touch();
    const id = window.setInterval(() => touch(), 15_000);
    return () => window.clearInterval(id);
  }, [touch]);

  const previousAt = previousInteractionAt(lastSeenAt, simulatedLastAt);
  const gap = buildGap(now.at, previousAt, timezone);
  const gapResult = buildConversationGapResult(now.at, previousAt);

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col lg:flex-row">
        <div className="hidden w-80 shrink-0 overflow-y-auto border-r border-border lg:block">
          <TimeAside now={now} gap={gap} />
        </div>

        <div
          className={cn(
            "lg:hidden",
            tab === "time" && "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          {tab === "time" ? (
            <TimeAside now={now} gap={gap} />
          ) : (
            <TimeAside now={now} gap={gap} compact />
          )}
        </div>

        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col bg-bg",
            tab === "capabilities" ? "flex" : "hidden lg:flex",
          )}
        >
          <CapabilitiesPanel now={now} />
        </main>

        <div
          className={cn(
            "min-h-0 w-full shrink-0 overflow-y-auto border-t border-border lg:w-72 lg:border-t-0 lg:border-l",
            tab === "gaps" ? "flex-1 lg:flex-none" : "hidden lg:block",
          )}
        >
          <TimelinePanel
            gap={gap}
            gapResult={gapResult}
            simulated={simulatedLastAt != null}
            onSimulate={simulateAgo}
            onClearSimulation={clearSimulation}
            onReset={reset}
          />
        </div>
      </div>

      <nav
        className="grid grid-cols-3 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="主导航"
      >
        <NavBtn
          active={tab === "time"}
          onClick={() => setTab("time")}
          icon={<Clock3 className="size-4" />}
          label="此刻"
        />
        <NavBtn
          active={tab === "capabilities"}
          onClick={() => setTab("capabilities")}
          icon={<Sparkles className="size-4" />}
          label="能力"
        />
        <NavBtn
          active={tab === "gaps"}
          onClick={() => setTab("gaps")}
          icon={<Rows3 className="size-4" />}
          label="间隔"
        />
      </nav>
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-14 flex-col items-center justify-center gap-1 text-xs tracking-wide",
        "transition-colors duration-150 ease-out",
        active ? "text-fg" : "text-subtle",
      )}
    >
      {icon}
      {label}
    </button>
  );
}