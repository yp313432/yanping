import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  at: number;
};

export type Conversation = {
  id: string;
  startedAt: number;
  lastAt: number;
  title: string;
  messages: ChatMessage[];
  ghost?: boolean;
};

export const SESSION_GAP_MS = 30 * 60 * 1000;

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function titleFrom(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "未命名对话";
  return t.length > 18 ? `${t.slice(0, 18)}…` : t;
}

type SessionState = {
  conversations: Conversation[];
  activeId: string | null;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  simulatedLastAt: number | null;
  touch: (at?: number) => void;
  startNew: (at?: number) => string;
  addMessage: (role: ChatRole, content: string, at?: number) => ChatMessage;
  simulateAgo: (ms: number) => void;
  clearSimulation: () => void;
  clearAll: () => void;
};

export function previousConversationAt(
  conversations: Conversation[],
  simulatedLastAt: number | null,
  activeId: string | null,
): number | null {
  if (simulatedLastAt != null) return simulatedLastAt;
  const withMessages = conversations.filter((c) => c.messages.length > 0);
  const prior = [...withMessages].reverse().find((c) => c.id !== activeId);
  return prior ? prior.lastAt : null;
}

export const useSessions = create<SessionState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      firstSeenAt: null,
      lastSeenAt: null,
      simulatedLastAt: null,
      touch: (at = Date.now()) => {
        const s = get();
        set({
          lastSeenAt: at,
          firstSeenAt: s.firstSeenAt ?? at,
        });
      },
      startNew: (at = Date.now()) => {
        const id = uid();
        const next: Conversation = {
          id,
          startedAt: at,
          lastAt: at,
          title: "新的对话",
          messages: [],
        };
        set((s) => ({
          conversations: [...s.conversations, next],
          activeId: id,
        }));
        return id;
      },
      addMessage: (role, content, at = Date.now()) => {
        const message: ChatMessage = { id: uid(), role, content, at };
        set((s) => {
          const convs = s.conversations;
          const existing = convs.find((c) => c.id === s.activeId && !c.ghost);
          const stale =
            !existing ||
            (role === "user" && at - existing.lastAt >= SESSION_GAP_MS);

          if (stale || !existing) {
            const created: Conversation = {
              id: uid(),
              startedAt: at,
              lastAt: at,
              title: role === "user" ? titleFrom(content) : "新的对话",
              messages: [message],
            };
            return {
              conversations: [...convs, created],
              activeId: created.id,
              simulatedLastAt: null,
              lastSeenAt: at,
              firstSeenAt: s.firstSeenAt ?? at,
            };
          }

          const title =
            existing.messages.length === 0 && role === "user"
              ? titleFrom(content)
              : existing.title;
          const updated: Conversation = {
            ...existing,
            title,
            lastAt: at,
            messages: [...existing.messages, message],
          };
          return {
            conversations: convs.map((c) =>
              c.id === updated.id ? updated : c,
            ),
            activeId: updated.id,
            lastSeenAt: at,
            firstSeenAt: s.firstSeenAt ?? at,
          };
        });
        return message;
      },
      simulateAgo: (ms) => {
        const now = Date.now();
        const stamp = now - ms;
        set((s) => {
          const real = s.conversations.filter(
            (c) => !c.ghost && c.messages.length > 0,
          );
          if (real.length > 0) {
            const last = real[real.length - 1]!;
            return {
              conversations: s.conversations.map((c) =>
                c.id === last.id ? { ...c, lastAt: stamp } : c,
              ),
              simulatedLastAt: stamp,
            };
          }
          const ghost: Conversation = {
            id: "ghost",
            startedAt: stamp - 8 * 60 * 1000,
            lastAt: stamp,
            title: "一次短暂的问候",
            ghost: true,
            messages: [
              {
                id: "ghost-user",
                role: "user",
                content: "你好。",
                at: stamp - 7 * 60 * 1000,
              },
              {
                id: "ghost-ai",
                role: "assistant",
                content: "你好。我在。",
                at: stamp,
              },
            ],
          };
          return {
            conversations: [
              ghost,
              ...s.conversations.filter((c) => !c.ghost),
            ],
            simulatedLastAt: stamp,
          };
        });
      },
      clearSimulation: () => {
        set((s) => ({
          simulatedLastAt: null,
          conversations: s.conversations.filter((c) => !c.ghost),
        }));
      },
      clearAll: () => {
        set({
          conversations: [],
          activeId: null,
          simulatedLastAt: null,
        });
      },
    }),
    {
      name: "shigan-sessions-v1",
      partialize: (s) => ({
        conversations: s.conversations,
        activeId: s.activeId,
        firstSeenAt: s.firstSeenAt,
        lastSeenAt: s.lastSeenAt,
        simulatedLastAt: s.simulatedLastAt,
      }),
    },
  ),
);
