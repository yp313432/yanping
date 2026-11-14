import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { syntheticBody, TEST_ZONE } from "../../../server/mcp/health-fixtures.ts";

// Use the exact Miniflare/workerd shipped with our pinned Wrangler, not a second runtime version.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare } = wranglerRequire("miniflare");
const url = process.env.HEALTH_TEST_DATABASE_URL; // Never fall back to DATABASE_URL.

test("real Workers runtime + Neon WebSocket driver: transactions, concurrent retries, isolation and privacy", { skip: !url, timeout: 90000 }, async (t) => {
  const admin = new Pool({ connectionString: url });
  const env = { HEALTH_INGEST_TOKEN: "synthetic-upload-token-000000000000", HEALTH_ACTOR_ID: "worker-synthetic-actor",
    HEALTH_SOURCE_ID: "worker-synthetic-band", HEALTH_TIMEZONE: TEST_ZONE, HEALTH_PUBLIC_URL: "https://health.example.test",
    HEALTH_DATABASE_URL: url.replace("127.0.0.1:5432", "postgres:5432") };
  await admin.query(await readFile(new URL("../../../migrations/0003_health.sql", import.meta.url), "utf8"));
  const runtimes = [];
  function runtime(bindings = env, production = false) {
    const mf = new Miniflare({ workers: [{ name: "synthetic-health", modules: true, compatibilityDate: "2026-09-01", compatibilityFlags: ["nodejs_compat"],
      scriptPath: fileURLToPath(new URL(production ? "../dist/index.js" : "../dist-test/worker.js", import.meta.url)),
      bindings }] }); runtimes.push(mf); return mf;
  }
  t.after(async () => { await Promise.all(runtimes.map((mf) => mf.dispose())); await admin.end(); });
  const mf = runtime();
  const send = (body = syntheticBody(), runtime = mf, headers = {}) => runtime.dispatchFetch(env.HEALTH_PUBLIC_URL + "/api/health", {
    method: "POST", headers: { authorization: `Bearer ${env.HEALTH_INGEST_TOKEN}`, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const rows = async (table) => Number((await admin.query(`SELECT count(*) FROM ${table} WHERE actor_id=$1 AND source_id=$2`,
    [env.HEALTH_ACTOR_ID, env.HEALTH_SOURCE_ID])).rows[0].count);
  const state = async () => (await admin.query(`SELECT s.last_received_at::text,s.latest_observed_at::text,d.steps
    FROM health_sources s JOIN health_days d USING(actor_id,source_id)
    WHERE s.actor_id=$1 AND s.source_id=$2 AND d.date='2001-02-03'`, [env.HEALTH_ACTOR_ID, env.HEALTH_SOURCE_ID])).rows[0];

  // The production bundle loads in workerd with nodejs_compat, but rejects before any DB access.
  const production = runtime(env, true);
  assert.equal((await send(syntheticBody(), production, { authorization: "" })).status, 401);
  assert.equal((await send({ ...syntheticBody(), actor_id: "spoof" }, production)).status, 400);
  assert.equal((await send(syntheticBody(), production)).status, 503); // localhost is not a production Neon host.
  const responses = await Promise.all(Array.from({ length: 8 }, () => send()));
  for (const r of responses) { assert.equal(r.status, 200, await r.text()); }
  for (const table of ["health_days", "health_samples", "health_sleep", "health_workouts"]) assert.equal(await rows(table), 1);
  await send({ date: "2001-02-03", steps: { total: 1 } });
  assert.equal((await state()).steps, 4321);

  const otherActor = runtime({ ...env, HEALTH_ACTOR_ID: "worker-other-actor" });
  const otherSource = runtime({ ...env, HEALTH_SOURCE_ID: "worker-other-band" });
  assert.equal((await send(undefined, otherActor)).status, 200);
  assert.equal((await send(undefined, otherSource)).status, 200);
  assert.equal(await rows("health_days"), 1);
  assert.equal(Number((await admin.query("SELECT count(*) FROM health_sources WHERE actor_id IN ('worker-synthetic-actor','worker-other-actor')")).rows[0].count), 3);

  // A row lock held on another connection MUST block this upload until commit. No JS mutex or
  // per-isolate cache can satisfy this check across DB sessions and concurrent Worker requests.
  const lock = await admin.connect();
  try {
    await lock.query("BEGIN");
    await lock.query("SELECT 1 FROM health_sources WHERE actor_id=$1 AND source_id=$2 FOR UPDATE", [env.HEALTH_ACTOR_ID, env.HEALTH_SOURCE_ID]);
    let settled = false;
    const pending = send({ date: "2001-02-03", steps: { total: 4500 } }).then((r) => { settled = true; return r; });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(settled, false); assert.equal((await state()).steps, 4321);
    await lock.query("COMMIT"); assert.equal((await pending).status, 200);
  } finally { await lock.query("ROLLBACK").catch(() => {}); lock.release(); }
  assert.equal((await state()).steps, 4500);

  // Interactive JS validation after the source upsert must roll it back too.
  const beforeMismatch = await state();
  const utc = runtime({ ...env, HEALTH_TIMEZONE: "UTC" });
  assert.equal((await send({ date: "2001-02-03", steps: { total: 9999 } }, utc)).status, 400);
  assert.deepEqual(await state(), beforeMismatch);

  // Fail the LAST insert, after source/day/sample/sleep writes, and verify all-or-nothing.
  await admin.query("ALTER TABLE health_workouts ADD CONSTRAINT worker_synthetic_failure CHECK ((data->>'distance_meters')::float8<>999)");
  const before = await state();
  try {
    const bad = syntheticBody(); bad.steps.total = 9999; bad.workouts[0].id = bad.workouts[0].id.replace('gbw1:42:', 'gbw1:43:');
    bad.workouts[0].distance_meters = 999; bad.heart_rate[0].timestamp = "2001-02-03T09:05:00+08:00";
    const result = await send(bad); assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: "Health storage unavailable" });
    assert.deepEqual(await state(), before);
    for (const table of ["health_days", "health_samples", "health_sleep", "health_workouts"]) assert.equal(await rows(table), 1);
  } finally { await admin.query("ALTER TABLE health_workouts DROP CONSTRAINT worker_synthetic_failure"); }

  // A closed response connection is safe to retry: the DB decides idempotency, not the isolate.
  const restarted = runtime(); assert.equal((await send(undefined, restarted)).status, 200);
  assert.equal(await rows("health_samples"), 1); assert.equal((await state()).steps, 4500);
});
