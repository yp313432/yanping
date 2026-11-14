import test from "node:test";
import assert from "node:assert/strict";
import { HealthInputError, localDay, mergeSleep, normalizeUpload, timestamp } from "./health-model.ts";
import { authorizeHealthQuery, ingestConfig } from "./health-auth.ts";
import { healthRange, runHealthQuery } from "./health-query.ts";
import type { HealthSnapshot, HealthStore } from "./health-store.ts";
import { syntheticBody, syntheticSleep, syntheticUpload, TEST_NOW, TEST_ZONE } from "./health-fixtures.ts";

test("current Android day payload: canonical UTC, nullable score, stable workout ID", () => {
  const upload = syntheticUpload();
  assert.equal(upload.steps, 4321);
  assert.deepEqual(upload.samples, [{ metric: "heart_rate", timestamp: "2001-02-03T01:00:00.000Z", value: 81 }]);
  assert.equal(upload.sleep[0].score, null);
  assert.equal(upload.sleep[0].duration_seconds, 25200);
  assert.equal(upload.workouts[0].distance_meters, 6789);
  const body = syntheticBody();
  body.workouts[0].distance_meters = null as unknown as number;
  assert.equal(normalizeUpload(body, TEST_ZONE, TEST_NOW).workouts[0].distance_meters, null);
});

test("reject malformed values, sentinels, naive times, date mismatch, future measurements and private fields", () => {
  const invalid: unknown[] = [null, [], {}, { date: "2001-02-30", steps: { total: 1 } },
    { date: "2001-02-03", steps: { total: -1 } }, { date: "2001-02-03", steps: { total: "1" } },
    { date: "2001-02-03", heart_rate: [{ timestamp: "2001-02-03T09:00:00", value: 81 }] },
    { date: "2001-02-03", heart_rate: [{ timestamp: "2001-02-03T09:00:00Z", value: 255 }] },
    { date: "2001-02-03", heart_rate: [{ timestamp: "2001-02-04T09:00:00Z", value: 81 }] },
    { date: "2001-02-05", heart_rate: [{ timestamp: "2001-02-05T09:00:00Z", value: 81 }] },
    { ...syntheticBody(), actor_id: "spoofed" },
    { ...syntheticBody(), gps: [1, 2] },
    { ...syntheticBody(), workouts: [{ ...syntheticBody().workouts[0], id: "gbw1:42:0:3:128" }] },
    { ...syntheticBody(), sleep: [{ ...syntheticSleep(), duration_seconds: 999999 }] },
  ];
  for (const body of invalid) assert.throws(() => normalizeUpload(body, TEST_ZONE, TEST_NOW), HealthInputError);
  for (const value of ["2001-02-30T00:00:00Z", "2001-02-03T24:00:00Z", "2001-02-03T12:00:00"]) {
    assert.throws(() => timestamp(value), HealthInputError);
  }
});

test("sample metric extension is allowlisted and preserves real zero values", () => {
  const upload = normalizeUpload({ date: "2001-02-03", metrics: [
    { metric: "stress", timestamp: "2001-02-03T10:00:00+08:00", value: 0 },
    { metric: "spo2", timestamp: "2001-02-03T10:00:00+08:00", value: 98 },
  ] }, TEST_ZONE, TEST_NOW);
  assert.equal(upload.samples[0].value, 0);
  assert.throws(() => normalizeUpload({ date: "2001-02-03", metrics: [
    { metric: "invented", timestamp: "2001-02-03T10:00:00+08:00", value: 1 },
  ] }, TEST_ZONE, TEST_NOW));
});

test("sleep overlap revisions collapse deterministically, preserving distinct naps", () => {
  const normalize = (sleep: unknown[]) => normalizeUpload({ date: "2001-02-03", sleep }, TEST_ZONE, TEST_NOW).sleep;
  const short = normalize([syntheticSleep(undefined, "2001-02-03T05:00:00+08:00")])[0];
  const long = syntheticUpload().sleep[0];
  const nap = normalize([syntheticSleep("2001-02-03T13:00:00+08:00", "2001-02-03T14:00:00+08:00")])[0];
  for (const sessions of [[short, long, nap, long], [long, nap, short], [nap, long, short]]) {
    const merged = mergeSleep([], sessions);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].duration_seconds, 25200);
  }
  const bridge = normalize([syntheticSleep("2001-02-03T05:30:00+08:00", "2001-02-03T13:30:00+08:00")])[0];
  assert.equal(mergeSleep([long, nap], [bridge]).length, 1);
});

test("query date range validates calendar, IANA zone and 62-day limit, including DST", () => {
  assert.throws(() => healthRange({ from: "2001-02-30" }, "test", TEST_NOW));
  assert.throws(() => healthRange({ timezone: "invalid" }, "test", TEST_NOW));
  assert.throws(() => healthRange({ from: "2001-01-01", to: "2001-04-01" }, "test", TEST_NOW));
  assert.throws(() => healthRange({ from: "2001-02-04", to: "2001-02-03" }, "test", TEST_NOW));
  assert.equal(healthRange({ from: "2024-03-09", to: "2024-03-11", timezone: "America/New_York" }, "test", TEST_NOW).from, "2024-03-09");
  assert.equal(localDay("2024-03-10T04:30:00Z", "America/New_York"), "2024-03-09");
  assert.equal(localDay("2024-03-11T03:30:00Z", "America/New_York"), "2024-03-10");
});

function fakeStore(snapshot: HealthSnapshot): HealthStore {
  return { async ingest() {}, async snapshot(actor) { assert.equal(actor, "test-actor"); return snapshot; },
    async samples() { return { records: [], nextCursor: null }; }, async close() {} };
}
const empty: HealthSnapshot = { days: [], metrics: [], sleep: [], workouts: [], lastReceivedAt: null, latestObservedAt: null };
test("empty summary and trends fill days without inventing zeros or device capabilities", async () => {
  const result = await runHealthQuery("summary", { from: "2001-02-02", to: "2001-02-04" }, "test-actor", "test", fakeStore(empty), TEST_NOW);
  assert.equal(result.hasData, false);
  assert.ok("days" in result && result.days.length === 3);
  assert.ok("totals" in result && result.totals.steps === null && result.totals.stepsDaysMissing === 3);
  assert.deepEqual(result.availableMetrics, []);
  assert.ok(result.missingMetrics.includes("spo2"));
  assert.equal(result.sync.receiptStale, true);
  assert.equal(result.sync.lastReceivedAt, null);
});

test("fresh receipt of old measurements remains measurement-stale; real zero steps is data", async () => {
  const snapshot: HealthSnapshot = { ...empty, days: [{ date: "2001-02-03", timezone: TEST_ZONE, steps: 0 }],
    lastReceivedAt: new Date(TEST_NOW - 1000).toISOString(), latestObservedAt: "2001-02-03T01:00:00Z" };
  const result = await runHealthQuery("summary", { from: "2001-02-03", to: "2001-02-03" }, "test-actor", "test", fakeStore(snapshot), TEST_NOW);
  assert.equal(result.hasData, true);
  assert.equal(result.sync.receiptStale, false);
  assert.equal(result.sync.measurementStale, true);
  assert.ok("totals" in result && result.totals.steps === 0);
});

test("upload and query use independent fail-closed credentials and server-side identity", () => {
  const upload = "synthetic-upload-token-000000000000";
  const read = "synthetic-query-token-0000000000000";
  const env = { HEALTH_INGEST_TOKEN: upload, HEALTH_QUERY_TOKEN: read, HEALTH_ACTOR_ID: "test-actor", HEALTH_PUBLIC_URL: "https://health.example.test" };
  const config = ingestConfig(env);
  assert.equal(config.actor, "test-actor");
  authorizeHealthQuery(new Headers({ "x-health-query-token": read }), env);
  assert.throws(() => authorizeHealthQuery(new Headers({ "x-health-query-token": upload }), env));
  assert.throws(() => authorizeHealthQuery(new Headers(), env));
  assert.throws(() => authorizeHealthQuery(new Headers(), {}));
  assert.throws(() => ingestConfig({ ...env, HEALTH_QUERY_TOKEN: upload }));
  assert.throws(() => ingestConfig({ ...env, HEALTH_ACTOR_ID: "" }));
  assert.throws(() => ingestConfig({ ...env, HEALTH_PUBLIC_URL: "http://health.example.test" }));
});
