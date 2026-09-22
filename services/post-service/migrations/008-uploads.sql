-- Migração 008: metadados dos arquivos enviados ao S3 (T08).
--
-- O arquivo vai do navegador direto ao bucket privado de uploads por URL
-- pré-assinada (src/uploads.js). Esta tabela guarda quem enviou, para quê,
-- onde está e o vínculo com a demanda:
--   - `pendente`: URL de PUT emitida; o objeto está (ou estará) em `tmp_key`
--     (`tmp/<id>`), que o bucket apaga depois de 1 dia;
--   - `confirmado`: tamanho, tipo e assinatura conferidos, objeto copiado
--     para `object_key` (`demands/<demand_id>/<pasta>/<id>.<ext>`).
-- Referências na demanda usam `upload:<id>` (demands.photo_ref,
-- demand_documents.reference; o post-vitrine herda a foto em posts.images).
-- Finalidades: foto da demanda e do antes/depois (públicas quando a demanda
-- está publicada), vídeo do antes/depois (público idem) e documento
-- comprobatório (privado: autor e gestão).
--
-- A gestão lê esta tabela (SELECT padrão do gestao_app no post_db) e assina a
-- leitura de `object_key` com a credencial da instância; ver
-- dm-docs/docs/gestao/04-modelagem-de-dados.md.
--
-- Idempotente: pode rodar de novo.

CREATE TABLE IF NOT EXISTS uploads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             UUID NOT NULL,
  purpose              VARCHAR(40) NOT NULL CHECK (purpose IN (
                         'demand_photo', 'demand_evidence_photo', 'demand_evidence_video', 'demand_document')),
  status               VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado')),
  tmp_key              VARCHAR(255) NOT NULL UNIQUE,
  object_key           VARCHAR(500) UNIQUE,
  content_type         VARCHAR(150) NOT NULL,
  declared_size_bytes  BIGINT NOT NULL CHECK (declared_size_bytes > 0),
  size_bytes           BIGINT CHECK (size_bytes > 0),
  sha256               CHAR(64) CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  original_name        VARCHAR(255),
  demand_id            UUID REFERENCES demands(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at         TIMESTAMPTZ,
  CONSTRAINT uploads_confirmed_complete CHECK (
    status = 'pendente'
    OR (object_key IS NOT NULL AND size_bytes IS NOT NULL AND confirmed_at IS NOT NULL AND demand_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_uploads_owner_created ON uploads(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_demand ON uploads(demand_id) WHERE demand_id IS NOT NULL;
