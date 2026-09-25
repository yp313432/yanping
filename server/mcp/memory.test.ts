import assert from "node:assert/strict";
import {
  runMemoryAdd,
  runMemoryArchive,
  runMemoryContext,
  runMemorySearch,
  runMemoryUpdate,
  type MemoryRecord,
  type MemoryStore,
} from "./memory.ts";
import { resolveActorId } from "../../server.ts";

type Stored = { record: MemoryRecord; actorId: string };

// 内存实现：backing Map 模拟「外部持久化库」，行为与 Postgres store 对齐。
function makeStore(backing: Map<string, Stored>): MemoryStore {
  let seq = 0;
  const nowIso = () => new Date().toISOString();
  return {
    async ready() {},
    async listActive(actorId) {
      return [...backing.values()]
        .filter((s) => s.actorId === actorId && s.record.status === "active")
        .map((s) => s.record)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },
    async search(actorId, query, type, limit = 20) {
      const q = query.toLowerCase();
      return [...backing.values()]
        .filter((s) => {
          const r = s.record;
          return (
            s.actorId === actorId &&
            r.status === "active" &&
            (!type || r.type === type) &&
            r.content.toLowerCase().includes(q)
          );
        })
        .map((s) => s.record)
        .slice(0, limit);
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
    const afterArch = await runMemorySearch({ query: "coffee" }, "actor-A", store);
    assert.equal(afterArch.count, 1);
    console.log("PASS 3 search：命中 / type 过滤 / archived 默认排除");
  }

  // 4. actor 隔离
  {
    await runMemoryAdd({ type: "profile", content: "topic: crypto" }, "actor-B", store);
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
      readLastSeen: async (id: string) => (seen.has(id) ? (seen.get(id) as number) : null),
    };
    seen.set("actor-A", Date.now() - 90_000);
    const ctx = await runMemoryContext("actor-A", store, lastSeen);
    assert.equal(ctx.gap.hasPrevious, true);
    assert.equal(ctx.gap.durationMs >= 90_000, true);
    console.log("PASS 8 memory_context 附带只读 gap");
  }

  console.log("\nALL MEMORY LOGIC TESTS PASSED");
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exitCode = 1;
});