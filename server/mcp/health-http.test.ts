import test from "node:test";
import assert from "node:assert/strict";
import { createHealthUploadHandler, MAX_HEALTH_BODY_BYTES, readHealthJson } from "./health-http.ts";
import { syntheticBody, TEST_ZONE } from "./health-fixtures.ts";

const env = { HEALTH_INGEST_TOKEN: "synthetic-upload-token-000000000000", HEALTH_ACTOR_ID: "bound-horizon-actor",
  HEALTH_SOURCE_ID: "synthetic-band", HEALTH_TIMEZONE: TEST_ZONE, HEALTH_PUBLIC_URL: "https://health.example.test" };

test("fetch HTTP: protocol, auth before body/DB, size limits, actor binding and private errors", async () => {
  let calls = 0, fail = false;
  const fetch = createHealthUploadHandler(async (config, upload) => {
    calls++; assert.equal(config.actor, "bound-horizon-actor"); assert.equal(config.source, "synthetic-band");
    assert.equal(upload.samples[0].value, 81);
    if (fail) throw new Error("synthetic-private-db-error");
  });
  const body = JSON.stringify(syntheticBody());
  async function send(value: string | Uint8Array = body, headers: Record<string, string> = {}, method = "POST", url = env.HEALTH_PUBLIC_URL + "/api/health") {
    return fetch(new Request(url, { method, headers: { authorization: `Bearer ${env.HEALTH_INGEST_TOKEN}`,
      "content-type": "application/json", ...headers }, body: method === "GET" ? undefined : value as BodyInit }), env);
  }
  assert.equal((await send(body, { authorization: "" })).status, 401);
  assert.equal((await send(body, { authorization: "Bearer synthetic-query-token-0000000000000" })).status, 401);
  assert.equal((await send(body, { "content-type": "text/plain" })).status, 415);
  assert.equal((await send(body, { "content-encoding": "gzip" })).status, 415);
  assert.equal((await send(body, {}, "POST", "https://attacker.example/api/health")).status, 421);
  assert.equal((await send(body, {}, "POST", "http://health.example.test/api/health")).status, 421);
  assert.equal((await send(body, {}, "GET")).status, 405);
  assert.equal((await send(body, {}, "POST", env.HEALTH_PUBLIC_URL + "/mcp")).status, 404);
  assert.equal((await send("{invalid")).status, 400);
  assert.equal((await send(new Uint8Array([0xff]))).status, 400);
  assert.equal((await send(JSON.stringify({ ...syntheticBody(), actor_id: "spoofed" }))).status, 400);
  assert.equal((await send(body, { "content-length": String(MAX_HEALTH_BODY_BYTES + 1) })).status, 413);
  assert.equal((await send("x".repeat(MAX_HEALTH_BODY_BYTES + 1))).status, 413);
  assert.equal(calls, 0);
  const ok = await send(); assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, date: "2001-02-03" });
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.equal((await send()).status, 200); assert.equal(calls, 2);
  fail = true;
  const rejected = await send(); assert.equal(rejected.status, 503);
  assert.equal(rejected.headers.get("retry-after"), "30");
  assert.deepEqual(await rejected.json(), { error: "Health storage unavailable" });
  assert.equal((await fetch(new Request(env.HEALTH_PUBLIC_URL + "/healthz"), env)).status, 200);
  const unconfigured = await fetch(new Request(env.HEALTH_PUBLIC_URL + "/api/health"), {});
  assert.equal(unconfigured.status, 503);
});

test("streaming body is cancelled on byte limit and on stalled-body timeout", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(c) {
    c.enqueue(new Uint8Array(MAX_HEALTH_BODY_BYTES)); c.enqueue(new Uint8Array(1));
  }, cancel() { cancelled = true; } });
  const request = new Request(env.HEALTH_PUBLIC_URL + "/api/health", {
    method: "POST", body: stream, duplex: "half",
  } as RequestInit);
  await assert.rejects(readHealthJson(request), /Payload too large/); assert.ok(cancelled);
  const stalled = new Request(env.HEALTH_PUBLIC_URL + "/api/health", {
    method: "POST", body: new ReadableStream({}), duplex: "half",
  } as RequestInit);
  await assert.rejects(readHealthJson(stalled, 5), /Request body timeout/);
});
