-- Migração: adiciona suporte tipado às publicações (rodar em bancos existentes)
DO $$ BEGIN
  CREATE TYPE support_type AS ENUM (
    'financial','materials','labor','volunteering',
    'equipment','space','food','transport','knowledge','sharing'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS supports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  user_name  VARCHAR(255),
  type       support_type NOT NULL,
  message    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_supports_post ON supports(post_id);
CREATE INDEX IF NOT EXISTS idx_supports_user ON supports(user_id);
