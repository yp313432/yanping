import assert from "node:assert/strict";
import {
  runMemoryAdd,
  runMemoryArchive,
  runMemoryContext,
  runMemoryGet,
  runMemoryList,
  runMemorySearch,
  runMemoryUpdate,
  type ListActiveOptions,
  type ListOptions,
  type MemoryRecord,
  type MemoryStore,
  type SearchOptions,
} from "./memory.ts";
import { scoreText } from "./tokenize.ts";
import { resolveActorId } from "../../server.ts";

type Stored = { record: MemoryRecord; actorId: string };

function inRange(
  record: MemoryRecord,
  from?: number,
  to?: number,
): boolean {
  const t = Date.parse(record.createdAt);
  if (from != null && t < from) return false;
  if (to != null && t > to) return false;
  return true;
}

// 内存实现：backing Map 模拟「外部持久化库」，行为与 Postgres store 对齐。
function makeStore(backing: Map<string, Stored>): MemoryStore {
  let seq = 0;
  const nowIso = () => new Date().toISOString();
  const activeRows = (actorId: string) =>
    [...backing.values()]
      .filter((s) => s.actorId === actorId && s.record.status === "active")
      .map((s) => s.record);

  return {
    async ready() {},
    async listActive(actorId: string, opts: ListActiveOptions = {}) {
      let rows = activeRows(actorId);
      if (opts.types && opts.types.length > 0) {
        rows = rows.filter((r) => (opts.types as string[]).includes(r.type));
      }
      rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      const offset = opts.offset ?? 0;
      const limit = opts.limit ?? 200;
      return rows.slice(offset, offset + limit);
    },
    async search(actorId: string, query: string, opts: SearchOptions = {}) {
      let rows = activeRows(actorId);
      if (opts.type) rows = rows.filter((r) => r.type === opts.type);
      rows = rows.filter((r) => inRange(r, opts.createdFrom, opts.createdTo));
      const scored = rows
        .map((r) => ({ r, score: scoreText(r.content, query) }))
        .filter((x) => x.score > 0);
      scored.sort(
        (a, b) =>
          b.score - a.score || (a.r.updatedAt < b.r.updatedAt ? 1 : -1),
      );
      const offset = opts.offset ?? 0;
      const limit = opts.limit ?? 20;
      return {
        total: scored.length,
        items: scored.slice(offset, offset + limit).map((x) => x.r),
      };
    },
    async get(actorId: string, id: string) {
      const s = backing.get(id);
      return s && s.actorId === actorId ? s.record : null;
    },
    async list(actorId: string, opts: ListOptions = {}) {
      let rows = [...backing.values()]
        .filter((s) => s.actorId === actorId)
        .map((s) => s.record);
      if (!opts.includeArchived) {
        rows = rows.filter((r) => r.status === "active");
      }
      if (opts.type) rows = rows.filter((r) => r.type === opts.type);
      rows = rows.filter((r) => inRange(r, opts.createdFrom, opts.createdTo));
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const offset = opts.offset ?? 0;
      const limit = opts.limit ?? 20;
      return {
        total: rows.length,
        items: rows.slice(offset, offset + limit),
      };
    },
    async add(actorId, input) {
      const record: MemoryRecord = {
        id: `m-${++seq}`,
        type: input.type,
        content: input.content,
        source: input.source ?? null,
        confidence: input.confidence ?? null,
        status: "active",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastConfirmedAt: nowIso(),
      };
      backing.set(record.id, { record, actorId });
      return record;
    },
    async update(actorId, id, input) {
      const s = backing.get(id);
      if (!s || s.actorId !== actorId) {
        throw new Error("memory 不存在或不属于当前用户，无法更新");
      }
      const next: MemoryRecord = { ...s.record };
      if (input.content != null) {
        next.content = input.content;
        next.lastConfirmedAt = nowIso();
      }
      if (input.type != null) next.type = input.type;
      if (input.source != null) next.source = input.source;
      if (input.confidence != null) next.confidence = input.confidence;
      next.updatedAt = nowIso();
      backing.set(id, { record: next, actorId: s.actorId });
      return next;
    },
    async archive(actorId, id) {
      const s = backing.get(id);
      if (!s || s.actorId !== actorId) {
        throw new Error("memory 不存在或不属于当前用户，无法归档");
      }
      const next: MemoryRecord = {
        ...s.record,
        status: "archived",
        updatedAt: nowIso(),
      };
      backing.set(id, { record: next, actorId: s.actorId });
      return next;
    },
  };
}

function header(v: string | undefined) {
  return { get: (name: string) => (name === "horizon-actor" ? (v ?? null) : null) };
}

async function main() {
  const backing = new Map<string, Stored>();
  const store = makeStore(backing);

  // 1. add + context 分组，仅 active
  {
    await runMemoryAdd(
      { type: "profile", content: "Name: Alice" },
      "actor-A",
      store,
    );
    await runMemoryAdd(
      { type: "preference", content: "prefers concise answers" },
      "actor-A",
      store,
    );
    const ctx = await runMemoryContext("actor-A", store, {
      readLastSeen: async () => null,
    });
    assert.equal(ctx.memories.profile.length, 1);
    assert.equal(ctx.memories.preference.length, 1);
    assert.equal(ctx.memories.project.length, 0);
    assert.equal(ctx.memories.relationship.length, 0);
    assert.equal(ctx.memories.timeline.length, 0);
    assert.equal(ctx.gap.hasPrevious, false);
    console.log("PASS 1 add + context 分组（仅 active）");
  }

  // 2. archive 后不进 context
  {
    const profileId = backing.size ? [...backing.keys()][0] : "";
    const added = await runMemoryAdd(
      { type: "project", content: "coffee ordering app" },
      "actor-A",
      store,
    );
    await runMemoryArchive({ id: profileId }, "actor-A", store);
    const ctx = await runMemoryContext("actor-A", store, {
      readLastSeen: async () => null,
    });
    assert.equal(ctx.memories.profile.length, 0);
    assert.equal(ctx.memories.project.length, 1);
    assert.equal(added.status, "active");
    console.log("PASS 2 archive 后不进 context");
  }

  // 3. search：命中、type 过滤、archived 默认不进入
  {
    const project = await runMemoryAdd(
      { type: "project", content: "shipping the coffee feature" },
      "actor-A",
      store,
    );
    const hit = await runMemorySearch({ query: "coffee" }, "actor-A", store);
    assert.equal(hit.count, 2); // "coffee ordering app" + "shipping the coffee feature"
    const byType = await runMemorySearch(
      { query: "coffee", type: "preference" },
      "actor-A",
      store,
    );
    assert.equal(byType.count, 0);
    await runMemoryArchive({ id: project.id }, "actor-A", store);
    const afterArch = await runMemorySearch(
      { query: "coffee" },
      "actor-A",
      store,
    );
    assert.equal(afterArch.count, 1);
    console.log("PASS 3 search：命中 / type 过滤 / archived 默认排除");
  }

  // 4. actor 隔离
  {
    await runMemoryAdd(
      { type: "profile", content: "topic: crypto" },
      "actor-B",
      store,
    );
    const ctxB = await runMemoryContext("actor-B", store, {
      readLastSeen: async () => null,
    });
    assert.equal(ctxB.memories.profile.length, 1);
    const hitAForB = await runMemorySearch(
      { query: "crypto" },
      "actor-A",
      store,
    );
    assert.equal(hitAForB.count, 0);
    console.log("PASS 4 actor 隔离");
  }

  // 5. 跨 actor update / archive 禁止
  {
    const target = await runMemoryAdd(
      { type: "preference", content: "dark mode preferred" },
      "actor-A",
      store,
    );
    await assert.rejects(
      () =>
        runMemoryUpdate({ id: target.id, content: "HACKED" }, "actor-B", store),
      /不存在或不属于/,
    );
    await assert.rejects(
      () => runMemoryArchive({ id: target.id }, "actor-B", store),
      /不存在或不属于/,
    );
    console.log("PASS 5 跨 actor update / archive 禁止");
  }

  // 6. update：content 提供即刷新 last_confirmed_at
  {
    const rec = await runMemoryAdd(
      { type: "preference", content: "uses dark theme" },
      "actor-A",
      store,
    );
    const upd = await runMemoryUpdate(
      { id: rec.id, content: "uses light theme now", source: "chat" },
      "actor-A",
      store,
    );
    assert.equal(upd.content, "uses light theme now");
    assert.equal(upd.source, "chat");
    assert.equal(upd.status, "active");
    assert.ok(upd.lastConfirmedAt != null);
    console.log("PASS 6 update：更新内容并刷新 last_confirmed_at");
  }

  // 7. 身份识别
  {
    assert.throws(() => resolveActorId(undefined), /无法识别用户身份/);
    assert.throws(() => resolveActorId(header("  ")), /无法识别用户身份/);
    assert.equal(resolveActorId(header("usr_1")), "usr_1");
    console.log("PASS 7 缺少 horizon-actor 报错 / 正常返回");
  }

  // 8. memory_context 附带 gap（只读，不改写）
  {
    const seen = new Map<string, number>();
    const lastSeen = {
      readLastSeen: async (id: string) =>
        seen.has(id) ? (seen.get(id) as number) : null,
    };
    seen.set("actor-A", Date.now() - 90_000);
    const ctx = await runMemoryContext("actor-A", store, lastSeen);
    assert.equal(ctx.gap.hasPrevious, true);
    assert.equal(ctx.gap.durationMs >= 90_000, true);
    console.log("PASS 8 memory_context 附带只读 gap");
  }

  // 9. 中文检索：二元组分词命中子串
  {
    await runMemoryAdd(
      { type: "preference", content: "用户喜欢少甜少冰的果茶" },
      "actor-E",
      store,
    );
    const hitFruit = await runMemorySearch({ query: "果茶" }, "actor-E", store);
    assert.equal(hitFruit.count, 1);
    const hitIce = await runMemorySearch({ query: "少冰" }, "actor-E", store);
    assert.equal(hitIce.count, 1);
    const missCoffee = await runMemorySearch(
      { query: "咖啡" },
      "actor-E",
      store,
    );
    assert.equal(missCoffee.count, 0);
    console.log("PASS 9 中文检索：果茶 / 少冰 命中，咖啡 不命中");
  }

  // 10. 按 createdAt 起止时间过滤
  {
    const r1 = await runMemoryAdd(
      { type: "timeline", content: "买了咖啡机" },
      "actor-D",
      store,
    );
    const r2 = await runMemoryAdd(
      { type: "timeline", content: "旅行归来" },
      "actor-D",
      store,
    );
    const r3 = await runMemoryAdd(
      { type: "timeline", content: "搬家" },
      "actor-D",
      store,
    );
    const setCreated = (id: string, iso: string) => {
      const s = backing.get(id);
      if (s) s.record.createdAt = iso;
    };
    setCreated(r1.id, "2026-10-28T10:00:00.000Z");
    setCreated(r2.id, "2026-11-05T10:00:00.000Z");
    setCreated(r3.id, "2026-12-01T10:00:00.000Z");

    const october = await runMemoryList(
      {
        createdFrom: "2026-10-01T00:00:00Z",
        createdTo: "2026-10-31T23:59:59Z",
      },
      "actor-D",
      store,
    );
    assert.equal(october.total, 1);
    assert.equal(october.memories[0].content, "买了咖啡机");

    const sinceNov = await runMemoryList(
      { createdFrom: "2026-11-01T00:00:00Z" },
      "actor-D",
      store,
    );
    assert.equal(sinceNov.total, 2);

    const searched = await runMemorySearch(
      { query: "咖啡", createdFrom: "2026-10-01T00:00:00Z" },
      "actor-D",
      store,
    );
    assert.equal(searched.total, 1);
    console.log("PASS 10 createdAt 起止时间过滤（list / search）");
  }

  // 11. 分页 list（无关键词，按类型翻页）
  {
    for (const name of ["甲", "乙", "丙", "丁", "戊"]) {
      await runMemoryAdd({ type: "timeline", content: `项目${name}` }, "actor-G", store);
    }
    const page1 = await runMemoryList({ type: "timeline", limit: 2 }, "actor-G", store);
    assert.equal(page1.total, 5);
    assert.equal(page1.count, 2);
    const page3 = await runMemoryList(
      { type: "timeline", limit: 2, offset: 4 },
      "actor-G",
      store,
    );
    assert.equal(page3.count, 1);
    const byType = await runMemoryList({ type: "project" }, "actor-G", store);
    assert.equal(byType.count, 0);
    console.log("PASS 11 分页 list：total / 每页条数 / 类型过滤");
  }

  // 12. 长文截断：列表只返回预览，标记 truncated 与原始长度
  {
    const longContent = "长".repeat(500);
    const long = await runMemoryAdd(
      { type: "project", content: longContent },
      "actor-C",
      store,
    );
    const listed = await runMemoryList({}, "actor-C", store);
    assert.equal(listed.memories[0].truncated, true);
    assert.equal(listed.memories[0].contentLength, 500);
    assert.ok(listed.memories[0].content.length < 500);
    assert.ok(listed.memories[0].content.endsWith("…"));

    const ctx = await runMemoryContext(
      "actor-C",
      store,
      { readLastSeen: async () => null },
      { perItemMaxChars: 60 },
    );
    assert.equal(ctx.memories.project[0].truncated, true);
    assert.equal(ctx.memories.project[0].contentLength, 500);
    assert.equal(ctx.budget.perItemMaxChars, 60);
    assert.equal(ctx.budget.truncated, true);

    const full = await runMemoryGet({ id: long.id }, "actor-C", store);
    assert.equal(full.memory.content, longContent);
    console.log("PASS 12 长文截断预览 + memory_get 读全文");
  }

  // 13. memory_get：不存在 / 跨 actor 不可读
  {
    await assert.rejects(
      () => runMemoryGet({ id: "no-such-id" }, "actor-A", store),
      /不存在或不属于/,
    );
    const another = await runMemoryAdd(
      { type: "profile", content: "other actor secret" },
      "actor-H",
      store,
    );
    await assert.rejects(
      () => runMemoryGet({ id: another.id }, "actor-A", store),
      /不存在或不属于/,
    );
    console.log("PASS 13 memory_get 不存在 / 跨 actor 拒绝");
  }

  // 14. memory_context 预算：超预算时记录 omitted 与 truncated
  {
    for (let i = 0; i < 6; i += 1) {
      await runMemoryAdd(
        { type: "project", content: `${i}号项目`.repeat(40) },
        "actor-F",
        store,
      );
    }
    const ctx = await runMemoryContext(
      "actor-F",
      store,
      { readLastSeen: async () => null },
      { budgetTokens: 300, perItemMaxChars: 40 },
    );
    const project = ctx.budget.perType.project;
    assert.ok(project.shown >= 1);
    assert.ok(project.omitted >= 1);
    assert.ok(ctx.budget.estimatedTokensUsed <= ctx.budget.totalTokens + 100);
    console.log("PASS 14 memory_context 预算：shown / omitted 生效");
  }

  console.log("\nALL MEMORY LOGIC TESTS PASSED");
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exitCode = 1;
});
