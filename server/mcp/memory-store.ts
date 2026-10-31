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
import { cosineSimilarity, embedText, EMBEDDING_MODEL } from "./embedding.ts";
import type { EmbedOutcome } from "./embedding.ts";
import { scoreText } from "./tokenize.ts";

const TABLE = "memories";

/** 文本检索时最多扫描的候选行数（库很小，精确扫描足够；无需 pg_trgm/向量索引）。 */
const SEARCH_SCAN_CAP = 1000;

/**
 * 语义候选的分数门槛（实测 21 条真实记忆的分布）：
 *   - 强相关（「囡囡说爱我」）0.57–0.69
 *   - 弱相关（「那天我哭了」）0.45–0.56
 *   - 无关（「饮料不要太冰」「果茶」）0.32–0.47
 * 两者区间重叠，单靠绝对阈值分不开，所以用「绝对下限 + 相对 top 分的截断」：
 * 先要求 >= 0.5，再只保留不低于最高分 85% 的结果。
 */
const SEMANTIC_MIN_SCORE = 0.5;
const SEMANTIC_RELATIVE_CUTOFF = 0.85;

/** RRF（Reciprocal Rank Fusion）常数，用于融合文本与语义两路排名。 */
const RRF_K = 60;

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
  let readyPromise: Promise<void> | undefined;

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
      // 进程内只跑一次：Horizon 不执行 migrations，所以这里兼任自愈建表/补列；
      // 但每个请求都重复 DDL 是浪费，用 memoized promise 收敛成一次。
      readyPromise ??= (async () => {
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
             last_confirmed_at timestamptz,
             embedding         real[],
             embedding_model   text,
             embedding_updated_at timestamptz
           )`,
        );
        // 旧库补列（与 migrations/0002_semantic.sql 等价，幂等）。
        await p.query(
          `ALTER TABLE ${TABLE}
             ADD COLUMN IF NOT EXISTS embedding real[],
             ADD COLUMN IF NOT EXISTS embedding_model text,
             ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz`,
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
      })().catch((err) => {
        readyPromise = undefined; // 失败不缓存，下次重试
        throw err;
      });
      return readyPromise;
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
      const mode = opts.mode ?? "auto";

      // 两路检索共用的过滤条件。
      const baseParams: unknown[] = [actorId];
      const conds = [`actor_id = $1`, `status = 'active'`];
      if (opts.type) {
        baseParams.push(opts.type);
        conds.push(`type = $${baseParams.length}`);
      }
      if (opts.createdFrom != null) {
        baseParams.push(new Date(opts.createdFrom));
        conds.push(`created_at >= $${baseParams.length}`);
      }
      if (opts.createdTo != null) {
        baseParams.push(new Date(opts.createdTo));
        conds.push(`created_at <= $${baseParams.length}`);
      }
      const where = conds.join(" AND ");

      // ---- 文本路：应用层分词 + 相关度排序 ----
      // 数据库端 FTS 对中文无效（to_tsvector('simple') 把整句当 1 个 token），
      // 所以关键词匹配完全放在应用层做（见 tokenize.ts）。
      const textParams = [...baseParams, SEARCH_SCAN_CAP];
      const textRows = await p.query<MemoryRow>(
        `SELECT ${COLUMNS} FROM ${TABLE}
          WHERE ${where}
          ORDER BY updated_at DESC
          LIMIT $${textParams.length}`,
        textParams,
      );
      const textRanked = textRows.rows
        .map((row) => ({ record: mapRow(row), score: scoreText(row.content, query) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.record.updatedAt < b.record.updatedAt ? 1 : -1;
        });

      // ---- 语义路：BGE-M3 向量相似度 ----
      // 外部服务或向量缺失时静默降级为纯文本，绝不因此让搜索失败。
      let semanticAvailable = false;
      let semanticRanked: Array<{ record: MemoryRecord; score: number }> = [];
      if (mode !== "text") {
        const queryVector = await embedText(query);
        if (queryVector.ok) {
          const semParams = [...baseParams, SEARCH_SCAN_CAP];
          const semRows = await p.query<MemoryRow & { embedding: number[] | null }>(
            `SELECT ${COLUMNS}, embedding FROM ${TABLE}
              WHERE ${where} AND embedding IS NOT NULL
              ORDER BY updated_at DESC
              LIMIT $${semParams.length}`,
            semParams,
          );
          semanticAvailable = semRows.rows.length > 0;
          const scored = semRows.rows
            .map((row) => ({
              record: mapRow(row),
              score: cosineSimilarity(queryVector.vector, row.embedding ?? []),
            }))
            .sort((a, b) => b.score - a.score);
          // 绝对下限 + 相对截断：避免「不太相关但分数偏高」的结果混进来。
          const top = scored[0]?.score ?? 0;
          const cutoff = Math.max(SEMANTIC_MIN_SCORE, top * SEMANTIC_RELATIVE_CUTOFF);
          semanticRanked = scored.filter((entry) => entry.score >= cutoff);
        }
      }

      const useSemantic = mode !== "text" && semanticAvailable;
      const effectiveMode: "text" | "semantic" | "hybrid" = !useSemantic
        ? "text"
        : mode === "semantic"
          ? "semantic"
          : "hybrid";

      let ordered: MemoryRecord[];
      if (effectiveMode === "semantic") {
        ordered = semanticRanked.map((entry) => entry.record);
      } else if (effectiveMode === "text") {
        ordered = textRanked.map((entry) => entry.record);
      } else {
        // RRF 融合两路排名：两路都命中的结果自然排在最前。
        const fused = new Map<string, { record: MemoryRecord; score: number }>();
        textRanked.forEach((entry, i) => {
          const prev = fused.get(entry.record.id);
          fused.set(entry.record.id, {
            record: entry.record,
            score: (prev?.score ?? 0) + 1 / (RRF_K + i + 1),
          });
        });
        semanticRanked.forEach((entry, i) => {
          const prev = fused.get(entry.record.id);
          fused.set(entry.record.id, {
            record: prev?.record ?? entry.record,
            score: (prev?.score ?? 0) + 1 / (RRF_K + i + 1),
          });
        });
        ordered = [...fused.values()]
          .sort((a, b) => b.score - a.score)
          .map((entry) => entry.record);
      }

      const offset = opts.offset ?? 0;
      const limit = opts.limit ?? 20;
      return {
        total: ordered.length,
        items: ordered.slice(offset, offset + limit),
        mode: effectiveMode,
        semanticAvailable,
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
      // 写入时同步生成向量。嵌入服务不可用只会让该条暂时没有向量，
      // 写入本身照常成功，之后可用回填脚本补齐。
      const vector = await embedText(input.content);
      const r = await p.query<MemoryRow>(
        `INSERT INTO ${TABLE}
           (id, actor_id, type, content, source, confidence, status,
            created_at, updated_at, last_confirmed_at,
            embedding, embedding_model, embedding_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', now(), now(), now(),
                 $7::real[], $8::text, $9::timestamptz)
         RETURNING ${COLUMNS}`,
        [
          randomUUID(),
          actorId,
          input.type,
          input.content,
          input.source ?? null,
          input.confidence ?? null,
          vector.ok ? vector.vector : null,
          vector.ok ? EMBEDDING_MODEL : null,
          vector.ok ? new Date() : null,
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
      // 只有正文变了才需要重算向量；其余字段（类型/来源/置信度）不影响语义。
      const vector: EmbedOutcome =
        input.content != null
          ? await embedText(input.content)
          : { ok: false, reason: "not_configured" };
      const newVector = vector.ok ? vector.vector : null;
      const r = await p.query<MemoryRow>(
        `UPDATE ${TABLE} SET
           content           = COALESCE($3::text, content),
           type              = COALESCE($4::text, type),
           source            = COALESCE($5::text, source),
           confidence        = COALESCE($6::double precision, confidence),
           updated_at        = now(),
           last_confirmed_at = CASE WHEN $3::text IS NOT NULL THEN now() ELSE last_confirmed_at END,
           embedding            = CASE WHEN $7::real[] IS NOT NULL THEN $7::real[] ELSE embedding END,
           embedding_model      = CASE WHEN $7::real[] IS NOT NULL THEN $8::text ELSE embedding_model END,
           embedding_updated_at = CASE WHEN $7::real[] IS NOT NULL THEN now() ELSE embedding_updated_at END
         WHERE id = $1 AND actor_id = $2
         RETURNING ${COLUMNS}`,
        [
          id,
          actorId,
          input.content ?? null,
          input.type ?? null,
          input.source ?? null,
          input.confidence ?? null,
          newVector,
          newVector ? EMBEDDING_MODEL : null,
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
