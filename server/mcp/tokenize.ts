/**
 * 记忆检索分词（应用层）。
 *
 * Postgres 的 `simple` 文本配置**不会切分中文**：整句中文只会变成一个 token，
 * 于是 `to_tsvector('simple', content) @@ plainto_tsquery('simple', '果茶')`
 * 永远匹配不到正文里的「少甜少冰的果茶」——这正是不用分词时中文检索 R@1 = 0%
 * 的根因。
 *
 * 这里改用「CJK 二元组 + ASCII/数字整词」分词：
 * - 中文按相邻两字切（bigram）：`少甜少冰` → 少甜 / 甜少 / 少冰，既覆盖
 *   「少冰」这类子串查询，又**不依赖词典**，所以以后换分词器也不用回填历史
 *   数据（换成 jieba/segmentit 才需要回填 `search_text`）。
 * - 英文/数字连续串整体作为一个词，大小写不敏感。
 */

/** 判断一个字符是否属于 CJK 统一表意文字（含扩展 A 与兼容区）。 */
function isCjkChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

/** 统一查询串：NFKC 归一 + 小写 + 去首尾空白。 */
export function normalizeQuery(query: string): string {
  return query.normalize("NFKC").toLowerCase().trim();
}

/**
 * 把文本切成检索 token。
 * - CJK 连续段：长度 1 保留单字，长度 ≥2 生成全部相邻二元组；
 * - 字母/数字连续段：整体保留（小写）；
 * - 其它字符（空格、标点、emoji）作为分隔符丢弃。
 */
export function tokenize(text: string): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const tokens = new Set<string>();
  let run = "";
  let mode: "cjk" | "ascii" | null = null;

  const flush = () => {
    if (!run) {
      mode = null;
      return;
    }
    if (mode === "cjk") {
      if (run.length === 1) {
        tokens.add(run);
      } else {
        for (let i = 0; i + 1 < run.length; i += 1) {
          tokens.add(run.slice(i, i + 2));
        }
      }
    } else {
      tokens.add(run);
    }
    run = "";
    mode = null;
  };

  for (const ch of normalized) {
    if (isCjkChar(ch)) {
      if (mode !== "cjk") flush();
      mode = "cjk";
      run += ch;
    } else if (/[a-z0-9]/.test(ch)) {
      if (mode !== "ascii") flush();
      mode = "ascii";
      run += ch;
    } else {
      flush();
    }
  }
  flush();
  return [...tokens];
}

/**
 * 文本相对于查询的相关度分数：
 * - 命中查询的分词个数 × 2（单字 token 权重 0.5，降低「月 / 日」这类单字噪音）；
 * - 查询整串出现在正文里，额外 +3；
 * - 分数为 0 表示不匹配。
 */
export function scoreText(text: string, query: string): number {
  const q = normalizeQuery(query);
  if (!q) return 0;
  const normText = text.normalize("NFKC").toLowerCase();
  const tokens = tokenize(query);
  if (tokens.length === 0) return normText.includes(q) ? 3 : 0;
  let hits = 0;
  for (const token of tokens) {
    if (!normText.includes(token)) continue;
    hits += token.length === 1 ? 0.5 : 1;
  }
  if (hits === 0) return 0;
  return hits * 2 + (normText.includes(q) ? 3 : 0);
}
