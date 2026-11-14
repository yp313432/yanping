import { check, dateDay, localDay, metricNames, metricUnit, number, object, shiftDay, timestamp, timezone } from "./health-model.ts";
import type { Metric, Sleep } from "./health-model.ts";
import type { HealthRange, HealthSnapshot, HealthStore } from "./health-store.ts";

export type HealthView = "status" | "summary" | "samples" | "sleep" | "workouts" | "trends";
export function healthRange(raw: unknown, source: string, now: number): HealthRange & { metric: Metric; limit: number; after?: string } {
  const v = object(raw);
  const zone = timezone(v.timezone ?? "Asia/Shanghai");
  const to = dateDay(v.to ?? localDay(now, zone));
  const from = dateDay(v.from ?? shiftDay(to, -6));
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  check(days > 0 && days <= 62);
  const metric = (v.metric ?? "heart_rate") as Metric;
  check(metricNames.includes(metric));
  return { from, to, timezone: zone, source, metric,
    limit: number(v.limit ?? 300, 1, 1000, true),
    after: v.after === undefined ? undefined : timestamp(v.after) };
}
function sleepSummary(sessions: Sleep[]) {
  if (!sessions.length) return null;
  const stages = { deep: 0, light: 0, rem: 0, awake: 0 };
  for (const s of sessions) for (const stage of s.stages) stages[stage.stage] += stage.duration_seconds;
  return { sessions: sessions.length, duration_seconds: sessions.reduce((sum, s) => sum + s.duration_seconds, 0),
    stages_seconds: sessions.some((s) => s.stages.length > 0) ? stages : null };
}
function daily(snapshot: HealthSnapshot, range: HealthRange) {
  const days = [];
  for (let date = range.from; date <= range.to; date = shiftDay(date, 1)) {
    const day = snapshot.days.find((d) => d.date === date);
    const metrics = snapshot.metrics.filter((m) => m.date === date);
    const sleep = snapshot.sleep.filter((s) => localDay(s.session_end_time, range.timezone) === date);
    const workouts = snapshot.workouts.filter((w) => localDay(w.start_time, range.timezone) === date);
    days.push({ date, steps: day?.steps ?? null, stepsTimezone: day?.timezone ?? null,
      metrics: Object.fromEntries(metrics.map(({ date: _date, ...m }) => [m.metric, { ...m, unit: metricUnit(m.metric) }])),
      sleep: sleepSummary(sleep), workouts: workouts.length ? { count: workouts.length,
        active_seconds: workouts.reduce((sum, w) => sum + w.active_seconds, 0),
        distance_meters: workouts.some((w) => w.distance_meters !== null)
          ? workouts.reduce((sum, w) => sum + (w.distance_meters ?? 0), 0) : null,
        active_calories: workouts.some((w) => w.active_calories !== null)
          ? workouts.reduce((sum, w) => sum + (w.active_calories ?? 0), 0) : null,
        distanceKnownCount: workouts.filter((w) => w.distance_meters !== null).length,
        caloriesKnownCount: workouts.filter((w) => w.active_calories !== null).length,
      } : null });
  }
  return days;
}
export async function runHealthQuery(view: HealthView, raw: unknown, actor: string, source: string, store: HealthStore, now = Date.now()) {
  const range = healthRange(raw, source, now);
  const snapshot = await store.snapshot(actor, range);
  const days = daily(snapshot, range);
  const age = (at: string | null) => at === null ? null : Math.max(0, now - Date.parse(at));
  const receiptAge = age(snapshot.lastReceivedAt), measurementAge = age(snapshot.latestObservedAt);
  const available = [...new Set(snapshot.metrics.map((m) => m.metric))];
  const hasData = snapshot.days.some((d) => d.steps !== null) || snapshot.metrics.length + snapshot.sleep.length + snapshot.workouts.length > 0;
  const base = { range: { from: range.from, to: range.to, timezone: range.timezone }, source,
    generatedAt: new Date(now).toISOString(), hasData,
    sync: { lastReceivedAt: snapshot.lastReceivedAt, latestObservedAt: snapshot.latestObservedAt,
      receiptAgeMs: receiptAge, measurementAgeMs: measurementAge,
      receiptStale: receiptAge === null || receiptAge > 3600000,
      measurementStale: measurementAge === null || measurementAge > 3600000,
      staleThresholdMs: 3600000,
      note: "Receipt time is not measurement time. Daily steps have no measurement timestamp. Heart rate is a 5-minute average; sleep may arrive after waking and settling." },
    availableMetrics: [...(snapshot.days.some((d) => d.steps !== null) ? ["steps"] : []), ...available,
      ...(snapshot.sleep.length ? ["sleep"] : []), ...(snapshot.workouts.length ? ["workouts"] : [])],
    missingMetrics: ["steps", "heart_rate", "sleep", "workouts", ...metricNames.filter((m) => m !== "heart_rate")]
      .filter((m) => m === "steps" ? !snapshot.days.some((d) => d.steps !== null)
        : m === "sleep" ? !snapshot.sleep.length : m === "workouts" ? !snapshot.workouts.length : !available.includes(m as Metric)),
    notes: ["Missing data is null, never zero. Workout totals include only known fields; *_KnownCount reports coverage.",
      "Sleep belongs to its wake-up date; workouts to their start date in the query timezone. Daily steps retain the phone's date and stepsTimezone and cannot be rebinned.",
      "The current Android direct uploader sends steps, heart_rate, sleep and optional workouts. Other sample metrics require an adapter; absent fields do not imply device support."] };
  if (view === "samples") return { ...base, metric: range.metric, unit: metricUnit(range.metric),
    ...await store.samples(actor, range, range.metric, range.limit, range.after) };
  if (view === "sleep" || view === "workouts") {
    const all = snapshot[view];
    // Stable offset-free paging by start timestamp. Duplicate workout starts are possible, so
    // return all sessions (bounded by the 62-day query), with no misleading partial totals.
    return { ...base, records: all };
  }
  if (view === "status") return { ...base };
  if (view === "trends") return { ...base, days };
  const knownSteps = days.filter((d) => d.steps !== null);
  return { ...base, days, totals: {
    steps: knownSteps.length ? knownSteps.reduce((sum, d) => sum + d.steps!, 0) : null,
    stepsDaysPresent: knownSteps.length, stepsDaysMissing: days.length - knownSteps.length,
    sleep: sleepSummary(snapshot.sleep), workouts: snapshot.workouts.length || null,
  } };
}
