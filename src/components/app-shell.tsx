import { ChatPanel } from "@/components/chat-panel";
import { TimeAside } from "@/components/time-aside";
import { TimelinePanel } from "@/components/timeline-panel";
import { previousConversationAt, useSessions } from "@/lib/sessions";
import {
  buildGap,
  buildPluginPrompt,
  buildTemporalContext,
  defaultTimezone,
} from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { Clock3, MessageSquare, Rows3 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type MobileTab = "time" | "chat" | "gaps";

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

  const conversations = useSessions((s) => s.conversations);
  const activeId = useSessions((s) => s.activeId);
  const simulatedLastAt = useSessions((s) => s.simulatedLastAt);
  const touch = useSessions((s) => s.touch);
  const startNew = useSessions((s) => s.startNew);
  const simulateAgo = useSessions((s) => s.simulateAgo);
  const clearSimulation = useSessions((s) => s.clearSimulation);
  const clearAll = useSessions((s) => s.clearAll);

  const [viewId, setViewId] = useState<string | null>(null);
  const [tab, setTab] = useState<MobileTab>("chat");

  useEffect(() => {
    document.documentElement.dataset.tod = now.timeOfDay;
  }, [now.timeOfDay]);

  useEffect(() => {
    touch();
    const id = window.setInterval(() => touch(), 15_000);
    return () => window.clearInterval(id);
  }, [touch]);

  const previousAt = previousConversationAt(
    conversations,
    simulatedLastAt,
    viewId ?? activeId,
  );
  const gap = buildGap(now.at, previousAt);
  const sessions = conversations
    .filter((c) => c.messages.length > 0)
    .map((c) => ({
      title: c.title,
      startedAt: c.startedAt,
      lastAt: c.lastAt,
    }));
  const prompt = buildPluginPrompt({
    now,
    gap,
    sessions,
    sessionIndex: Math.max(1, sessions.length),
  });

  const viewing =
    conversations.find((c) => c.id === (viewId ?? activeId)) ?? null;

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col lg:flex-row">
        <div className="hidden w-80 shrink-0 overflow-y-auto border-r border-border lg:block">
          <TimeAside now={now} gap={gap} prompt={prompt} />
        </div>

        <div
          className={cn(
            "lg:hidden",
            tab === "time" && "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          {tab === "time" ? (
            <TimeAside now={now} gap={gap} prompt={prompt} />
          ) : (
            <TimeAside now={now} gap={gap} prompt={prompt} compact />
          )}
        </div>

        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col bg-bg",
            tab === "chat" ? "flex" : "hidden lg:flex",
          )}
        >
          <ChatPanel
            now={now}
            gap={gap}
            viewing={viewing}
            onViewLive={() => {
              setViewId(null);
              setTab("chat");
            }}
          />
        </main>

        <div
          className={cn(
            "min-h-0 w-full shrink-0 overflow-y-auto border-t border-border lg:w-72 lg:border-t-0 lg:border-l",
            tab === "gaps" ? "flex-1 lg:flex-none" : "hidden lg:block",
          )}
        >
          <TimelinePanel
            conversations={conversations}
            activeId={viewId ?? activeId}
            simulated={simulatedLastAt != null}
            onSimulate={(ms) => {
              simulateAgo(ms);
              setTab("chat");
            }}
            onClearSimulation={clearSimulation}
            onSelect={(id) => {
              setViewId(id);
              setTab("chat");
            }}
            onNew={() => {
              startNew();
              setViewId(null);
              setTab("chat");
            }}
            onReset={() => {
              clearAll();
              setViewId(null);
            }}
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
          active={tab === "chat"}
          onClick={() => setTab("chat")}
          icon={<MessageSquare className="size-4" />}
          label="对话"
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
