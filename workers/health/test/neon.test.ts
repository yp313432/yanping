import test from "node:test";
import assert from "node:assert/strict";
import { createNeonClient, ingestWithNeon } from "../src/neon.ts";
import type { NeonUploadClient } from "../src/neon.ts";
import { syntheticUpload } from "../../../server/mcp/health-fixtures.ts";

const config = { actor: "synthetic-actor", source: "synthetic-band", timezone: "Asia/Shanghai", host: "health.example.test", token: "synthetic-upload-token-000000000000" };
function client(failAt?: string, mismatch = false) {
  const calls: string[] = [];
  const mock: NeonUploadClient = {
    async connect() { calls.push("connect"); if (failAt === "connect") throw new Error("synthetic"); },
    async query(sql) {
      const key = sql.split(/\s+/).filter(Boolean).slice(0, 3).join(" "); calls.push(key);
      if (failAt && sql.startsWith(failAt)) throw new Error("synthetic");
      return { rows: sql.startsWith("INSERT INTO health_days") && !mismatch ? [{ date: "2001-02-03" }] : [] };
    }, async end() { calls.push("end"); },
  };
  return { mock, calls };
}
test("one connection: commit before success, rollback JS validation or SQL failures, always close", async () => {
  const ok = client(); await ingestWithNeon(config, syntheticUpload(), "synthetic-url", () => ok.mock);
  assert.equal(ok.calls[0], "connect"); assert.equal(ok.calls[1], "BEGIN");
  assert.equal(ok.calls.at(-2), "COMMIT"); assert.equal(ok.calls.at(-1), "end");
  assert.ok(ok.calls.indexOf("INSERT INTO health_sources(actor_id,source_id,last_received_at,latest_observed_at)") > 1);
  for (const phase of ["connect", "BEGIN", "INSERT INTO health_samples", "COMMIT"]) {
    const bad = client(phase);
    await assert.rejects(ingestWithNeon(config, syntheticUpload(), "synthetic-url", () => bad.mock));
    assert.equal(bad.calls.at(-1), "end");
    if (phase !== "connect" && phase !== "BEGIN") assert.equal(bad.calls.at(-2), "ROLLBACK");
  }
  const mismatch = client(undefined, true);
  await assert.rejects(ingestWithNeon(config, syntheticUpload(), "synthetic-url", () => mismatch.mock));
  assert.equal(mismatch.calls.at(-2), "ROLLBACK"); assert.ok(!mismatch.calls.includes("COMMIT"));
});
test("missing or non-Neon database configuration fails closed; no insecure production proxy override", async () => {
  assert.throws(() => createNeonClient("postgres://synthetic:synthetic@localhost/test"));
  assert.throws(() => createNeonClient("https://synthetic.example"));
  await assert.rejects(ingestWithNeon(config, syntheticUpload(), undefined));
});
