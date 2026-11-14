import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createPostgresHealthStore } from "./health-store.ts";
import { normalizeUpload } from "./health-model.ts";
import { syntheticBody, syntheticSleep, syntheticUpload, TEST_NOW, TEST_ZONE } from "./health-fixtures.ts";

// Deliberately does NOT fall back to DATABASE_URL. Run only against a disposable test database.
const url = process.env.HEALTH_TEST_DATABASE_URL;
test("Postgres: additive migration, atomic idempotency, actor/source isolation, DST and sleep revisions", { skip: !url }, async (t) => {
  const admin = new Pool({ connectionString: url });
  const store = createPostgresHealthStore(url);
  t.after(async () => { await store.close(); await admin.end(); });
  const sql = await readFile(new URL("../../migrations/0003_health.sql", import.meta.url), "utf8");
  await admin.query("CREATE TABLE IF NOT EXISTS memories(id text PRIMARY KEY, content text)");
  await admin.query("INSERT INTO memories VALUES('synthetic-existing-memory','preserve-me') ON CONFLICT DO NOTHING");
  await admin.query(sql); await admin.query(sql);
  assert.equal((await admin.query("SELECT content FROM memories WHERE id='synthetic-existing-memory'")).rows[0].content, "preserve-me");
  const actor = "synthetic-actor", source = "synthetic-band";
  const range = { from: "2001-02-03", to: "2001-02-03", timezone: TEST_ZONE, source };
  const upload = syntheticUpload();
  await Promise.all(Array.from({ length: 5 }, () => store.ingest(actor, source, TEST_ZONE, upload)));
  for (const table of ["health_days", "health_samples", "health_sleep", "health_workouts"]) {
    assert.equal(Number((await admin.query(`SELECT count(*) FROM ${table} WHERE actor_id=$1 AND source_id=$2`, [actor, source])).rows[0].count), 1);
  }
  let snapshot = await store.snapshot(actor, range);
  assert.equal(snapshot.days[0].steps, 4321);
  assert.equal(snapshot.metrics[0].avg, 81);
  assert.equal(snapshot.workouts[0].distance_meters, 6789);
  assert.equal((await store.snapshot("different-actor", range)).days.length, 0);
  assert.equal((await store.snapshot(actor, { ...range, source: "different-source" })).metrics.length, 0);

  const partial = normalizeUpload({ date: upload.date, steps: { total: 100 } }, TEST_ZONE, TEST_NOW);
  await store.ingest(actor, source, TEST_ZONE, partial);
  assert.equal((await store.snapshot(actor, range)).days[0].steps, 4321);
  const metricsOnly = normalizeUpload({ date: upload.date, heart_rate: [
    { timestamp: "2001-02-03T01:00:00Z", value: 99 },
    { timestamp: "2001-02-03T01:05:00Z", value: 83 },
    { timestamp: "2001-02-03T01:10:00Z", value: 85 },
  ] }, TEST_ZONE, TEST_NOW);
  await store.ingest(actor, source, TEST_ZONE, metricsOnly);
  const page = await store.samples(actor, range, "heart_rate", 2);
  assert.equal(page.records[0].value, 81); // Same instant with another offset is still a duplicate.
  assert.equal(page.records.length, 2); assert.ok(page.nextCursor);
  const next = await store.samples(actor, range, "heart_rate", 2, page.nextCursor!);
  assert.equal(next.records.length, 1); assert.equal(next.records[0].value, 85); assert.equal(next.nextCursor, null);
  assert.equal((await store.samples("different-actor", range, "heart_rate", 10)).records.length, 0);

  const short = normalizeUpload({ date: upload.date, sleep: [syntheticSleep(undefined, "2001-02-03T05:00:00+08:00")] }, TEST_ZONE, TEST_NOW);
  const nap = normalizeUpload({ date: upload.date, sleep: [syntheticSleep("2001-02-03T13:00:00+08:00", "2001-02-03T14:00:00+08:00")] }, TEST_ZONE, TEST_NOW);
  await store.ingest(actor, source, TEST_ZONE, short); await store.ingest(actor, source, TEST_ZONE, nap);
  snapshot = await store.snapshot(actor, range);
  assert.equal(snapshot.sleep.length, 2); assert.equal(snapshot.sleep[0].duration_seconds, 25200);
  const crossShort = normalizeUpload({ date: "2001-02-03", sleep: [syntheticSleep("2001-02-03T22:00:00+08:00", "2001-02-03T23:59:00+08:00")] }, TEST_ZONE, TEST_NOW);
  const crossLong = normalizeUpload({ date: "2001-02-04", sleep: [syntheticSleep("2001-02-03T22:00:00+08:00", "2001-02-04T06:00:00+08:00")] }, TEST_ZONE, TEST_NOW);
  await store.ingest(actor, source, TEST_ZONE, crossShort); await store.ingest(actor, source, TEST_ZONE, crossLong);
  assert.equal((await store.snapshot(actor, range)).sleep.length, 2);
  assert.equal((await store.snapshot(actor, { ...range, from: "2001-02-04", to: "2001-02-04" })).sleep.length, 1);

  const body = syntheticBody(); body.workouts[0].distance_meters = 7000;
  body.workouts[0].captured_at = "2001-02-03T11:00:00+08:00";
  await store.ingest(actor, source, TEST_ZONE, normalizeUpload(body, TEST_ZONE, TEST_NOW));
  await store.ingest(actor, source, TEST_ZONE, upload); // An old retry cannot undo enrichment.
  assert.equal((await store.snapshot(actor, range)).workouts[0].distance_meters, 7000);

  const before = await store.snapshot(actor, range);
  // Simulate a database failure after the source/day upserts. The transaction must roll back all.
  await admin.query(`ALTER TABLE health_samples ADD CONSTRAINT synthetic_failure CHECK(value<>82)`);
  const failed = normalizeUpload({ date: upload.date, steps: { total: 5000 }, heart_rate: [
    { timestamp: "2001-02-03T01:15:00Z", value: 82 },
  ] }, TEST_ZONE, TEST_NOW);
  await assert.rejects(store.ingest(actor, source, TEST_ZONE, failed));
  assert.equal((await store.snapshot(actor, range)).days[0].steps, before.days[0].steps);
  await admin.query("ALTER TABLE health_samples DROP CONSTRAINT synthetic_failure");

  // PG AT TIME ZONE handles a 23-hour DST day; the sample before local midnight is excluded.
  const zone = "America/New_York";
  for (const [date, at] of [["2024-03-09", "2024-03-10T04:30:00Z"], ["2024-03-10", "2024-03-11T03:30:00Z"]]) {
    await store.ingest(actor, "dst-band", zone, normalizeUpload({ date, heart_rate: [{ timestamp: at, value: 80 }] }, zone, Date.parse("2024-03-12T12:00:00Z")));
  }
  const dst = await store.snapshot(actor, { source: "dst-band", from: "2024-03-10", to: "2024-03-10", timezone: zone });
  assert.equal(dst.metrics[0].count, 1);
  assert.equal(dst.metrics[0].latest_at, "2024-03-11T03:30:00.000Z");

  const restarted = createPostgresHealthStore(url);
  try { assert.equal((await restarted.snapshot(actor, range)).workouts[0].distance_meters, 7000); }
  finally { await restarted.close(); }
});
