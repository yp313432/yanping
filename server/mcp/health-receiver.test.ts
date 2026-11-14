import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { once } from "node:events";
import { createHealthReceiver, MAX_HEALTH_BODY_BYTES } from "../../health-receiver.ts";
import type { Upload } from "./health-model.ts";
import { syntheticBody, TEST_ZONE } from "./health-fixtures.ts";

test("HTTP ingest: protocol/auth, size limits, private error handling and server identity", async (t) => {
  const token = "synthetic-upload-token-000000000000";
  const calls: { actor: string; upload: Upload }[] = [];
  let fail = false;
  const server = createHealthReceiver({ token, actor: "bound-horizon-actor", source: "test", timezone: TEST_ZONE, host: "health.example.test" }, {
    async ingest(actor, _source, _zone, upload) {
      if (fail) throw new Error("private-health-value-and-SQL-credential");
      calls.push({ actor, upload });
    },
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const addr = server.address(); assert.ok(addr && typeof addr === "object");
  const send = (body: string, headers: Record<string, string> = {}, method = "POST", path = "/api/health") =>
    new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port: addr.port, method, path,
        headers: { host: "health.example.test", authorization: `Bearer ${token}`, "content-type": "application/json", ...headers } }, (res) => {
        let text = ""; res.setEncoding("utf8"); res.on("data", (chunk) => { text += chunk; });
        res.on("end", () => resolve({ status: res.statusCode!, text }));
      });
      req.on("error", reject); req.end(body);
    });
  const body = JSON.stringify(syntheticBody());
  assert.equal((await send(body, { authorization: "" })).status, 401);
  assert.equal((await send(body, { authorization: "Bearer synthetic-query-token-0000000000000" })).status, 401);
  assert.equal((await send(body, { "content-type": "text/plain" })).status, 415);
  assert.equal((await send(body, { "content-encoding": "gzip" })).status, 415);
  assert.equal((await send(body, { host: "attacker.example" })).status, 421);
  assert.equal((await send("", {}, "GET")).status, 405);
  assert.equal((await send("", {}, "POST", "/mcp")).status, 404);
  assert.equal((await send("{invalid")).status, 400);
  assert.equal((await send(JSON.stringify({ ...syntheticBody(), actor_id: "spoofed" }))).status, 400);
  assert.equal((await send("x".repeat(MAX_HEALTH_BODY_BYTES + 1), { "content-length": String(MAX_HEALTH_BODY_BYTES + 1) })).status, 413);
  assert.equal((await send(body)).status, 200);
  assert.equal((await send(body)).status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].actor, "bound-horizon-actor");
  assert.equal(calls[0].upload.samples[0].value, 81);
  fail = true;
  const response = await send(body);
  assert.equal(response.status, 503);
  assert.equal(response.text, '{"error":"Health storage unavailable"}');
  assert.equal((await send("", { authorization: "" }, "GET", "/healthz")).status, 200);
});
