import { z } from "zod";
import { buildConversationGapResult } from "../../src/lib/time.ts";

/** Memory 条目类型（文档 §2/§4）。 */
export const MEMORY_TYPES = [
  "profile",
  "preference",
  "project",
  "relationship",
  "timeline",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export type MemoryStatus = "active" | "archived";

const memoryTypeSchema = z.enum(MEMORY_TYPES);

/** 对外返回的 memory 记录（时间戳统一为 ISO 字符串，方便模型阅读）。 */
export interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  source: string | null;
  confidence: number | null;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt: string | null;
}

/** Memory 持久化抽象。Postgres 实现见 memory-store.ts。 */
export interface MemoryStore {
  /** 幂等地确保表与索引存在。 */
  ready(): Promise<void>;
  listActive(actorId: string): Promise<MemoryRecord[]>;
  search(
    actorId: string,
    query: string,
    type?: MemoryType,
    limit?: number,
  ): Promise<MemoryRecord[]>;
  add(
    actorId: string,
    input: {
      type: MemoryType;
      content: string;
      source?: string;
      confidence?: number;
    },
  ): Promise<MemoryRecord>;
  update(
    actorId: string,
    id: string,
    input: {
      content?: string;
      type?: MemoryType;
      source?: string;
      confidence?: number;
    },
  ): Promise<MemoryRecord>;
  archive(actorId: string, id: string): Promise<MemoryRecord>;
}

/** 只读读取「上次交互时间」；memory_context 附带 gap 但不得写 last_seen_at。 */
export interface LastSeenReader {
  readLastSeen(actorId: string): Promise<number | null>;
}

export const MEMORY_TOOL_DESCRIPTIONS = {
  memory_context:
    "获取当前用户的长期记忆（仅 active），按 profile / preference / project / relationship / timeline 分组；同时附带与上次交互的间隔（只读，不改写 last_seen_at）。",
  memory_search:
    "在当前用户的 active 记忆中做文本搜索。输入 query；可选 type 过滤、limit 限制（缺省 20）。",
  memory_add:
    "新增一条长期记忆。输入 type、content；可选 source、confidence。按当前用户隔离存储。",
  memory_update:
    "更新当前用户的一条记忆。输入 id；可选 content/type/source/confidence。只能修改自己的记忆；提供 content 时会刷新 last_confirmed_at。",
  memory_archive:
    "归档当前用户的一条记忆（仅置 status=archived，不真正删除）。输入 id。只能归档自己的记忆。",
} as const;

const confidenceSchema = z
  .number()
  .optional()
  .describe("置信度，0–1 之间的浮点数");

export const memoryContextInputSchema = z.object({});

export const memorySearchInputSchema = z.object({
  query: z.string().min(1).describe("搜索关键词"),
  type: memoryTypeSchema.optional().describe("按记忆类型过滤"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("返回条数上限（缺省 20）"),
});

export const memoryAddInputSchema = z.object({
  type: memoryTypeSchema.describe("记忆类型"),
  content: z.string().min(1).describe("记忆内容"),
  source: z.string().optional().describe("来源（可选）"),
  confidence: confidenceSchema,
});

export const memoryUpdateInputSchema = z.object({
  id: z.string().min(1).describe("要更新的记忆 id"),
  content: z
    .string()
    .optional()
    .describe("新内容；提供即视为确认，刷新 last_confirmed_at"),
  type: memoryTypeSchema.optional().describe("新类型（可选）"),
  source: z.string().optional().describe("新来源（可选）"),
  confidence: confidenceSchema,
});

export const memoryArchiveInputSchema = z.object({
  id: z.string().min(1).describe("要归档的记忆 id"),
});

function emptyGrouped(): Record<MemoryType, MemoryRecord[]> {
  return {
    profile: [],
    preference: [],
    project: [],
    relationship: [],
    timeline: [],
  };
}

function groupByType(records: MemoryRecord[]): Record<MemoryType, MemoryRecord[]> {
  const out = emptyGrouped();
  for (const r of records) out[r.type].push(r);
  return out;
}

export async function runMemoryContext(
  actorId: string,
  store: MemoryStore,
  lastSeen: LastSeenReader,
) {
  const records = await store.listActive(actorId);
  // 只读读取上文时间（LastSeenReader 只 SELECT，不更新 last_seen_at）。
  const prev = await lastSeen.readLastSeen(actorId);
  return {
    memories: groupByType(records),
    gap: buildConversationGapResult(Date.now(), prev),
  };
}

export async function runMemorySearch(
  args: { query: string; type?: MemoryType; limit?: number },
  actorId: string,
  store: MemoryStore,
) {
  const query = args.query.trim();
  if (!query) throw new Error("query 不能为空");
  const memories = await store.search(actorId, query, args.type, args.limit);
  return { count: memories.length, memories };
}

export async function runMemoryAdd(
  args: {
    type: MemoryType;
    content: string;
    source?: string;
    confidence?: number;
  },
  actorId: string,
  store: MemoryStore,
) {
  const content = args.content.trim();
  if (!content) throw new Error("content 不能为空");
  if (args.confidence != null && !Number.isFinite(args.confidence)) {
    throw new Error("confidence 必须是有限数值");
  }
  return store.add(actorId, {
    type: args.type,
    content,
    source: args.source?.trim() || undefined,
    confidence: args.confidence,
  });
}

export async function runMemoryUpdate(
  args: {
    id: string;
    content?: string;
    type?: MemoryType;
    source?: string;
    confidence?: number;
  },
  actorId: string,
  store: MemoryStore,
) {
  const id = args.id?.trim();
  if (!id) throw new Error("id 不能为空");
  const content = args.content?.trim();
  if (content === "") throw new Error("content 不能为空字符串");
  if (args.confidence == null || Number.isFinite(args.confidence)) {
    // ok
  } else {
    throw new Error("confidence 必须是有限数值");
  }
  return store.update(actorId, args.id, {
    content: content || undefined,
    type: args.type,
    source: args.source?.trim() || undefined,
    confidence: args.confidence,
  });
}

export async function runMemoryArchive(
  args: { id: string },
  actorId: string,
  store: MemoryStore,
) {
  const id = args.id?.trim();
  if (!id) throw new Error("id 不能为空");
  return store.archive(actorId, args.id);
}