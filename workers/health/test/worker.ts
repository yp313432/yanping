// Test-only entrypoint: same handler, driver and transaction implementation, with a local
// Neon-protocol WebSocket proxy in front of disposable Postgres. Never deployed by wrangler.jsonc.
import { Client } from "@neondatabase/serverless";
import { createHealthUploadHandler } from "../../../server/mcp/health-http.ts";
import { ingestWithNeon } from "../src/neon.ts";

export default { fetch: createHealthUploadHandler((config, upload, env) =>
  ingestWithNeon(config, upload, env.HEALTH_DATABASE_URL, (url) => {
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000, application_name: "synthetic-worker-lock-test" });
    client.neonConfig.webSocketConstructor = WebSocket;
    client.neonConfig.wsProxy = "127.0.0.1:55433/v1";
    client.neonConfig.useSecureWebSocket = false;
    client.neonConfig.pipelineConnect = false;
    client.on("error", () => {});
    return client;
  })),
};
