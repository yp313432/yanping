// Memory 的真实 Neon 集成测试（设置了 DATABASE_URL 才运行；否则跳过）。
// 运行：node --experimental-strip-types server/mcp/memory-store.integration.ts
// 覆盖：create / read / search（含中文分词）/ update / archive / 分页 / 日期过滤
//       / get / actor isolation / 跨 actor 禁止。
import assert from "node:assert/strict";
import { Pool } from "pg";
import { createPostgresMemoryStore } from "./memory-store.ts";

const url = (process.env.DATABASE_URL ?? process.argv[2] ?? "").trim();

async function main() {
  if (!url) {
    console.log("SKIP: 未设置 DATABASE_URL，跳过 Postgres 集成测试。");
    return;
  }

  const stamp = `${process.pid}-${Date.now()}`;
  const actorA = `mem-it-a-${stamp}`;
  const actorB = `mem-it-b-${stamp}`;
  const actorC = `mem-it-c-${stamp}`;

  const store = createPostgresMemoryStore(url);
  await store.ready();

  try {
    // create + read
    const prof = await store.add(actorA, {
      type: "profile",
      content: "Role: staff engineer, likes coffee",
      source: "user",
      confidence: 0.9,
    });
    assert.equal(prof.status, "active");
    assert.ok(prof.id.length > 0);

    const pref = await store.add(actorA, {
      type: "preference",
      content: "prefers short answers",
    });

    const list = await store.listActive(actorA);
    assert.equal(list.length, 2);
    console.log("PASS 1 create + read (listActive)");

    // search：应用层分词 + 相关度排序（sql 'simple' 配置不切分中文）
    const found = await store.search(actorA, "coffee");
    assert.equal(found.total, 1);
    assert.equal(found.items[0].id, prof.id);
    const byType = await store.search(actorA, "coffee", { type: "preference" });
    assert.equal(byType.total, 0);
    console.log("PASS 2 search（文本搜索 + type 过滤）");

    // 中文检索：二元组分词覆盖「少冰」这类子串
    const tea = await store.add(actorC, {
      type: "preference",
      content: "用户喜欢少甜少冰的果茶",
    });
    const zhFruit = await store.search(actorC, "果茶");
    assert.ok(zhFruit.items.some((r) => r.id === tea.id));
    const zhIce = await store.search(actorC, "少冰");
    assert.ok(zhIce.items.some((r) => r.id === tea.id));
    const zhMiss = await store.search(actorC, "咖啡");
    assert.equal(zhMiss.total, 0);
    console.log("PASS 2.1 中文检索：果茶 / 少冰 命中，咖啡 不命中");

    // update
    const upd = await store.update(actorA, prof.id, {
      content: "Role: staff engineer, loves coffee and tea",
      source: "project",
    });
    assert.equal(upd.content.includes("coffee and tea"), true);
    assert.equal(upd.status, "active");
    assert.ok(upd.lastConfirmedAt != null);
    console.log("PASS 3 update");

    // archive：archived 不进 context/search
    const arch = await store.archive(actorA, prof.id);
    assert.equal(arch.status, "archived");
    const afterArch = await store.listActive(actorA);
    assert.equal(afterArch.length, 1);
    assert.equal(afterArch[0].id, pref.id);
    const searchAfter = await store.search(actorA, "coffee");
    assert.equal(searchAfter.total, 0);
    console.log("PASS 4 archive（不进 context/search）");

    // 分页 list / createdAt 日期过滤 / get
    const page = await store.list(actorA, { limit: 1, offset: 0 });
    assert.equal(page.total, 1);
    assert.equal(page.items.length, 1);
    const future = await store.list(actorA, { createdFrom: Date.now() + 3_600_000 });
    assert.equal(future.total, 0);
    const got = await store.get(actorA, pref.id);
    assert.equal(got?.id, pref.id);
    assert.equal(await store.get(actorB, pref.id), null);
    console.log("PASS 4.1 分页 list / 日期过滤 / get");

    // actor isolation
    const listB = await store.listActive(actorB);
    assert.equal(listB.length, 0);
    console.log("PASS 5 actor isolation");

    // 跨 actor update / archive 禁止
    await assert.rejects(
      () => store.update(actorB, pref.id, { content: "hack" }),
      /不存在或不属于/,
    );
    await assert.rejects(() => store.archive(actorB, pref.id), /不存在或不属于/);
    console.log("PASS 6 跨 actor update / archive 禁止");
  } finally {
    // 清理测试数据
    const clean = new Pool({ connectionString: url });
    await clean.query("DELETE FROM memories WHERE actor_id IN ($1, $2, $3)", [
      actorA,
      actorB,
      actorC,
    ]);
    await clean.end();
    await store.close();
  }

  console.log("\nALL POSTGRES MEMORY INTEGRATION TESTS PASSED");
}

main().catch((err) => {
  console.error("INTEGRATION TEST FAILED:", err);
  process.exitCode = 1;
});
