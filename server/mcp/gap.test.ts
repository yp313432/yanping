import assert from "node:assert/strict";
import { runGetConversationGapAuto, type GapStore } from "./index.ts";
import { resolveActorId } from "../../server.ts";

// 共享 backing Map 模拟「外部持久化库」：无论多少个 store 实例（含「重启」后
// 新建的实例），都读写同一份状态，等价于多实例/重启后仍连到同一个 Postgres。
function makeStore(backing: Map<string, number>): GapStore {
  return {
    async readAndRecord(actorId: string, ts: number): Promise<number | null> {
      const prev = backing.has(actorId) ? (backing.get(actorId) as number) : null;
      backing.set(actorId, ts);
      return prev;
    },
  };
}

function header(v: string | undefined) {
  return { get: (name: string) => (name === "horizon-actor" ? (v ?? null) : null) };
}

async function main() {
  const backing = new Map<string, number>();

  // 1. 第一次调用
  {
    const store = makeStore(backing);
    const r = await runGetConversationGapAuto({ at: 1_000_000 }, "actor-1", store);
    assert.equal(r.hasPrevious, false);
    assert.equal(r.previousAt, null);
    assert.equal(backing.get("actor-1"), 1_000_000);
    console.log("PASS  1 第一次调用 -> hasPrevious=false 且已记录本次时间");
  }

  // 2. 第二次调用
  {
    const store = makeStore(backing);
    const r = await runGetConversationGapAuto({ at: 1_005_000 }, "actor-1", store);
    assert.equal(r.hasPrevious, true);
    assert.equal(r.durationMs, 5_000);
    assert.equal(backing.get("actor-1"), 1_005_000);
    console.log("PASS  2 第二次调用 -> 间隔 5000ms");
  }

  // 3. 多次连续调用
  {
    const store = makeStore(backing);
    let t = 1_005_000;
    for (let i = 0; i < 5; i += 1) {
      const next = t + 2_000;
      const r = await runGetConversationGapAuto({ at: next }, "actor-1", store);
      assert.equal(r.hasPrevious, true);
      assert.equal(r.durationMs, 2_000);
      t = next;
    }
    assert.equal(backing.get("actor-1"), t);
    console.log("PASS  3 多次连续调用 -> 每次间隔 2000ms，逐次推进");
  }

  // 4. 重启后调用：全新 store 实例（同一 backing = 同一外部库）
  {
    const store = makeStore(backing);
    const last = backing.get("actor-1") as number;
    const r = await runGetConversationGapAuto({ at: last + 7_000 }, "actor-1", store);
    assert.equal(r.hasPrevious, true);
    assert.equal(r.durationMs, 7_000);
    console.log("PASS  4 重启后调用 -> 仍读到重启前时间，间隔 7000ms");
  }

  // 5. 不同用户隔离
  {
    const store = makeStore(backing);
    const rA = await runGetConversationGapAuto({ at: 2_000_000 }, "actor-2", store);
    assert.equal(rA.hasPrevious, false);
    const rB = await runGetConversationGapAuto({ at: 3_000_000 }, "actor-3", store);
    assert.equal(rB.hasPrevious, false);
    const r1 = await runGetConversationGapAuto({ at: 4_000_000 }, "actor-1", store);
    assert.equal(r1.hasPrevious, true);
    console.log("PASS  5 不同用户彼此隔离，互不影响");
  }

  // 6. at 缺省 -> 当前时刻；首次仍 hasPrevious=false
  {
    const store = makeStore(backing);
    const r = await runGetConversationGapAuto({}, "actor-default", store);
    assert.equal(r.hasPrevious, false);
    console.log("PASS  6 at 缺省 -> 使用当前时刻，首次 hasPrevious=false");
  }

  // 7. 身份识别：缺失/空白 -> 明确报错；正常 -> 返回 actor id
  {
    assert.throws(() => resolveActorId(undefined), /无法识别用户身份/);
    assert.throws(() => resolveActorId(header("  ")), /无法识别用户身份/);
    assert.equal(resolveActorId(header("usr_123")), "usr_123");
    assert.throws(() => resolveActorId(header(undefined)), /无法识别用户身份/);
    console.log("PASS  7 身份识别 -> 缺失/空白报错，正常返回 actor id");
  }

  console.log("\nALL LOGIC TESTS PASSED");
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exitCode = 1;
});