-- 语义检索字段（BGE-M3，1024 维）。
-- 向量用 real[]（float4 数组）存储，由应用层计算余弦相似度：
-- 记忆库规模很小（<2000 行），精确扫描比维护 pgvector/HNSW 索引更简单，
-- 且不依赖任何 Postgres 扩展，PGLite 预览与 Neon 生产行为一致。
alter table memories
  add column if not exists embedding real[],
  add column if not exists embedding_model text,
  add column if not exists embedding_updated_at timestamptz;
