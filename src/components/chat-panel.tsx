import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askTimeAware } from "@/lib/chat";
import type { Conversation } from "@/lib/sessions";
import { previousConversationAt, useSessions } from "@/lib/sessions";
import type { ConversationGap, TemporalContext } from "@/lib/time";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type Props = {
  now: TemporalContext;
  gap: ConversationGap;
  viewing: Conversation | null;
  onViewLive: () => void;
};

export function ChatPanel({ now, gap, viewing, onViewLive }: Props) {
  const activeId = useSessions((s) => s.activeId);
  const addMessage = useSessions((s) => s.addMessage);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isHistorical = viewing != null && viewing.id !== activeId && !pending;
  const messages = viewing?.messages ?? [];

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setError(null);
    setPending(true);
    onViewLive();

    const before = useSessions.getState();
    const previousAt = previousConversationAt(
      before.conversations,
      before.simulatedLastAt,
      before.activeId,
    );

    addMessage("user", text, now.at);

    const state = useSessions.getState();
    const sessions = state.conversations
      .filter((c) => c.messages.length > 0)
      .map((c) => ({
        title: c.title,
        startedAt: c.startedAt,
        lastAt: c.lastAt,
      }));
    const history = state.conversations
      .filter((c) => !c.ghost)
      .flatMap((c) =>
        c.messages.map((m) => ({ role: m.role, content: m.content })),
      );

    try {
      const result = await askTimeAware({
        data: {
          messages: history,
          timezone: now.timezone,
          previousAt,
          sessions,
        },
      });
      if (result.ok) {
        addMessage("assistant", result.text);
      } else {
        setError(result.error);
      }
    } catch {
      setError("网络没有把话送出去。时间还在走，可以再试一次。");
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing || e.key === "Process") return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3 lg:px-6">
        <p className="text-xs text-muted" suppressHydrationWarning>
          <span className="text-fg">{now.greeting}</span>
          <span className="text-subtle"> · </span>
          {now.localeDate} {now.timeShort} {now.timeOfDayLabel}
          <span className="text-subtle"> · </span>
          {gap.category === "first" ? "第一次对话" : `距上次 ${gap.human}`}
        </p>
        {isHistorical && viewing ? (
          <button
            type="button"
            onClick={onViewLive}
            className="mt-1 text-xs text-accent underline-offset-2 hover:underline"
          >
            正在看 {formatDateTime(viewing.startedAt)} 的对话 · 回到此刻
          </button>
        ) : null}
      </div>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-8"
      >
        {messages.length === 0 ? (
          <EmptyState now={now} gap={gap} />
        ) : (
          <div className="mx-auto flex max-w-xl flex-col gap-4">
            {gap.category !== "first" && gap.category !== "continuous" ? (
              <GapRule label={`距上次对话 ${gap.human}`} />
            ) : null}
            {messages.map((m) => (
              <article
                key={m.id}
                className={cn(
                  "flex flex-col gap-1",
                  m.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-xl px-4 py-3 text-sm leading-relaxed",
                    m.role === "user"
                      ? "rounded-xl rounded-br-sm bg-surface-2 text-fg shadow-[var(--shadow-border)]"
                      : "rounded-xl rounded-bl-sm text-fg",
                  )}
                >
                  {m.content}
                </div>
                <time
                  className="px-1 font-mono text-xs tabular-nums text-subtle"
                  dateTime={new Date(m.at).toISOString()}
                >
                  {formatDateTime(m.at)}
                </time>
              </article>
            ))}
            {pending ? (
              <p className="shimmer font-serif text-sm">感知此刻…</p>
            ) : null}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
        )}
      </div>

      <form
        className="border-t border-border p-3 lg:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="mx-auto flex max-w-xl items-end gap-2">
          <Textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={pending}
            placeholder="说点什么。时间会被一起送进去。"
            className="max-h-36 min-h-12 py-3"
          />
          <Button
            type="submit"
            size="icon"
            disabled={pending || !draft.trim()}
            aria-label="发送"
            className="shrink-0"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

function GapRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs tracking-wide text-subtle">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function EmptyState({
  now,
  gap,
}: {
  now: TemporalContext;
  gap: ConversationGap;
}) {
  return (
    <div className="stagger-in mx-auto flex max-w-md flex-col justify-center gap-4 px-2 py-12">
      <p className="font-serif text-2xl leading-snug text-fg" suppressHydrationWarning>
        {now.greeting}。现在是 {now.timeShort}。
      </p>
      <p className="text-sm leading-relaxed text-muted" suppressHydrationWarning>
        时感会把日期、时刻、时辰，以及每次对话之间隔了多久，悄悄交给模型。
        {gap.category === "first"
          ? "这是你们的第一次。"
          : `距离上次已经过去 ${gap.human}。`}
      </p>
    </div>
  );
}
