-- Migração 004: campos de compatibilidade usados pelo Sistema de Gestão
-- (dm-gestao). Veio de dmconecta-infra/db/migrations/post/ (defeito D6): o
-- dm-api passou a ser a fonte única do schema. Nenhuma linha é inserida.
--
-- Os valores extras de `post_status` são os status operacionais que a gestão
-- gravava nos posts antigos. Pela decisão 7 (dm-docs, decisoes-de-implementacao)
-- eles não são mais editados: ficam só para leitura, e o frontend os rotula.
--
-- Idempotente: pode rodar de novo (ADD VALUE IF NOT EXISTS fora de transação).

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS urban_category VARCHAR(100);

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS state VARCHAR(100);

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS zipcode VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_posts_urban_category
  ON posts(urban_category);

ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'em_analise';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'encaminhada';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'em_execucao';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'resolvida';
ALTER TYPE post_status ADD VALUE IF NOT EXISTS 'cancelada';
