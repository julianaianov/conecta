-- Migração 006: visibilidade de moderação dos posts (decisão 7 de
-- dm-docs/docs/fonte-da-verdade/decisoes-de-implementacao.md).
--
-- Os posts antigos não viram demandas. O status deles deixa de ser editado
-- (nem pelo autor, nem pela gestão); o que a moderação controla é se o post
-- aparece (`visible`) ou fica oculto (`hidden`). Post oculto some do feed, do
-- mapa, do ranking e da página pública, mas não é excluído.
--
-- Idempotente: pode rodar de novo. Posts existentes ficam `visible`.

DO $$ BEGIN
  CREATE TYPE post_visibility AS ENUM ('visible', 'hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS visibility post_visibility NOT NULL DEFAULT 'visible';

-- Motivo e autoria da moderação (conta do dm-gestao), preenchidos ao ocultar.
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS moderated_by VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_posts_visibility
  ON posts(visibility);
