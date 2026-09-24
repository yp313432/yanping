import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 「时间间隔测试」的演示档位，供 UI 验证 get_conversation_gap。 */
export const INTERVAL_DEMOS: { key: string; label: string; ms: number }[] = [
  { key: "2h", label: "两小时", ms: 2 * 60 * 60 * 1000 },
  { key: "overnight", label: "隔夜", ms: 14 * 60 * 60 * 1000 },
  { key: "3d", label: "三天", ms: 3 * 24 * 60 * 60 * 1000 },
  { key: "1w", label: "一周", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "1m", label: "一个月", ms: 30 * 24 * 60 * 60 * 1000 },
];

type IntervalState = {
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  simulatedLastAt: number | null;
  touch: (at?: number) => void;
  simulateAgo: (ms: number) => void;
  clearSimulation: () => void;
  reset: () => void;
};

export function previousInteractionAt(
  lastSeenAt: number | null,
  simulatedLastAt: number | null,
): number | null {
  return simulatedLastAt ?? lastSeenAt;
}

export const useIntervalStore = create<IntervalState>()(
  persist(
    (set, get) => ({
      firstSeenAt: null,
      lastSeenAt: null,
      simulatedLastAt: null,
      touch: (at = Date.now()) => {
        const s = get();
        set({ lastSeenAt: at, firstSeenAt: s.firstSeenAt ?? at });
      },
      simulateAgo: (ms) => {
        set({ simulatedLastAt: Date.now() - ms });
      },
      clearSimulation: () => set({ simulatedLastAt: null }),
      reset: () => set({ simulatedLastAt: null, lastSeenAt: null, firstSeenAt: null }),
    }),
    {
      name: "shigan-interval-v1",
      partialize: (s) => ({
        firstSeenAt: s.firstSeenAt,
        lastSeenAt: s.lastSeenAt,
        simulatedLastAt: s.simulatedLastAt,
      }),
    },
  ),
);