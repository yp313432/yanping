-- Additive only. Apply explicitly to the health database before enabling ingestion.
-- No changes to memories, gap_last_seen, authentication, or embeddings.
CREATE TABLE IF NOT EXISTS health_sources (
  actor_id text NOT NULL,
  source_id text NOT NULL,
  last_received_at timestamptz NOT NULL,
  latest_observed_at timestamptz,
  PRIMARY KEY (actor_id, source_id)
);
CREATE TABLE IF NOT EXISTS health_days (
  actor_id text NOT NULL,
  source_id text NOT NULL,
  date date NOT NULL,
  timezone text NOT NULL,
  steps integer CHECK (steps BETWEEN 0 AND 1000000),
  received_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id, source_id, date),
  FOREIGN KEY (actor_id, source_id) REFERENCES health_sources(actor_id, source_id)
);
CREATE TABLE IF NOT EXISTS health_samples (
  actor_id text NOT NULL,
  source_id text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('heart_rate','spo2','stress','hrv','resting_heart_rate','respiratory_rate','skin_temperature')),
  observed_at timestamptz NOT NULL,
  value double precision NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id, source_id, metric, observed_at),
  FOREIGN KEY (actor_id, source_id) REFERENCES health_sources(actor_id, source_id)
);
-- Sleep versions are immutable. Exact retransmissions conflict on content_id; extended
CREATE INDEX IF NOT EXISTS health_samples_time_idx ON health_samples(actor_id, source_id, observed_at);
--
-- sessions are retained for provenance and collapsed by overlap when queried (never summed twice).
CREATE TABLE IF NOT EXISTS health_sleep (
  actor_id text NOT NULL,
  source_id text NOT NULL,
  content_id text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL CHECK (end_at > start_at),
  data jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id, source_id, content_id),
  FOREIGN KEY (actor_id, source_id) REFERENCES health_sources(actor_id, source_id)
);
CREATE INDEX IF NOT EXISTS health_sleep_end_idx ON health_sleep(actor_id, source_id, end_at);
CREATE TABLE IF NOT EXISTS health_workouts (
  actor_id text NOT NULL,
  source_id text NOT NULL,
  workout_id text NOT NULL,
  start_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id, source_id, workout_id),
  FOREIGN KEY (actor_id, source_id) REFERENCES health_sources(actor_id, source_id)
);
CREATE INDEX IF NOT EXISTS health_workouts_start_idx ON health_workouts(actor_id, source_id, start_at);
