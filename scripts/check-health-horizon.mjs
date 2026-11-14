import { pathToFileURL } from "node:url";

/** Invalid date is intentional: auth runs first, then query validation fails BEFORE DB access.
 * No new MCP diagnostic tool and no health data/actor/headers are returned or printed. */
export async function probeHealthHeader(makeClient, token) {
  for (const [mode, value, expected] of [
    ["correct", token, /Invalid health query/],
    ["missing", undefined, /Health query unauthorized/],
    ["wrong", token + "-invalid-probe", /Health query unauthorized/],
  ]) {
    let client;
    try {
      client = await makeClient(value);
      const result = await client.callTool({ name: "health_get_status", arguments: { from: "invalid-header-probe-date" } });
      const text = (result.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join("\n");
      if (result.isError !== true || !expected.test(text)) return { verified: false, failedProbe: mode };
    } catch { return { verified: false, failedProbe: mode }; }
    finally { await client?.close().catch(() => {}); }
  }
  return { verified: true, scope: "Horizon header/identity/auth only; no health database query" };
}

async function main() {
  const rawUrl = process.env.HORIZON_MCP_URL;
  const token = process.env.HEALTH_QUERY_TOKEN;
  const gatewayToken = process.env.HORIZON_ACCESS_TOKEN;
  if (!rawUrl || !token || token.length < 32 || token.length > 512 || /\s/.test(token) || !gatewayToken) {
    throw new Error("HORIZON_MCP_URL, HEALTH_QUERY_TOKEN and HORIZON_ACCESS_TOKEN are required");
  }
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid HTTPS MCP URL");
  const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
  const result = await probeHealthHeader(async (queryToken) => {
    const client = new Client({ name: "health-header-probe", version: "1.0.0" });
    const headers = { Authorization: `Bearer ${gatewayToken}` };
    if (queryToken !== undefined) headers["x-health-query-token"] = queryToken;
    try {
      await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers },
        fetch: (target, init) => fetch(target, { ...init, signal: AbortSignal.timeout(15000), redirect: "error" }) }));
      return client;
    } catch { await client.close().catch(() => {}); throw new Error("Probe connection unavailable"); }
  }, token);
  console.log(JSON.stringify(result));
  if (!result.verified) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Horizon health-header verification blocked; check Preview URL, credentials, actor binding and gateway header forwarding"); process.exitCode = 1; });
}
