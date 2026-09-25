import { Pool } from "pg";
import type { GapStore } from "./index.ts";

const TABLE = "gap_last_seen";
const PG18_VERSION_NUM = 180000;

export interface PostgresGapStore extends GapStore {
  /** 幂等地确保表存在（每条连接首次用之前建一次即可）。 */
  ready(): Promise<void>;
  /** 关闭连接池。 */
  close(): Promise<void>;
  /** 只读读取该 actor 最近的 last_seen_at（epoch 毫秒），不写入。 */
  readLastSeen(actorId: string): Promise<number | null>;
}

/**
 * 基于 Postgres 的 `actor_id -> last_seen_at` 持久化 store。
 *
 * 版本分支（满足「确认 Neon 版本」的要求，Neon 支持 14/15/16/17/18）：
 * - PostgreSQL >= 18：用 `RETURNING OLD/NEW` 的单语句原子 UPSERT。纯插入（首次）
 *   时 `OLD.last_seen_at` 为 NULL → hasPrevious: false。
 * - PostgreSQL  < 18：用「物化行 + SELECT ... FOR UPDATE + UPDATE」的安全事务，
 *   并发下同样串行化，保证读到的「旧值」不会被并发写覆盖。
 *
 * 只依赖 `pg`（已在 dependencies），不带 Vite/MCP 依赖，可在 Horizon 的
 * tsx/Node 运行里直接加载（与 src/lib/db.ts 的 import.meta.glob 解耦）。
 */
export function createPostgresGapStore(
  connectionString?: string,
): PostgresGapStore {
  let poolPromise: Promise<Pool> | undefined;
  let versionPromise: Promise<number> | undefined;

  function resolveUrl(): string {
    const url = (connectionString ?? process.env.DATABASE_URL ?? "").trim();
    if (!url) {
      throw new Error(
        "Gap 持久化未配置：请设置 DATABASE_URL 环境变量（如 Neon 的 Postgres 连接串）。",
      );
    }
    return url;
  }

  function pool(): Promise<Pool> {
    poolPromise ??= Promise.resolve().then(
      () =>
        new Pool({
          connectionString: resolveUrl(),
          max: 5,
        }),
    );
    return poolPromise;
  }

  function serverVersion(p: Pool): Promise<number> {
    versionPromise ??= p
      .query("SELECT current_setting('server_version_num')::int AS v")
      .then((r) => Number(r.rows[0]?.v ?? 0));
    return versionPromise;
  }

  function toNumberOrNull(
    v: number | string | null | undefined,
  ): number | null {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  return {
    async ready(): Promise<void> {
      const p = await pool();
      await p.query(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (
           actor_id     text PRIMARY KEY,
           last_seen_at timestamptz
         )`,
      );
    },

    async readAndRecord(actorId: string, ts: number): Promise<number | null> {
      const p = await pool();
      const iso = new Date(ts).toISOString();
      const v = await serverVersion(p);

      if (v >= PG18_VERSION_NUM) {
        const r = await p.query<{ prev_ms: number | string | null }>(
          `INSERT INTO ${TABLE} (actor_id, last_seen_at)
           VALUES ($1, $2::timestamptz)
           ON CONFLICT (actor_id) DO UPDATE
             SET last_seen_at = EXCLUDED.last_seen_at
           RETURNING (extract(epoch FROM OLD.last_seen_at) * 1000)::double precision AS prev_ms`,
          [actorId, iso],
        );
        return toNumberOrNull(r.rows[0]?.prev_ms);
      }

      // 版本 < 18 的安全事务：先物化行（并发首个调用时靠主键串行化），
      // 再 FOR UPDATE 锁定并读旧值，最后写入新时间。
      const client = await p.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO ${TABLE} (actor_id, last_seen_at)
           VALUES ($1, NULL)
           ON CONFLICT (actor_id) DO NOTHING`,
          [actorId],
        );
        const got = await client.query<{ prev_ms: number | string | null }>(
          `SELECT (extract(epoch FROM last_seen_at) * 1000)::double precision AS prev_ms
             FROM ${TABLE}
            WHERE actor_id = $1
              FOR UPDATE`,
          [actorId],
        );
        await client.query(
          `UPDATE ${TABLE} SET last_seen_at = $2::timestamptz WHERE actor_id = $1`,
          [actorId, iso],
        );
        await client.query("COMMIT");
        return toNumberOrNull(got.rows[0]?.prev_ms);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async readLastSeen(actorId: string): Promise<number | null> {
      const p = await pool();
      const r = await p.query<{ last_ms: number | string | null }>(
        `SELECT (extract(epoch FROM last_seen_at) * 1000)::double precision AS last_ms
           FROM ${TABLE}
          WHERE actor_id = $1`,
        [actorId],
      );
      return toNumberOrNull(r.rows[0]?.last_ms);
    },

    async close(): Promise<void> {
      if (poolPromise) {
        const p = await poolPromise;
        await p.end();
        poolPromise = undefined;
        versionPromise = undefined;
      }
    },
  };
}