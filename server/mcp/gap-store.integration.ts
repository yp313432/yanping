// Postgres 真实集成测试（只在设置了 DATABASE_URL 时运行；否则跳过）。
// 运行：node --experimental-strip-types server/mcp/gap-store.integration.ts
// 或传连接串：node --experimental-strip-types server/mcp/gap-store.integration.ts "postgres://..."
//
// 覆盖：第一次调用 / 第二次调用 / 重启后（新连接池）调用 / 多次连续调用。
import assert from "node:assert/strict";
import { Pool } from "pg";
import { createPostgresGapStore } from "./gap-store.ts";

const url = (process.env.DATABASE_URL ?? process.argv[2] ?? "").trim();

async function main() {
  if (!url) {
    console.log("SKIP: 未设置 DATABASE_URL，跳过 Postgres 集成测试。");
    return;
  }

  // 打印服务端版本，确认走 PG18 RETURNING OLD/NEW 还是 <18 事务回退。
  const probe = new Pool({ connectionString: url });
  const vres = await probe.query("SELECT current_setting('server_version_num') AS v");
  const versionNum = Number(vres.rows[0]?.v ?? 0);
  console.log(`Postgres server_version_num = ${versionNum}` + (versionNum >= 180000 ? "（>=18，走 RETURNING OLD/NEW 路径）" : "（<18，走安全事务路径）"));
  await probe.end();

  const actor = `it-${process.pid}-${Date.now()}`;
  const t0 = 1_700_000_000_000;

  // 第一次调用
  const s1 = createPostgresGapStore(url);
  await s1.ready();
  const r1 = await s1.readAndRecord(actor, t0);
  assert.equal(r1, null);
  console.log("PASS 1 第一次调用 -> prev = null");

  // 第二次调用
  const r2 = await s1.readAndRecord(actor, t0 + 5000);
  assert.equal(r2, t0);
  console.log("PASS 2 第二次调用 -> prev = t0（间隔 5000ms）");

  // 多次连续调用
  let prev = t0 + 5000;
  for (let i = 0; i < 5; i += 1) {
    const next = prev + 2000;
    const got = await s1.readAndRecord(actor, next);
    assert.equal(got, prev);
    prev = next;
  }
  console.log("PASS 3 多次连续调用 -> 每次间隔 2000ms");

  // 重启后调用：全新 store（新连接池），读同一份 Postgres
  const s2 = createPostgresGapStore(url);
  await s2.ready();
  const r4 = await s2.readAndRecord(actor, prev + 7000);
  assert.equal(r4, prev);
  console.log("PASS 4 重启后调用 -> 仍读到上次时间（间隔 7000ms）");

  // 清理测试行
  const clean = new Pool({ connectionString: url });
  await clean.query("DELETE FROM gap_last_seen WHERE actor_id = $1", [actor]);
  await clean.end();
  await s1.close();
  await s2.close();

  console.log("\nALL POSTGRES INTEGRATION TESTS PASSED");
}

main().catch((err) => {
  console.error("INTEGRATION TEST FAILED:", err);
  process.exitCode = 1;
});