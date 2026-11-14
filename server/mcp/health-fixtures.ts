// Entirely synthetic fixtures, not collected or shifted real health records.
import { normalizeUpload } from "./health-model.ts";
export const TEST_NOW = Date.parse("2001-02-04T12:00:00Z");
export const TEST_ZONE = "Asia/Shanghai";
export function syntheticWorkout() {
  const start = "2001-02-03T09:00:00+08:00";
  return { id: `gbw1:42:${Date.parse(start) / 1000}:3:128`, raw_type: 3, activity_kind: 128,
    start_time: start, end_time: "2001-02-03T09:45:00+08:00", timezone: TEST_ZONE,
    captured_at: "2001-02-03T10:00:00+08:00", active_seconds: 1800, total_seconds: 2400,
    distance_meters: 6789, active_calories: 123, average_heart_rate: 111, min_heart_rate: 77, max_heart_rate: 155 };
}
export function syntheticSleep(start = "2001-02-02T23:00:00+08:00", end = "2001-02-03T06:00:00+08:00") {
  const duration = (Date.parse(end) - Date.parse(start)) / 1000;
  return { session_start_time: start, session_end_time: end, duration_seconds: duration,
    stages: [{ stage: "deep", start_time: start, end_time: end, duration_seconds: duration }] };
}
export function syntheticBody() {
  return { date: "2001-02-03", steps: { total: 4321 },
    heart_rate: [{ timestamp: "2001-02-03T09:00:00+08:00", value: 81 }],
    sleep: [syntheticSleep()], workouts: [syntheticWorkout()] };
}
export function syntheticUpload() { return normalizeUpload(syntheticBody(), TEST_ZONE, TEST_NOW); }
