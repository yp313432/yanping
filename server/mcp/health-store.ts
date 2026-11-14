import { Pool } from "pg";
import type { PoolClient } from "pg";
import { check, contentId, localDay, mergeSleep, shiftDay } from "./health-model.ts";
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
        const received = new Date().toISOString();
        const times = [...upload.samples.map((s) => s.timestamp), ...upload.sleep.map((s) => s.session_end_time),
          ...upload.workouts.map((w) => w.end_time)].sort();
        await c.query(`INSERT INTO health_sources(actor_id,source_id,last_received_at,latest_observed_at)
          VALUES($1,$2,$3,$4) ON CONFLICT(actor_id,source_id) DO UPDATE SET
          last_received_at=GREATEST(health_sources.last_received_at,EXCLUDED.last_received_at),
          latest_observed_at=GREATEST(health_sources.latest_observed_at,EXCLUDED.latest_observed_at)`,
        [actor, source, received, times.at(-1) ?? null]);
        // The source upsert locks its row until commit, serializing concurrent uploads per device.
        const day = await c.query(`INSERT INTO health_days(actor_id,source_id,date,timezone,steps,received_at)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(actor_id,source_id,date) DO UPDATE SET
          steps=GREATEST(health_days.steps,EXCLUDED.steps),received_at=GREATEST(health_days.received_at,EXCLUDED.received_at)
          WHERE health_days.timezone=EXCLUDED.timezone RETURNING date`,
        [actor, source, upload.date, zone, upload.steps, received]);
        check(day.rows.length === 1);
        // Collapse duplicate timestamps within a single payload before ON CONFLICT (PG rejects a
        // statement that attempts to update the same row twice). First observation wins, as upstream.
        const uniqueSamples = new Map<string, (typeof upload.samples)[number]>();
        for (const s of upload.samples) if (!uniqueSamples.has(s.metric + s.timestamp)) uniqueSamples.set(s.metric + s.timestamp, s);
        const samples = [...uniqueSamples.values()];
        if (samples.length) await c.query(`INSERT INTO health_samples(actor_id,source_id,metric,observed_at,value,received_at)
          SELECT $1,$2,x.metric,x.timestamp,x.value,$4 FROM jsonb_to_recordset($3::jsonb)
          AS x(metric text,timestamp timestamptz,value double precision)
          ON CONFLICT(actor_id,source_id,metric,observed_at) DO NOTHING`,
        [actor, source, JSON.stringify(samples), received]);
        const sleeps = upload.sleep.map((s) => ({ id: contentId(s), start: s.session_start_time, end: s.session_end_time, data: s }));
        if (sleeps.length) await c.query(`INSERT INTO health_sleep(actor_id,source_id,content_id,start_at,end_at,data,received_at)
          SELECT $1,$2,x.id,x.start,x."end",x.data,$4 FROM jsonb_to_recordset($3::jsonb)
          AS x(id text,start timestamptz,"end" timestamptz,data jsonb)
          ON CONFLICT(actor_id,source_id,content_id) DO NOTHING`,
        [actor, source, JSON.stringify(sleeps), received]);
        // captured_at is generated by the phone; late arrival cannot replace a newer enrichment.
        const uniqueWorkouts = new Map<string, Workout>();
        for (const w of upload.workouts) {
          const previous = uniqueWorkouts.get(w.id);
          if (!previous || w.captured_at > previous.captured_at) uniqueWorkouts.set(w.id, w);
        }
        const workouts = [...uniqueWorkouts.values()].map((w) => ({ id: w.id, start: w.start_time, captured: w.captured_at, data: w }));
        if (workouts.length) await c.query(`INSERT INTO health_workouts(actor_id,source_id,workout_id,start_at,captured_at,data,received_at)
          SELECT $1,$2,x.id,x.start,x.captured,x.data,$4 FROM jsonb_to_recordset($3::jsonb)
          AS x(id text,start timestamptz,captured timestamptz,data jsonb)
          ON CONFLICT(actor_id,source_id,workout_id) DO UPDATE SET data=EXCLUDED.data,
            captured_at=EXCLUDED.captured_at,received_at=GREATEST(health_workouts.received_at,EXCLUDED.received_at)
          WHERE EXCLUDED.captured_at>health_workouts.captured_at`,
        [actor, source, JSON.stringify(workouts), received]);
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
