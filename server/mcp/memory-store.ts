import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type {
  ListActiveOptions,
  ListOptions,
  MemoryRecord,
  MemoryStore,
  MemoryType,
  SearchOptions,
  SearchResult,
} from "./memory.ts";
import { scoreText } from "./tokenize.ts";

const TABLE = "memories";

/** 文本检索时最多扫描的候选行数（库很小，精确扫描足够；无需 pg_trgm/向量索引）。 */
const SEARCH_SCAN_CAP = 1000;

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
        "Memory 持久化未配置：运行时未读取到 DATABASE_URL 环境变量。" +
          "请在 Horizon 的 Settings → Environment Variables 里，给 Production 与 Preview " +
          "两个环境分别添加名为 DATABASE_URL 的变量（值填 Neon 的 Postgres 连接串），" +
          "保存后在对应环境 Redeploy 当前版本。",
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

    async listActive(
      actorId: string,
      opts: ListActiveOptions = {},
    ): Promise<MemoryRecord[]> {
      const p = await pool();
      const params: unknown[] = [actorId];
      let sql = `SELECT ${COLUMNS} FROM ${TABLE}
          WHERE actor_id = $1 AND status = 'active'`;
      if (opts.types && opts.types.length > 0) {
        params.push(opts.types);
        sql += ` AND type = ANY($${params.length}::text[])`;
      }
      sql += ` ORDER BY updated_at DESC`;
      params.push(opts.limit ?? 200);
      sql += ` LIMIT $${params.length}`;
      if (opts.offset) {
        params.push(opts.offset);
        sql += ` OFFSET $${params.length}`;
      }
      const r = await p.query<MemoryRow>(sql, params);
      return r.rows.map(mapRow);
    },

    async search(
      actorId: string,
      query: string,
      opts: SearchOptions = {},
    ): Promise<SearchResult> {
      const p = await pool();
      const params: unknown[] = [actorId];
      const conds = [`actor_id = $1`, `status = 'active'`];
      if (opts.type) {
        params.push(opts.type);
        conds.push(`type = $${params.length}`);
      }
      if (opts.createdFrom != null) {
        params.push(new Date(opts.createdFrom));
        conds.push(`created_at >= $${params.length}`);
      }
      if (opts.createdTo != null) {
        params.push(new Date(opts.createdTo));
        conds.push(`created_at <= $${params.length}`);
      }
      params.push(SEARCH_SCAN_CAP);
      const r = await p.query<MemoryRow>(
        `SELECT ${COLUMNS} FROM ${TABLE}
          WHERE ${conds.join(" AND ")}
          ORDER BY updated_at DESC
          LIMIT $${params.length}`,
        params,
      );

      // 应用层做分词匹配与相关度排序：sql 'simple' 配置不会切分中文，
      // 数据库端做 FTS 对中文基本无效（R@1 = 0%）。
      const scored = r.rows
        .map((row) => ({ record: mapRow(row), score: 0 }))
        .map((entry) => ({
          ...entry,
          score: scoreText(entry.record.content, query),
        }))
        .filter((entry) => entry.score > 0);
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.record.updatedAt < b.record.updatedAt ? 1 : -1;
      });

      const offset = opts.offset ?? 0;
      const limit = opts.limit ?? 20;
      return {
        total: scored.length,
        items: scored.slice(offset, offset + limit).map((s) => s.record),
      };
    },

    async get(actorId: string, id: string): Promise<MemoryRecord | null> {
      const p = await pool();
      const r = await p.query<MemoryRow>(
        `SELECT ${COLUMNS} FROM ${TABLE}
          WHERE id = $1 AND actor_id = $2`,
        [id, actorId],
      );
      return r.rows.length > 0 ? mapRow(r.rows[0]) : null;
    },

    async list(
      actorId: string,
      opts: ListOptions = {},
    ): Promise<SearchResult> {
      const p = await pool();
      const params: unknown[] = [actorId];
      const conds = [`actor_id = $1`];
      if (!opts.includeArchived) conds.push(`status = 'active'`);
      if (opts.type) {
        params.push(opts.type);
        conds.push(`type = $${params.length}`);
      }
      if (opts.createdFrom != null) {
        params.push(new Date(opts.createdFrom));
        conds.push(`created_at >= $${params.length}`);
      }
      if (opts.createdTo != null) {
        params.push(new Date(opts.createdTo));
        conds.push(`created_at <= $${params.length}`);
      }
      const where = conds.join(" AND ");
      const countRows = await p.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${TABLE} WHERE ${where}`,
        params,
      );
      const total = Number(countRows.rows[0]?.n ?? 0);
      const limit = opts.limit ?? 20;
      const offset = opts.offset ?? 0;
      const pageParams = [...params, limit, offset];
      const r = await p.query<MemoryRow>(
        `SELECT ${COLUMNS} FROM ${TABLE}
          WHERE ${where}
          ORDER BY created_at DESC
          LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams,
      );
      return { total, items: r.rows.map(mapRow) };
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
