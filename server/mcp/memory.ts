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

/**
 * 列表 / 搜索 / 上下文里返回的条目：content 是**截断后的预览**，完整内容用
 * memory_get 按 id 读取。contentLength 是原始字符数，truncated 表示是否被截断。
 */
export interface MemoryItem extends MemoryRecord {
  contentLength: number;
  truncated: boolean;
}

/** 按 createdAt 过滤的起止时间（epoch 毫秒，闭区间）。 */
export interface MemoryTimeRange {
  createdFrom?: number;
  createdTo?: number;
}

export interface ListActiveOptions {
  types?: MemoryType[];
  limit?: number;
  offset?: number;
}

/**
 * 检索模式。
 *   - auto：有向量能力就用「文本 + 语义」混合排序，不可用则自动降级为纯文本
 *   - text：只用分词 + 相关度（不依赖外部服务）
 *   - semantic：只用向量相似度（语义不可用时降级为纯文本，并在结果里说明）
 *   - hybrid：强制混合（等价于 auto，但语义不可用时也会明确报告）
 */
export type MemorySearchMode = "auto" | "text" | "semantic" | "hybrid";

export interface SearchOptions extends MemoryTimeRange {
  type?: MemoryType;
  limit?: number;
  offset?: number;
  mode?: MemorySearchMode;
}

export interface ListOptions extends MemoryTimeRange {
  type?: MemoryType;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export interface SearchResult {
  total: number;
  items: MemoryRecord[];
  /** 实际生效的检索模式（语义不可用时降级，这里反映真实情况）。 */
  mode?: "text" | "semantic" | "hybrid";
  /** 语义检索是否可用；false 表示本次已降级为纯文本。 */
  semanticAvailable?: boolean;
}

/** Memory 持久化抽象。Postgres 实现见 memory-store.ts。 */
export interface MemoryStore {
  /** 幂等地确保表与索引存在。 */
  ready(): Promise<void>;
  /** 只读 active 记录（按 updatedAt 倒序），用于 memory_context。 */
  listActive(actorId: string, opts?: ListActiveOptions): Promise<MemoryRecord[]>;
  /** 文本检索（应用层分词 + 相关度排序），返回匹配总数与当前页。 */
  search(
    actorId: string,
    query: string,
    opts?: SearchOptions,
  ): Promise<SearchResult>;
  /** 按 id 读取单条（含 archived），不存在返回 null。 */
  get(actorId: string, id: string): Promise<MemoryRecord | null>;
  /** 分页浏览（不需要关键词），返回匹配总数与当前页。 */
  list(actorId: string, opts?: ListOptions): Promise<SearchResult>;
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
    "获取当前用户的长期记忆（仅 active），按 profile / preference / project / relationship / timeline 分组，并附带与上次交互的间隔（只读）。" +
    "支持 budgetTokens（默认 4000）控制总长度、perItemMaxChars（默认 280）控制单条长度、includeTypes 过滤类型；" +
    "超长内容会被截断并标记 truncated，需要全文时用 memory_get 按 id 读取。",
  memory_search:
    "在当前用户的 active 记忆中检索。默认 auto 模式：同时做「中文分词关键词匹配」和「语义向量相似度」（BGE-M3），两者用 RRF 融合排序——" +
    "所以既能用原词搜（果茶、少冰），也能用意思搜（比如「那天我哭了」能找到「在房间里哭了很久」）。" +
    "支持 query、mode（auto/text/semantic/hybrid）、type 过滤、limit/offset 分页，以及 createdAt 起止时间过滤（createdFrom / createdTo，ISO 时间或 epoch 毫秒）。" +
    "返回 total、mode（实际生效的模式）、semanticAvailable、以及当前页 memories（长文截断并标记 truncated，全文用 memory_get）。",
  memory_list:
    "分页浏览当前用户的记忆，不需要关键词。支持 type 过滤、limit/offset 分页、createdAt 起止时间过滤（createdFrom / createdTo）与 includeArchived。" +
    "返回 total（总数）与当前页 memories（长文截断并标记 truncated，全文用 memory_get）。",
  memory_get:
    "按 id 读取一条记忆的完整内容（不截断；可读取到 archived 的记录）。只能读取自己的记忆。",
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

const createdAtSchema = z
  .union([z.string(), z.number()])
  .optional()
  .describe("createdAt 过滤时间（ISO 8601 字符串或 epoch 毫秒）");

export const memoryContextInputSchema = z.object({
  budgetTokens: z
    .number()
    .int()
    .min(200)
    .max(16000)
    .optional()
    .describe("返回内容的总 token 预算，默认 4000"),
  perItemMaxChars: z
    .number()
    .int()
    .min(40)
    .max(4000)
    .optional()
    .describe("单条内容最大字符数，默认 280；超出截断并标记 truncated"),
  includeTypes: z
    .array(memoryTypeSchema)
    .optional()
    .describe("只包含这些记忆类型；缺省包含全部类型"),
});

export const memorySearchInputSchema = z.object({
  query: z.string().min(1).describe("搜索关键词或一句话描述"),
  mode: z
    .enum(["auto", "text", "semantic", "hybrid"])
    .optional()
    .describe(
      "检索模式：auto（默认，有语义能力就混合排序，否则纯文本）/ text / semantic / hybrid",
    ),
  type: memoryTypeSchema.optional().describe("按记忆类型过滤"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("返回条数上限（缺省 20）"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("分页偏移（缺省 0）"),
  createdFrom: createdAtSchema.describe("createdAt 起始时间（闭区间）"),
  createdTo: createdAtSchema.describe("createdAt 截止时间（闭区间）"),
  maxChars: z
    .number()
    .int()
    .min(40)
    .max(4000)
    .optional()
    .describe("单条内容最大字符数，默认 280"),
});

export const memoryListInputSchema = z.object({
  type: memoryTypeSchema.optional().describe("按记忆类型过滤"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("每页条数（缺省 20）"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("分页偏移（缺省 0）"),
  createdFrom: createdAtSchema.describe("createdAt 起始时间（闭区间）"),
  createdTo: createdAtSchema.describe("createdAt 截止时间（闭区间）"),
  includeArchived: z
    .boolean()
    .optional()
    .describe("是否包含已归档，缺省不包含"),
  maxChars: z
    .number()
    .int()
    .min(40)
    .max(4000)
    .optional()
    .describe("单条内容最大字符数，默认 280"),
});

export const memoryGetInputSchema = z.object({
  id: z.string().min(1).describe("记忆 id"),
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

/** 默认预算与单条长度上限。 */
export const DEFAULT_CONTEXT_BUDGET = 4000;
export const DEFAULT_ITEM_MAX_CHARS = 280;

/** 各类型在总预算里的权重（profile/preference 是稳定画像，优先保障）。 */
const TYPE_BUDGET_WEIGHTS: Record<MemoryType, number> = {
  profile: 0.15,
  preference: 0.3,
  project: 0.3,
  relationship: 0.125,
  timeline: 0.125,
};

/** 结构开销（字段名、id、类型标签等）的近似 token 数。 */
const ITEM_OVERHEAD_TOKENS = 20;

function isCjkCode(code: number): boolean {
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

/** 粗略 token 估算：中日韩字符 ≈ 1 token，其余字符 ≈ 4 字符/token。 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    tokens += isCjkCode(ch.codePointAt(0) ?? 0) ? 1 : 0.25;
  }
  return Math.ceil(tokens);
}

/** 截断正文为预览：超出 maxChars 时截断并补省略号。 */
export function previewContent(content: string, maxChars: number): {
  content: string;
  truncated: boolean;
  contentLength: number;
} {
  const chars = [...content];
  if (maxChars <= 0 || chars.length <= maxChars) {
    return { content, truncated: false, contentLength: chars.length };
  }
  return {
    content: `${chars.slice(0, maxChars).join("")}…`,
    truncated: true,
    contentLength: chars.length,
  };
}

/** 把 MemoryRecord 转成带预览的 MemoryItem（长文截断，标记 truncated）。 */
export function toMemoryItem(record: MemoryRecord, maxChars: number): MemoryItem {
  const preview = previewContent(record.content, maxChars);
  return {
    ...record,
    content: preview.content,
    contentLength: preview.contentLength,
    truncated: preview.truncated,
  };
}

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

function emptyGroupedItems(): Record<MemoryType, MemoryItem[]> {
  return {
    profile: [],
    preference: [],
    project: [],
    relationship: [],
    timeline: [],
  };
}

/** 把 ISO 或 epoch 毫秒转成毫秒；无效返回 undefined。 */
function toEpochMs(value: string | number | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export async function runMemoryContext(
  actorId: string,
  store: MemoryStore,
  lastSeen: LastSeenReader,
  opts?: {
    budgetTokens?: number;
    perItemMaxChars?: number;
    includeTypes?: MemoryType[];
  },
) {
  const budgetTokens = opts?.budgetTokens ?? DEFAULT_CONTEXT_BUDGET;
  const perItemMaxChars = opts?.perItemMaxChars ?? DEFAULT_ITEM_MAX_CHARS;
  const records = await store.listActive(actorId, {
    types: opts?.includeTypes,
    limit: 400,
  });
  // 只读读取上文时间（LastSeenReader 只 SELECT，不更新 last_seen_at）。
  const prev = await lastSeen.readLastSeen(actorId);

  const grouped = groupByType(records);
  const items = emptyGroupedItems();
  const perType = {} as Record<
    MemoryType,
    { shown: number; omitted: number; budgetTokens: number }
  >;
  let estimatedTokensUsed = 0;
  let anyTruncated = false;

  for (const type of MEMORY_TYPES) {
    const typeBudget = Math.floor(budgetTokens * TYPE_BUDGET_WEIGHTS[type]);
    const candidates = grouped[type].map((r) => toMemoryItem(r, perItemMaxChars));
    let shown = 0;
    let used = 0;
    for (const item of candidates) {
      const cost = estimateTokens(item.content) + ITEM_OVERHEAD_TOKENS;
      // 至少展示一条，避免单条很长时整组为空。
      if (shown > 0 && used + cost > typeBudget) break;
      items[type].push(item);
      used += cost;
      shown += 1;
      if (item.truncated) anyTruncated = true;
    }
    perType[type] = {
      shown,
      omitted: candidates.length - shown,
      budgetTokens: typeBudget,
    };
    estimatedTokensUsed += used;
  }

  return {
    memories: items,
    budget: {
      totalTokens: budgetTokens,
      estimatedTokensUsed,
      perItemMaxChars,
      perType,
      truncated: anyTruncated,
    },
    gap: buildConversationGapResult(Date.now(), prev),
  };
}

export async function runMemorySearch(
  args: {
    query: string;
    mode?: MemorySearchMode;
    type?: MemoryType;
    limit?: number;
    offset?: number;
    createdFrom?: string | number;
    createdTo?: string | number;
    maxChars?: number;
  },
  actorId: string,
  store: MemoryStore,
) {
  const query = args.query.trim();
  if (!query) throw new Error("query 不能为空");
  const maxChars = args.maxChars ?? DEFAULT_ITEM_MAX_CHARS;
  const offset = args.offset ?? 0;
  const result = await store.search(actorId, query, {
    mode: args.mode,
    type: args.type,
    limit: args.limit,
    offset,
    createdFrom: toEpochMs(args.createdFrom),
    createdTo: toEpochMs(args.createdTo),
  });
  const memories = result.items.map((r) => toMemoryItem(r, maxChars));
  return {
    total: result.total,
    count: memories.length,
    offset,
    mode: result.mode ?? "text",
    semanticAvailable: result.semanticAvailable ?? false,
    memories,
  };
}

export async function runMemoryList(
  args: {
    type?: MemoryType;
    limit?: number;
    offset?: number;
    createdFrom?: string | number;
    createdTo?: string | number;
    includeArchived?: boolean;
    maxChars?: number;
  },
  actorId: string,
  store: MemoryStore,
) {
  const maxChars = args.maxChars ?? DEFAULT_ITEM_MAX_CHARS;
  const limit = args.limit ?? 20;
  const offset = args.offset ?? 0;
  const result = await store.list(actorId, {
    type: args.type,
    limit,
    offset,
    createdFrom: toEpochMs(args.createdFrom),
    createdTo: toEpochMs(args.createdTo),
    includeArchived: args.includeArchived,
  });
  const memories = result.items.map((r) => toMemoryItem(r, maxChars));
  return {
    total: result.total,
    count: memories.length,
    offset,
    limit,
    memories,
  };
}

export async function runMemoryGet(
  args: { id: string },
  actorId: string,
  store: MemoryStore,
) {
  const id = args.id?.trim();
  if (!id) throw new Error("id 不能为空");
  const record = await store.get(actorId, id);
  if (!record) throw new Error("memory 不存在或不属于当前用户");
  return { memory: record };
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
