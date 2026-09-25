import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { MemoryRecord, MemoryStore, MemoryType } from "./memory.ts";

const TABLE = "memories";

// 统一的列投影：时间戳按 epoch 毫秒返回（float8 → number），由 mapRow 转 ISO。
const COLUMNS = `id,
  type,
  content,
  source,
  confidence,
  status,
  (extract(epoch FROM created_at) * 1000)::double precision       AS created_at_ms,
  (extract(epoch FROM updated_at) * 1000)::double precision       AS updated_at_ms,
  (extract(epoch FROM last_confirmed_at) * 1000)::double precision AS last_confirmed_at_ms`;

interface MemoryRow {
  id: string;
  type: string;
  content: string;
  source: string | null;
  confidence: number | null;
  status: string;
  created_at_ms: number | null;
  updated_at_ms: number | null;
  last_confirmed_at_ms: number | null;
}

export interface PostgresMemoryStore extends MemoryStore {
  close(): Promise<void>;
}

/**
 * 基于 Postgres 的 Memory store（`memories` 表）。只依赖 `pg`，不带 Vite/MCP
 * 依赖，可在 Horizon 的 tsx/Node 运行里直接加载。`ready()` 幂等建表并建索引。
 */
export function createPostgresMemoryStore(
  connectionString?: string,
): PostgresMemoryStore {
  let poolPromise: Promise<Pool> | undefined;

  function resolveUrl(): string {
    const url = (connectionString ?? process.env.DATABASE_URL ?? "").trim();
    if (!url) {
      throw new Error(
        "Memory 持久化未配置：请设置 DATABASE_URL 环境变量（如 Neon 的 Postgres 连接串）。",
      );
    }
    return url;
  }

  function pool(): Promise<Pool> {
    poolPromise ??= Promise.resolve().then(
      () => new Pool({ connectionString: resolveUrl(), max: 5 }),
    );
    return poolPromise;
  }

  function mapRow(r: MemoryRow): MemoryRecord {
    const iso = (ms: number | null) =>
      ms == null ? null : new Date(Number(ms)).toISOString();
    return {
      id: r.id,
      type: r.type as MemoryType,
      content: r.content,
      source: r.source ?? null,
      confidence: r.confidence == null ? null : Number(r.confidence),
      status: r.status === "archived" ? "archived" : "active",
      createdAt: iso(r.created_at_ms) ?? "",
      updatedAt: iso(r.updated_at_ms) ?? "",
      lastConfirmedAt: iso(r.last_confirmed_at_ms),
    };
  }

  return {
    async ready(): Promise<void> {
      const p = await pool();
      await p.query(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (
           id                text PRIMARY KEY,
           actor_id          text NOT NULL,
           type              text NOT NULL,
           content           text NOT NULL,
           source            text,
           confidence        double precision,
           status            text NOT NULL DEFAULT 'active',
           created_at        timestamptz NOT NULL DEFAULT now(),
           updated_at        timestamptz NOT NULL DEFAULT now(),
           last_confirmed_at timestamptz
         )`,
      );
      await p.query(
        `CREATE INDEX IF NOT EXISTS memories_actor_id_idx ON ${TABLE} (actor_id)`,
      );
      await p.query(
        `CREATE INDEX IF NOT EXISTS memories_actor_status_idx ON ${TABLE} (actor_id, status)`,
      );
      await p.query(
        `CREATE INDEX IF NOT EXISTS memories_actor_type_idx ON ${TABLE} (actor_id, type)`,
      );
    },

    async listActive(actorId: string): Promise<MemoryRecord[]> {
      const p = await pool();
      const r = await p.query<MemoryRow>(
        `SELECT ${COLUMNS} FROM ${TABLE}
          WHERE actor_id = $1 AND status = 'active'
          ORDER BY updated_at DESC`,
        [actorId],
      );
      return r.rows.map(mapRow);
    },

    async search(
      actorId: string,
      query: string,
      type?: MemoryType,
      limit = 20,
    ): Promise<MemoryRecord[]> {
      const p = await pool();
      const r = await p.query<MemoryRow>(
        `SELECT ${COLUMNS} FROM ${TABLE}
          WHERE actor_id = $1
            AND status = 'active'
            AND to_tsvector('simple', content) @@ plainto_tsquery('simple', $2)
            AND ($3::text IS NULL OR type = $3)
          ORDER BY updated_at DESC
          LIMIT $4`,
        [actorId, query, type ?? null, limit],
      );
      return r.rows.map(mapRow);
    },

    async add(
      actorId: string,
      input: {
        type: MemoryType;
        content: string;
        source?: string;
        confidence?: number;
      },
    ): Promise<MemoryRecord> {
      const p = await pool();
      const r = await p.query<MemoryRow>(
        `INSERT INTO ${TABLE}
           (id, actor_id, type, content, source, confidence, status,
            created_at, updated_at, last_confirmed_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', now(), now(), now())
         RETURNING ${COLUMNS}`,
        [
          randomUUID(),
          actorId,
          input.type,
          input.content,
          input.source ?? null,
          input.confidence ?? null,
        ],
      );
      return mapRow(r.rows[0]);
    },

    async update(
      actorId: string,
      id: string,
      input: {
        content?: string;
        type?: MemoryType;
        source?: string;
        confidence?: number;
      },
    ): Promise<MemoryRecord> {
      const p = await pool();
      const r = await p.query<MemoryRow>(
        `UPDATE ${TABLE} SET
           content           = COALESCE($3::text, content),
           type              = COALESCE($4::text, type),
           source            = COALESCE($5::text, source),
           confidence        = COALESCE($6::double precision, confidence),
           updated_at        = now(),
           last_confirmed_at = CASE WHEN $3::text IS NOT NULL THEN now() ELSE last_confirmed_at END
         WHERE id = $1 AND actor_id = $2
         RETURNING ${COLUMNS}`,
        [
          id,
          actorId,
          input.content ?? null,
          input.type ?? null,
          input.source ?? null,
          input.confidence ?? null,
        ],
      );
      if (r.rows.length === 0) {
        throw new Error("memory 不存在或不属于当前用户，无法更新");
      }
      return mapRow(r.rows[0]);
    },

    async archive(actorId: string, id: string): Promise<MemoryRecord> {
      const p = await pool();
      const r = await p.query<MemoryRow>(
        `UPDATE ${TABLE} SET status = 'archived', updated_at = now()
         WHERE id = $1 AND actor_id = $2
         RETURNING ${COLUMNS}`,
        [id, actorId],
      );
      if (r.rows.length === 0) {
        throw new Error("memory 不存在或不属于当前用户，无法归档");
      }
      return mapRow(r.rows[0]);
    },

    async close(): Promise<void> {
      if (poolPromise) {
        const p = await poolPromise;
        await p.end();
        poolPromise = undefined;
      }
    },
  };
}