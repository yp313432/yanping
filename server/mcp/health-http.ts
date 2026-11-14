import { ingestConfig, tokenMatches } from "./health-auth.ts";
import type { IngestConfig } from "./health-auth.ts";
import { HealthInputError, normalizeUpload } from "./health-model.ts";
import type { Upload } from "./health-model.ts";

export const MAX_HEALTH_BODY_BYTES = 1024 * 1024;
export type HealthUploadEnv = Record<string, string | undefined>;
export type HealthWrite = (config: IngestConfig, upload: Upload, env: HealthUploadEnv) => Promise<void>;
class HttpInputError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function response(status: number, body: object, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff", ...extra,
  } });
}

/** Bound bytes while streaming, including chunked requests with no Content-Length. */
export async function readHealthJson(request: Request, timeoutMs = 15000): Promise<unknown> {
  if (!request.body) throw new HttpInputError(400, "Invalid JSON");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new HttpInputError(408, "Request body timeout"));
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HEALTH_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new HttpInputError(413, "Payload too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new HttpInputError(400, "Invalid JSON"); }
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

/** Fetch-native handler. No sockets/listener, filesystem, process.env, payload logs or health GET. */
export function createHealthUploadHandler(write: HealthWrite) {
  return async (request: Request, env: HealthUploadEnv): Promise<Response> => {
    let config: IngestConfig;
    try { config = ingestConfig(env); }
    catch { return response(503, { error: "Health receiver configuration unavailable" }); }
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.host !== config.host) return response(421, { error: "Invalid origin" });
    if (url.pathname === "/healthz" && request.method === "GET" && !url.search) return response(200, { ok: true });
    if (url.pathname !== "/api/health" || url.search) return response(404, { error: "Not found" });
    if (request.method !== "POST") return response(405, { error: "Method not allowed" }, { Allow: "POST" });
    if (!tokenMatches(request.headers.get("authorization"), `Bearer ${config.token}`)) return response(401, { error: "Unauthorized" });
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get("content-type") ?? "")) return response(415, { error: "Expected application/json" });
    if (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity") return response(415, { error: "Unsupported encoding" });
    const length = request.headers.get("content-length");
    if (length !== null && !/^\d+$/.test(length)) return response(400, { error: "Invalid content length" });
    if (length !== null && Number(length) > MAX_HEALTH_BODY_BYTES) return response(413, { error: "Payload too large" });
    try {
      const upload = normalizeUpload(await readHealthJson(request), config.timezone);
      await write(config, upload, env); // Await COMMIT before acknowledging the App.
      return response(200, { ok: true, date: upload.date });
    } catch (error) {
      if (error instanceof HttpInputError) return response(error.status, { error: error.message });
      if (error instanceof HealthInputError) return response(400, { error: "Invalid health payload" });
      return response(503, { error: "Health storage unavailable" }, { "Retry-After": "30" });
    }
  };
}
