-- Migração 018: tipo de organização, informações complementares e
-- documentação institucional do Agente de Transformação (T-05-19).
--
-- Fonte da verdade: Modelo de Conexão §02 ("O cadastro pode incluir: … Tipo de
-- organização … Documentação institucional, Informações complementares para
-- validação"); decisão 18 (validados na gestão) e decisão 2 (quem decide a
-- validação é o dm-gestao).
--
-- - `organizations.organization_type`: associação, ONG, instituto, fundação,
--   cooperativa, coletivo, projeto social, empresa ou outro. Obrigatório no
--   cadastro do Agente (o user-service recusa sem ele; a interface pré-preenche
--   pelo subperfil da conta). Nulo nas linhas antigas e no Poder Público.
-- - `organizations.additional_information`: texto livre do titular para a
--   equipe de validação (privado: titular e gestão).
-- - `organization_documents`: documentos da instituição (estatuto ou ato
--   constitutivo, ata de eleição, cartão CNPJ, comprovante de endereço, alvará,
--   outro), cada um um upload confirmado da finalidade `institution_document`
--   (T08) vinculado à mesma organização. Privados: nunca saem em rota pública;
--   a gestão lê (SELECT padrão do gestao_app e grant explícito do dm-infra
--   `db/migrations/gestao/034-gestao-app-user-organization-documents.sql`) e
--   exige o estatuto para validar o Agente.
--
-- Regras no banco (trigger `organization_documents_guard`): a sessão
-- `gestao_app` só lê; documento só entra ou sai com o cadastro editável
-- (pendente, devolvida ou revogada); o upload precisa ser confirmado, da
-- finalidade `institution_document` e da mesma organização; linha não muda
-- (troca = remover e anexar outro). O arquivo removido continua no bucket.
--
-- Idempotente: o deploy reaplica o manifesto inteiro.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS organization_type VARCHAR(40);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS additional_information TEXT;

DO $$ BEGIN
  ALTER TABLE organizations ADD CONSTRAINT organizations_organization_type_check
    CHECK (organization_type IS NULL OR organization_type IN (
      'associacao', 'ong', 'instituto', 'fundacao', 'cooperativa', 'coletivo',
      'projeto_social', 'empresa', 'outro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD CONSTRAINT organizations_additional_information_length
    CHECK (additional_information IS NULL OR char_length(additional_information) <= 4000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Finalidade nova no user_db (a 009 só aceitava a comprovação da representação).
ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_purpose_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (
  'institution_proof', 'institution_document'));

CREATE TABLE IF NOT EXISTS organization_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind             VARCHAR(40) NOT NULL CHECK (kind IN (
                     'estatuto', 'ata_de_eleicao', 'cartao_cnpj', 'comprovante_de_endereco', 'alvara', 'outro')),
  title            VARCHAR(255) NOT NULL CHECK (btrim(title) <> ''),
  upload_id        UUID NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE CASCADE,
  uploaded_by      UUID NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_documents_org
  ON organization_documents(organization_id, created_at);

CREATE OR REPLACE FUNCTION organization_documents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_org UUID;
  org_status VARCHAR(20);
  up_purpose TEXT;
  up_org     UUID;
  up_status  TEXT;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'organization_documents: a gestão só lê' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'organization_documents não é editado: remova e anexe outro' USING ERRCODE = 'check_violation';
  END IF;

  target_org := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  SELECT o.validation_status INTO org_status FROM organizations o WHERE o.id = target_org;
  -- Remoção em cascata da organização (organização já não existe): segue.
  IF TG_OP = 'DELETE' AND org_status IS NULL THEN
    RETURN OLD;
  END IF;
  IF org_status IS NULL OR org_status NOT IN ('pendente', 'devolvida', 'revogada') THEN
    RAISE EXCEPTION 'documentação institucional só muda com o cadastro editável (estado: %)', org_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT u.purpose, u.organization_id, u.status INTO up_purpose, up_org, up_status
    FROM uploads u WHERE u.id = NEW.upload_id;
  IF up_purpose IS DISTINCT FROM 'institution_document' OR up_status IS DISTINCT FROM 'confirmado'
     OR up_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'documento institucional exige upload confirmado da finalidade institution_document da mesma organização'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS organization_documents_guard ON organization_documents;
CREATE TRIGGER organization_documents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON organization_documents
  FOR EACH ROW EXECUTE FUNCTION organization_documents_guard();
