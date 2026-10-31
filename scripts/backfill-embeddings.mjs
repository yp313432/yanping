/**
 * 回填 memories.embedding（BGE-M3，1024 维）。
 *
 * 用法：
 *   DATABASE_URL=... CF_ACCOUNT_ID=... CF_API_TOKEN=... node scripts/backfill-embeddings.mjs
 *
 * 只处理还没有向量的行；可重复执行（幂等），中断后重跑会从剩余行继续。
 */
import pg from "pg";

const MODEL = "@cf/baai/bge-m3";
const DIM = 1024;
const CONCURRENCY = 3;
const MAX_INPUT_CHARS = 2000;

const accountId = process.env.CF_ACCOUNT_ID?.trim();
const token = process.env.CF_API_TOKEN?.trim();
if (!process.env.DATABASE_URL?.trim()) {
  console.log("[backfill] DATABASE_URL 未设置，跳过");
  process.exit(0);
}
if (!accountId || !token) {
  console.log("[backfill] 缺少 CF_ACCOUNT_ID / CF_API_TOKEN，跳过向量回填");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: CONCURRENCY });

const pending = await pool.query(
  "select id, content from memories where embedding is null order by created_at",
);
console.log(`[backfill] 待回填 ${pending.rows.length} 条`);

async function embed(text) {
  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ text: [input] }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  const json = await res.json();
  const vec = json?.result?.data?.[0];
  if (!Array.isArray(vec) || vec.length !== DIM) {
    throw new Error(`unexpected shape: ${JSON.stringify(json).slice(0, 160)}`);
  }
  return vec;
}

let done = 0;
let failed = 0;

async function worker(queue) {
  for (;;) {
    const row = queue.shift();
    if (!row) return;
    try {
      const vec = await embed(row.content);
      await pool.query(
        "update memories set embedding = $2::real[], embedding_model = $3, embedding_updated_at = now() where id = $1",
        [row.id, vec, MODEL],
      );
      done += 1;
      if (done % 5 === 0) console.log(`[backfill] 进度 ${done}/${pending.rows.length}`);
    } catch (err) {
      failed += 1;
      console.error(`[backfill] 失败 ${row.id}: ${err.message}`);
    }
  }
}

const queue = [...pending.rows];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log(`[backfill] 完成：成功 ${done}，失败 ${failed}`);
const left = await pool.query("select count(*)::int as n from memories where embedding is null");
console.log(`[backfill] 剩余未回填 ${left.rows[0].n} 条`);

await pool.end();
