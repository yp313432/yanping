-- Memory v0.1 — persistent long-term memories, scoped per Horizon actor.
--
-- Applied to Neon during `npm run build` (db:migrate → scripts/migrate.mjs) and
-- to the local PGLite preview (src/lib/db.ts). The Horizon Memory MCP store
-- (server/mcp/memory-store.ts) also self-creates this exact schema idempotently,
-- because Horizon never runs db:migrate — so every statement here uses
-- IF NOT EXISTS to stay safe against either applier having run first.
--
-- Does not touch gap_last_seen or _migrations.

create table if not exists memories (
  id                text primary key,
  actor_id          text not null,
  type              text not null,
  content           text not null,
  source            text,
  confidence        double precision,
  status            text not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_confirmed_at timestamptz
);

create index if not exists memories_actor_id_idx on memories (actor_id);
create index if not exists memories_actor_status_idx on memories (actor_id, status);
create index if not exists memories_actor_type_idx on memories (actor_id, type);