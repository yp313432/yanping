/**
 * 文本向量化：Cloudflare Workers AI 的 BGE-M3。
 *
 * 选型依据（本地探针实测）：
 *   - @cf/baai/bge-m3           1024 维，稳态 ~447ms，「那天我哭了」vs「在房间里哭了很久」相似度 0.768
 *   - @cf/qwen/qwen3-embedding-0.6b  1024 维，稳态 ~740ms，同组相似度 0.629
 *   两者价格相同，BGE-M3 既更准又更快，因此固定用它。
 *
 * 请求格式是 `{ "text": ["..."] }`（官方文档里 `{query, contexts}` 的写法是错的，
 * 实测返回 HTTP 400）。
 *
 * 任何失败都只返回 { ok: false }，由调用方降级到纯文本检索——外部服务不可用
 * 不能拖垮记忆库。
 */

export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const EMBEDDING_DIM = 1024;

/** 单次嵌入请求超时。实测 ~450ms，留足冷启动余量。 */
const EMBEDDING_TIMEOUT_MS = 8000;

/** 送入嵌入模型的文本上限（BGE-M3 支持 60k，这里截断只为控制延迟与费用）。 */
const MAX_INPUT_CHARS = 2000;

export type EmbedFailureReason =
  | "not_configured"
  | "timeout"
  | "network_error"
  | "http_error"
  | "bad_response";

export type EmbedOutcome =
  | { ok: true; vector: number[] }
  | { ok: false; reason: EmbedFailureReason; detail?: string };

/** 是否配置了 Cloudflare 凭证（未配置时语义检索直接降级，不做网络请求）。 */
export function embeddingConfigured(): boolean {
  return Boolean(process.env.CF_ACCOUNT_ID?.trim() && process.env.CF_API_TOKEN?.trim());
}

/**
 * 把一段文本转成 1024 维向量。
 *
 * @param text 任意文本；超长会被截断到 2000 字符
 */
export async function embedText(text: string): Promise<EmbedOutcome> {
  const accountId = process.env.CF_ACCOUNT_ID?.trim();
  const token = process.env.CF_API_TOKEN?.trim();
  if (!accountId || !token) return { ok: false, reason: "not_configured" };

  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBEDDING_MODEL}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ text: [input] }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: "http_error", detail: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      result?: { data?: unknown };
      success?: boolean;
      errors?: unknown;
    };
    const data = json.result?.data;
    const first = Array.isArray(data) ? data[0] : undefined;
    if (!Array.isArray(first) || first.length !== EMBEDDING_DIM) {
      return {
        ok: false,
        reason: "bad_response",
        detail: `unexpected embedding shape: ${JSON.stringify(json).slice(0, 200)}`,
      };
    }
    return { ok: true, vector: (first as unknown[]).map(Number) };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "AbortError" || name === "TimeoutError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network_error", detail: (err as Error)?.message };
  } finally {
    clearTimeout(timer);
  }
}

/** 余弦相似度；任一向量为空返回 0。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
