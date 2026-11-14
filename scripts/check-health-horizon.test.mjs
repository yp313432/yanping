import test from "node:test";
import assert from "node:assert/strict";
import { probeHealthHeader } from "./check-health-horizon.mjs";

test("header probe checks positive/negative credentials with an invalid date and prints no data", async () => {
  const token = "synthetic-query-token-0000000000000";
  const calls = [], closed = [];
  const result = await probeHealthHeader(async (value) => ({
    async callTool(args) {
      calls.push(args); return { isError: true, content: [{ type: "text", text: value === token ? "Invalid health query" : "Health query unauthorized" }] };
    }, async close() { closed.push(true); },
  }), token);
  assert.equal(result.verified, true); assert.equal(calls.length, 3); assert.equal(closed.length, 3);
  assert.ok(calls.every((c) => c.arguments.from === "invalid-header-probe-date" && c.name === "health_get_status"));
  assert.ok(!JSON.stringify(result).includes(token));
});
test("header stripping or bypassed token authorization fails the gate", async () => {
  for (const text of ["Health query unauthorized", "Invalid health query", "synthetic-unexpected-response"]) {
    const result = await probeHealthHeader(async () => ({
      async callTool() { return { isError: true, content: [{ type: "text", text }] }; }, async close() {},
    }), "synthetic-query-token-0000000000000");
    assert.equal(result.verified, false);
  }
});
