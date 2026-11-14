import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { HealthInputError, normalizeUpload } from "./server/mcp/health-model.ts";
import { ingestConfig, tokenMatches } from "./server/mcp/health-auth.ts";
import type { IngestConfig } from "./server/mcp/health-auth.ts";
import type { HealthStore } from "./server/mcp/health-store.ts";

export const MAX_HEALTH_BODY_BYTES = 1024 * 1024;
export function createHealthReceiver(config: IngestConfig, store: Pick<HealthStore, "ingest">) {
  const server = createServer(async (req, res) => {
    // Responses and logs never include submitted values, SQL errors, or credentials.
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status: number, body: object) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    if (req.headers.host !== config.host) { send(421, { error: "Invalid host" }); return; }
    if (req.url === "/healthz" && req.method === "GET") { send(200, { ok: true }); return; }
    if (req.url !== "/api/health") { send(404, { error: "Not found" }); return; }
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); send(405, { error: "Method not allowed" }); return; }
    if (!tokenMatches(req.headers.authorization, `Bearer ${config.token}`)) { send(401, { error: "Unauthorized" }); return; }
    if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers["content-type"] ?? "")) {
      send(415, { error: "Expected application/json" }); return;
    }
    if (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity") {
      send(415, { error: "Unsupported encoding" }); return;
    }
    if (Number(req.headers["content-length"] ?? 0) > MAX_HEALTH_BODY_BYTES) {
      send(413, { error: "Payload too large" }); return;
    }
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > MAX_HEALTH_BODY_BYTES) {
          res.setHeader("Connection", "close");
          send(413, { error: "Payload too large" }); return;
        }
        chunks.push(Buffer.from(chunk));
      }
      let raw: unknown;
      try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { send(400, { error: "Invalid JSON" }); return; }
      const upload = normalizeUpload(raw, config.timezone);
      await store.ingest(config.actor, config.source, config.timezone, upload);
      send(200, { ok: true, date: upload.date });
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof HealthInputError) send(400, { error: "Invalid health payload" });
      else { res.setHeader("Retry-After", "30"); send(503, { error: "Health storage unavailable" }); }
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  return server;
}

async function main() {
  const config = ingestConfig();
  const port = Number(process.env.HEALTH_PORT ?? 3100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid HEALTH_PORT");
  const { createPostgresHealthStore } = await import("./server/mcp/health-store.ts");
  const store = createPostgresHealthStore();
  const server = createHealthReceiver(config, store);
  server.listen(port, process.env.HEALTH_HOST ?? "127.0.0.1");
  const stop = () => { server.close(() => { void store.close(); }); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Health receiver configuration failed"); process.exitCode = 1; });
}
