-- Migração 009: metadados dos arquivos enviados ao S3 (T08) no user_db.
--
-- Mesma estrutura do post_db (post-service/migrations/008-uploads.sql), com o
-- vínculo à instituição. Finalidade aceita aqui: comprovação da representação
-- (`institution_proof`, privada: titular e gestão), referenciada em
-- organization_representatives.proof_document_ref como `upload:<id>`.
--   - `pendente`: URL de PUT emitida; objeto em `tmp_key` (`tmp/<id>`, apagado
--     pelo bucket depois de 1 dia);
--   - `confirmado`: conferido e copiado para `object_key`
--     (`institutions/<organization_id>/proof/<id>.<ext>`).
--
-- A gestão lê esta tabela (SELECT padrão do gestao_app no user_db) e assina a
-- leitura de `object_key` com a credencial da instância; ver
-- dm-docs/docs/gestao/04-modelagem-de-dados.md.
--
-- Idempotente: pode rodar de novo.

CREATE TABLE IF NOT EXISTS uploads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             UUID NOT NULL,
  purpose              VARCHAR(40) NOT NULL CHECK (purpose IN ('institution_proof')),
  status               VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado')),
  tmp_key              VARCHAR(255) NOT NULL UNIQUE,
  object_key           VARCHAR(500) UNIQUE,
  content_type         VARCHAR(150) NOT NULL,
  declared_size_bytes  BIGINT NOT NULL CHECK (declared_size_bytes > 0),
  size_bytes           BIGINT CHECK (size_bytes > 0),
  sha256               CHAR(64) CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  original_name        VARCHAR(255),
  organization_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at         TIMESTAMPTZ,
  CONSTRAINT uploads_confirmed_complete CHECK (
    status = 'pendente'
    OR (object_key IS NOT NULL AND size_bytes IS NOT NULL AND confirmed_at IS NOT NULL AND organization_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_uploads_owner_created ON uploads(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_organization ON uploads(organization_id) WHERE organization_id IS NOT NULL;
