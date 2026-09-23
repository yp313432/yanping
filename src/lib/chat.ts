import { createServerFn } from "@tanstack/react-start";
import { buildPluginPrompt, buildTemporalContext, buildGap } from "./time";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type AskInput = {
  messages: ChatTurn[];
  timezone: string;
  previousAt: number | null;
  sessions: { title: string; startedAt: number; lastAt: number }[];
};

export const askTimeAware = createServerFn({ method: "POST" })
  .validator((input: AskInput) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return {
        ok: false as const,
        error: "此刻的语言模型不可用，请稍后再试。时间插件本身仍在走。",
      };
    }

    const now = Date.now();
    const ctx = buildTemporalContext(now, data.timezone || "Local");
    const gap = buildGap(now, data.previousAt);
    const system = buildPluginPrompt({
      now: ctx,
      gap,
      sessions: data.sessions,
      sessionIndex: Math.max(1, data.sessions.length),
    });

    const history = data.messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 900,
        temperature: 0.7,
        messages: [{ role: "system", content: system }, ...history],
      }),
    });

    if (!res.ok) {
      return {
        ok: false as const,
        error: `模型暂时没有回应（${res.status}）。时间仍在走。`,
      };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return { ok: false as const, error: "模型没有返回内容。" };
    }
    return { ok: true as const, text };
  });
