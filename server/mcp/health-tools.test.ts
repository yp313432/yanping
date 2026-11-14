import test from "node:test";
import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { FastMCP } from "@prefecthq/fastmcp-ts/server";
import { server as horizon } from "../../server.ts";
import { registerHealthTools } from "./health-tools.ts";
import type { HealthStore } from "./health-store.ts";

test("the original Horizon endpoint keeps time/memory tools and adds actor-scoped health tools", async (t) => {
  const previous = { HEALTH_OWNER_EMAIL: process.env.HEALTH_OWNER_EMAIL,
    HEALTH_ACTOR_ID: process.env.HEALTH_ACTOR_ID,
    HEALTH_QUERY_TOKEN: process.env.HEALTH_QUERY_TOKEN,
    HEALTH_INGEST_TOKEN: process.env.HEALTH_INGEST_TOKEN, HEALTH_SOURCE_ID: process.env.HEALTH_SOURCE_ID };
  delete process.env.HEALTH_QUERY_TOKEN; delete process.env.HEALTH_INGEST_TOKEN;
  delete process.env.HEALTH_OWNER_EMAIL; delete process.env.HEALTH_ACTOR_ID;
  delete process.env.HEALTH_SOURCE_ID;
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await horizon.close();
  });
  async function clientFor(server: FastMCP, headers: Record<string, string>) {
    const client = new Client({ name: "synthetic-health-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: (url, init) => {
        const merged = new Headers(init?.headers);
        for (const [key, value] of Object.entries(headers)) merged.set(key, value);
        return server.fetch(new Request(url, { ...init, headers: merged }));
      },
    });
    await client.connect(transport);
    t.after(() => client.close());
    return client;
  }
  const original = await clientFor(horizon, {});
  const names = (await original.listTools()).tools.map((t) => t.name);
  for (const name of ["get_current_time", "get_temporal_context", "get_conversation_gap", "memory_add",
    "memory_get", "memory_list", "memory_search", "memory_context", "memory_update", "memory_archive",
    "health_get_status", "health_get_summary", "health_get_samples", "health_get_sleep", "health_get_workouts", "health_get_trends"]) {
    assert.ok(names.includes(name), name);
  }
  // A missing health configuration must not break the existing time tool or import/registration.
  assert.ok(!(await original.callTool({ name: "get_current_time", arguments: { timezone: "Asia/Shanghai" } })).isError);
  assert.equal((await original.callTool({ name: "health_get_status", arguments: {} })).isError, true);

  process.env.HEALTH_QUERY_TOKEN = "synthetic-query-token-0000000000000";
  process.env.HEALTH_INGEST_TOKEN = "synthetic-upload-token-000000000000";
  process.env.HEALTH_ACTOR_ID = 'synthetic-health-owner';
  process.env.HEALTH_OWNER_EMAIL = "owner@example.test";
  let queries = 0;
  const store: HealthStore = {
    async ingest() { assert.fail("Queries must never write health data"); },
    async snapshot(actor, range) {
      queries++; assert.equal(actor, "synthetic-health-owner"); assert.equal(range.source, "huawei-band-11");
      return { days: [], metrics: [], sleep: [], workouts: [], lastReceivedAt: null, latestObservedAt: null };
    }, async samples() { return { records: [], nextCursor: null }; }, async close() {},
  };
  const isolated = new FastMCP({ name: "synthetic-health", version: "1.0.0" });
  registerHealthTools(isolated, store);
  t.after(() => isolated.close());
  const authorized = await clientFor(isolated, { "horizon-actor-email": "owner@example.test", "horizon-actor-type": "user" });
  assert.ok(!(await authorized.callTool({ name: "health_get_summary", arguments: {} })).isError);
  const before = queries;
  const probe = await authorized.callTool({ name: "health_get_status", arguments: { from: "invalid-header-probe-date" } });
  assert.equal(probe.isError, true);
  assert.match(JSON.stringify(probe.content), /Invalid health query/);
  assert.equal(queries, before); // Header verification never reads health data.
  const missingToken = await clientFor(isolated, {});
  const uploadCredential = await clientFor(isolated, { "horizon-actor": "trusted-synthetic-actor",
    "x-health-query-token": process.env.HEALTH_INGEST_TOKEN });
  assert.equal((await missingToken.callTool({ name: "health_get_summary", arguments: {} })).isError, true);
  assert.equal((await uploadCredential.callTool({ name: "health_get_summary", arguments: {} })).isError, true);
  for (const headers of [
    { "horizon-actor-email": "other@example.test", "horizon-actor-type": "user" },
    { "horizon-actor-email": "owner@example.test", "horizon-actor-type": "service_account" },
  ]) {
    const denied = await clientFor(isolated, { ...headers, "x-health-query-token": process.env.HEALTH_QUERY_TOKEN! });
    assert.equal((await denied.callTool({ name: "health_get_summary", arguments: {} })).isError, true);
  }
  assert.equal(queries, before);
});
