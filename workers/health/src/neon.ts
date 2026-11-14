import { Client } from "@neondatabase/serverless";
import { writeHealthUpload } from "../../../server/mcp/health-ingest.ts";
import type { HealthSqlClient } from "../../../server/mcp/health-ingest.ts";
import type { IngestConfig } from "../../../server/mcp/health-auth.ts";
import type { Upload } from "../../../server/mcp/health-model.ts";

export interface NeonUploadClient extends HealthSqlClient {
  connect(): Promise<void>;
  end(): Promise<void>;
}

export function createNeonClient(connectionString: string): NeonUploadClient {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech") ||
      !url.username || !url.password || url.hash) throw new Error("Invalid health database configuration");
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000,
    query_timeout: 15000, application_name: "yanping-health-worker" });
  // WSS encrypts the connection to Neon. Never change global neonConfig, which could leak
  // settings across overlapping requests. No HTTP poolQueryViaFetch or per-statement sessions.
  client.neonConfig.webSocketConstructor = WebSocket;
  client.neonConfig.useSecureWebSocket = true;
  client.on("error", () => {}); // Driver errors are mapped to a private 503, never logged.
  return client;
}

/** One client and one interactive transaction per HTTP request, never reused between requests.
 * Test factory is supplied only by the test entrypoint (not by env/headers/payload). */
export async function ingestWithNeon(config: IngestConfig, upload: Upload, connectionString: string | undefined,
  makeClient: (url: string) => NeonUploadClient = createNeonClient): Promise<void> {
  if (!connectionString?.trim()) throw new Error("Missing health database configuration");
  const client = makeClient(connectionString);
  let began = false;
  try {
    await client.connect();
    await client.query("BEGIN"); began = true;
    await client.query("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='10s'; SET LOCAL idle_in_transaction_session_timeout='15s'");
    await writeHealthUpload(client, config.actor, config.source, config.timezone, upload);
    await client.query("COMMIT"); began = false;
  } catch (error) {
    if (began) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    // Even failed connections and rolled-back uploads are closed within this request.
    await client.end().catch(() => {});
  }
}
