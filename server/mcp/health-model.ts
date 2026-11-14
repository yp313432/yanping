import { createHash } from "node:crypto";

// This module uses only Node built-ins so wire validation can also run offline.
export class HealthInputError extends Error {
  constructor() { super("Invalid health payload or query"); }
}
export function check(value: unknown): asserts value {
  if (!value) throw new HealthInputError();
}
export function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  check(Object.keys(value).every((key) => allowed.includes(key)));
}
export function number(value: unknown, min: number, max: number, integer = false): number {
  check(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max);
  check(!integer || Number.isSafeInteger(value));
  return value;
}
export function dateDay(value: unknown): string {
  check(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
  check(value >= "1900-01-01" && value <= "2100-12-31");
  const parsed = new Date(value + "T00:00:00Z");
  check(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value);
  return value;
}
export function timestamp(value: unknown): string {
  check(typeof value === "string" && value.length <= 40);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  check(match);
  dateDay(match[1]);
  check(+match[2] < 24 && +match[3] < 60 && +match[4] < 60);
  const millis = Date.parse(value);
  check(Number.isFinite(millis));
  return new Date(millis).toISOString();
}
export function timezone(value: unknown): string {
  check(typeof value === "string" && value.length <= 64);
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); }
  catch { throw new HealthInputError(); }
  return value;
}
export function localDay(instant: string | number, zone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(instant));
}
export function shiftDay(day: string, amount: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + amount * 86400000).toISOString().slice(0, 10);
}
function list(value: unknown, max: number): unknown[] {
  check(Array.isArray(value) && value.length <= max);
  return value;
}
const METRICS = {
  heart_rate: { unit: "bpm", min: 1, max: 300 },
  spo2: { unit: "%", min: 1, max: 100 },
  stress: { unit: "index", min: 0, max: 100 },
  hrv: { unit: "ms", min: 0, max: 1000 },
  resting_heart_rate: { unit: "bpm", min: 1, max: 300 },
  respiratory_rate: { unit: "breaths/min", min: 1, max: 100 },
  skin_temperature: { unit: "C", min: 10, max: 50 },
} as const;
export type Metric = keyof typeof METRICS;
export const metricNames = Object.keys(METRICS) as Metric[];
export function metricUnit(metric: Metric) { return METRICS[metric].unit; }
export interface Sample { metric: Metric; timestamp: string; value: number }
export interface Stage { stage: "deep" | "light" | "rem" | "awake"; start_time: string; end_time: string; duration_seconds: number }
export interface Sleep {
  session_start_time: string; session_end_time: string; duration_seconds: number;
  stages: Stage[]; score: number | null;
}
export interface Workout {
  id: string; raw_type: number; activity_kind: number; start_time: string; end_time: string;
  timezone: string; captured_at: string; active_seconds: number; total_seconds: number | null;
  distance_meters: number | null; active_calories: number | null;
  average_heart_rate: number | null; min_heart_rate: number | null; max_heart_rate: number | null;
}
export interface Upload { date: string; steps: number | null; samples: Sample[]; sleep: Sleep[]; workouts: Workout[] }
function heart(value: unknown) {
  const bpm = number(value, 1, 300, true);
  check(bpm !== 255);
  return bpm;
}
function sleepSession(raw: unknown): Sleep {
  const s = object(raw);
  keys(s, ["session_start_time", "session_end_time", "duration_seconds", "stages", "score"]);
  const start = timestamp(s.session_start_time), end = timestamp(s.session_end_time);
  const elapsed = (Date.parse(end) - Date.parse(start)) / 1000;
  check(elapsed > 0 && elapsed <= 172800);
  const duration = number(s.duration_seconds, 1, elapsed, true);
  const stages = list(s.stages ?? [], 4096).map((rawStage): Stage => {
    const v = object(rawStage);
    keys(v, ["stage", "start_time", "end_time", "duration_seconds"]);
    check(["deep", "light", "rem", "awake"].includes(String(v.stage)));
    const a = timestamp(v.start_time), b = timestamp(v.end_time);
    check(a >= start && b <= end && b > a);
    const seconds = number(v.duration_seconds, 1, elapsed, true);
    check(seconds === (Date.parse(b) - Date.parse(a)) / 1000);
    return { stage: v.stage as Stage["stage"], start_time: a, end_time: b, duration_seconds: seconds };
  }).sort((a, b) => a.start_time.localeCompare(b.start_time));
  stages.forEach((s, i) => check(i === 0 || s.start_time >= stages[i - 1].end_time));
  if (stages.length) check(stages.filter((s) => s.stage !== "awake").reduce((sum, s) => sum + s.duration_seconds, 0) === duration);
  return { session_start_time: start, session_end_time: end, duration_seconds: duration,
    stages, score: s.score == null ? null : number(s.score, 0, 100) };
}
function workout(raw: unknown): Workout {
  const w = object(raw);
  keys(w, ["id", "raw_type", "activity_kind", "start_time", "end_time", "timezone", "captured_at",
    "active_seconds", "total_seconds", "distance_meters", "active_calories", "average_heart_rate", "min_heart_rate", "max_heart_rate"]);
  check(typeof w.id === "string");
  const id = /^gbw1:([1-9]\d{0,14}):(-?\d+):(\d{1,3}):(\d+)$/.exec(w.id);
  check(id && id.slice(1).every((n) => Number.isSafeInteger(+n)));
  const start = timestamp(w.start_time), end = timestamp(w.end_time), captured = timestamp(w.captured_at);
  const rawType = number(w.raw_type, 0, 255, true), kind = number(w.activity_kind, 0, 2147483647, true);
  check(+id[2] === Date.parse(start) / 1000 && +id[3] === rawType && +id[4] === kind);
  const elapsed = (Date.parse(end) - Date.parse(start)) / 1000;
  check(elapsed >= 1 && elapsed <= 604800 && captured >= end);
  const active = number(w.active_seconds, 0, elapsed, true);
  const optional = (key: string, max: number, min = 0, integer = false) =>
    w[key] == null ? null : number(w[key], min, max, integer);
  const avg = w.average_heart_rate == null ? null : heart(w.average_heart_rate);
  const min = w.min_heart_rate == null ? null : heart(w.min_heart_rate);
  const max = w.max_heart_rate == null ? null : heart(w.max_heart_rate);
  check(min === null || max === null || min <= max);
  check(avg === null || ((min === null || avg >= min) && (max === null || avg <= max)));
  return { id: w.id, raw_type: rawType, activity_kind: kind, start_time: start, end_time: end,
    timezone: timezone(w.timezone), captured_at: captured, active_seconds: active,
    total_seconds: optional("total_seconds", elapsed, active, true),
    distance_meters: optional("distance_meters", 10000000), active_calories: optional("active_calories", 10000000),
    average_heart_rate: avg, min_heart_rate: min, max_heart_rate: max };
}
export function normalizeUpload(raw: unknown, zone: string, now = Date.now()): Upload {
  timezone(zone);
  const body = object(raw);
  keys(body, ["date", "steps", "heart_rate", "sleep", "workouts", "metrics"]);
  const date = dateDay(body.date);
  let steps: number | null = null;
  if (body.steps !== undefined) {
    const v = object(body.steps); keys(v, ["total"]);
    steps = number(v.total, 0, 1000000, true);
  }
  const samples: Sample[] = list(body.heart_rate ?? [], 2000).map((raw): Sample => {
    const v = object(raw); keys(v, ["timestamp", "value"]);
    return { metric: "heart_rate", timestamp: timestamp(v.timestamp), value: heart(v.value) };
  });
  // Optional extension for future adapters; the current Android direct uploader does not emit it.
  for (const raw of list(body.metrics ?? [], 2000)) {
    const v = object(raw); keys(v, ["metric", "timestamp", "value"]);
    check(metricNames.includes(v.metric as Metric));
    const metric = v.metric as Metric, rule = METRICS[metric];
    const value = metric === "heart_rate" || metric === "resting_heart_rate"
      ? heart(v.value) : number(v.value, rule.min, rule.max);
    samples.push({ metric, timestamp: timestamp(v.timestamp), value });
  }
  const sleep = list(body.sleep ?? [], 128).map(sleepSession);
  const workouts = list(body.workouts ?? [], 128).map(workout);
  check(steps !== null || samples.length + sleep.length + workouts.length > 0);
  check(date <= localDay(now + 300000, zone));
  const observed = [...samples.map((s) => s.timestamp), ...sleep.map((s) => s.session_end_time),
    ...workouts.map((w) => w.captured_at)];
  observed.forEach((t) => check(Date.parse(t) <= now + 300000));
  // Dates are emitted in the phone's local zone. A mismatch fails visibly instead of silently
  // moving daily steps to the wrong date; configure the receiver to match the phone.
  samples.forEach((s) => check(localDay(s.timestamp, zone) === date));
  sleep.forEach((s) => check(localDay(s.session_end_time, zone) === date));
  workouts.forEach((w) => check(localDay(w.start_time, zone) === date));
  return { date, steps, samples, sleep, workouts };
}
export function contentId(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Keep non-overlapping naps; collapse all transitively overlapping revisions of a night.
 * The most complete span wins regardless of retry order, including across midnight. */
export function mergeSleep(stored: Sleep[], incoming: Sleep[]): Sleep[] {
  const sorted = [...stored, ...incoming].sort((a, b) => a.session_start_time.localeCompare(b.session_start_time));
  const groups: { end: string; best: Sleep }[] = [];
  for (const s of sorted) {
    const g = groups.at(-1);
    if (!g || s.session_start_time >= g.end) { groups.push({ end: s.session_end_time, best: s }); continue; }
    if (s.session_end_time > g.end) g.end = s.session_end_time;
    const a = g.best;
    const rank = (v: Sleep) => [v.session_end_time, String(v.duration_seconds).padStart(6, "0"),
      String(v.stages.length).padStart(5, "0"), contentId(v)].join("|");
    if (rank(s) > rank(a)) g.best = s;
  }
  return groups.map((g) => g.best);
}
