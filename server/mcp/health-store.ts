import { Pool } from "pg";
import type { PoolClient } from "pg";
import { localDay, mergeSleep, shiftDay } from "./health-model.ts";
import { writeHealthUpload } from "./health-ingest.ts";
import type { Metric, Sleep, Upload, Workout } from "./health-model.ts";

export interface HealthRange { from: string; to: string; timezone: string; source: string }
export interface DailyRow { date: string; timezone: string; steps: number | null }
export interface MetricStats {
  date: string; metric: Metric; count: number; min: number; max: number; avg: number;
  latest_at: string;
}
export interface HealthSnapshot {
  days: DailyRow[]; metrics: MetricStats[]; sleep: Sleep[]; workouts: Workout[];
  lastReceivedAt: string | null; latestObservedAt: string | null;
}
export interface HealthStore {
  ingest(actor: string, source: string, zone: string, upload: Upload): Promise<void>;
  snapshot(actor: string, range: HealthRange): Promise<HealthSnapshot>;
  samples(actor: string, range: HealthRange, metric: Metric, limit: number, after?: string): Promise<{
    records: { timestamp: string; value: number }[]; nextCursor: string | null;
  }>;
  close(): Promise<void>;
}
type QueryClient = Pick<PoolClient, "query">;

export function createPostgresHealthStore(connectionString?: string): HealthStore {
  let instance: Pool | undefined;
  const pool = () => {
    if (!instance) {
      const url = connectionString ?? process.env.HEALTH_DATABASE_URL ?? process.env.DATABASE_URL;
      if (!url?.trim()) throw new Error("Health database is not configured");
      instance = new Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000, statement_timeout: 15000 });
      // Pool background errors must not become uncaught exceptions or print DB details.
      instance.on("error", () => {});
    }
    return instance;
  };
  async function transaction<T>(readOnly: boolean, run: (client: QueryClient) => Promise<T>): Promise<T> {
    const client = await pool().connect();
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  const iso = (v: Date | string | null) => v === null ? null : new Date(v).toISOString();
  return {
    async ingest(actor, source, zone, upload) {
      await transaction(false, async (c) => {
        await writeHealthUpload(c, actor, source, zone, upload);
      });
    },
    async snapshot(actor, range) {
      return transaction(true, async (c) => {
        const { source, from, to, timezone } = range;
        const params = [actor, source, from, to, timezone];
        const state = await c.query(`SELECT last_received_at,latest_observed_at FROM health_sources WHERE actor_id=$1 AND source_id=$2`, [actor, source]);
        const days = await c.query<DailyRow>(`SELECT date::text,timezone,steps FROM health_days
          WHERE actor_id=$1 AND source_id=$2 AND date BETWEEN $3::date AND $4::date ORDER BY date`, params.slice(0, 4));
        const metrics = await c.query<MetricStats>(`SELECT (observed_at AT TIME ZONE $5)::date::text AS date,
          metric,count(*)::integer AS count,min(value) AS min,max(value) AS max,avg(value) AS avg,
          to_char(max(observed_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS latest_at
          FROM health_samples WHERE actor_id=$1 AND source_id=$2
          AND observed_at >= ($3::date::timestamp AT TIME ZONE $5)
          AND observed_at < (($4::date+1)::timestamp AT TIME ZONE $5)
          GROUP BY 1,2 ORDER BY 1,2`, params);
        // Read two days of margin so a sleep revision crossing midnight can supersede its older
        // copy before the query attributes the final session to its local wake-up date.
        const sleeps = await c.query<{ data: Sleep }>(`SELECT data FROM health_sleep
          WHERE actor_id=$1 AND source_id=$2 AND end_at >= ($3::date::timestamp AT TIME ZONE $5)
          AND end_at < (($4::date+1)::timestamp AT TIME ZONE $5) ORDER BY start_at`,
        [actor, source, shiftDay(from, -2), shiftDay(to, 2), timezone]);
        const workouts = await c.query<{ data: Workout }>(`SELECT data FROM health_workouts
          WHERE actor_id=$1 AND source_id=$2 AND start_at >= ($3::date::timestamp AT TIME ZONE $5)
          AND start_at < (($4::date+1)::timestamp AT TIME ZONE $5) ORDER BY start_at,workout_id`, params);
        return { days: days.rows, metrics: metrics.rows,
          sleep: mergeSleep([], sleeps.rows.map((s) => s.data)).filter((s) => {
            const date = localDay(s.session_end_time, timezone); return date >= from && date <= to;
          }), workouts: workouts.rows.map((w) => w.data),
          lastReceivedAt: iso(state.rows[0]?.last_received_at ?? null),
          latestObservedAt: iso(state.rows[0]?.latest_observed_at ?? null) };
      });
    },
    async samples(actor, range, metric, limit, after) {
      const result = await pool().query<{ timestamp: string; value: number }>(`SELECT
        to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp,value
        FROM health_samples WHERE actor_id=$1 AND source_id=$2 AND metric=$6
        AND observed_at >= ($3::date::timestamp AT TIME ZONE $5)
        AND observed_at < (($4::date+1)::timestamp AT TIME ZONE $5)
        AND ($7::timestamptz IS NULL OR observed_at>$7::timestamptz)
        ORDER BY observed_at LIMIT $8`,
      [actor, range.source, range.from, range.to, range.timezone, metric, after ?? null, limit + 1]);
      return { records: result.rows.slice(0, limit),
        nextCursor: result.rows.length > limit ? result.rows[limit - 1].timestamp : null };
    },
    async close() { if (instance) { await instance.end(); instance = undefined; } },
  };
}
