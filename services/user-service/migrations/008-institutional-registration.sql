-- Migração 008: cadastro institucional do Agente de Transformação e do Poder
-- Público, com estado de validação e trilha de eventos (T04).
--
-- Fonte da verdade: Fluxo 2 (etapas 01–02: CNPJ + CNAE e dados institucionais)
-- e Fluxo 3 (etapas 01–02: órgão, CNPJ, esfera, município/território,
-- secretaria/departamento, competência e representante). Decisão 2: quem muda
-- o estado de validação é o dm-gestao; decisão 3: Líder Comunitário e
-- Representante de Bairro vinculam-se a uma instituição com CNPJ.
--
-- Estende `organizations` (a tabela que o dm-gestao já lê) em vez de criar outra.
-- Linhas antigas, sem `institution_kind`, não são tocadas.
--
-- Contrato com o dm-gestao (dm-docs/docs/gestao/04-modelagem-de-dados.md):
--   - o gestao_app atualiza só organizations.validation_status,
--     validation_note, validation_reviewed_by (e updated_at), conforme
--     dmconecta-infra/db/migrations/gestao/006-gestao-app-user-db-institutions.sql;
--   - transições permitidas ao gestao_app: em_analise → validada | devolvida,
--     validada → revogada; devolvida/revogada exigem parecer (validation_note)
--     e toda decisão exige validation_reviewed_by;
--   - verified/verified_at/verified_by passam a ser derivados do estado nas
--     linhas institucionais (o trigger os mantém);
--   - cada mudança de estado grava uma linha em organization_validation_events.
--
-- Idempotente: o deploy reaplica o manifesto inteiro.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS institution_kind VARCHAR(30);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cnpj VARCHAR(14);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trade_name VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cnae_primary VARCHAR(7);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cnae_primary_description VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cnae_secondary JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS government_sphere VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS competence_areas TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS territory VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cep VARCHAR(8);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS street VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_number VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_complement VARCHAR(120);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS district VARCHAR(120);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS municipality VARCHAR(120);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS municipality_ibge_code VARCHAR(7);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS uf VARCHAR(2);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS institutional_email VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS institutional_phone VARCHAR(11);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS validation_note TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS validation_reviewed_by VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS validation_reviewed_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE organizations ADD CONSTRAINT organizations_institution_kind_check
    CHECK (institution_kind IS NULL OR institution_kind IN ('agente_transformacao', 'poder_publico'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD CONSTRAINT organizations_validation_status_check
    CHECK (validation_status IS NULL
      OR validation_status IN ('pendente', 'em_analise', 'validada', 'devolvida', 'revogada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Linha institucional sempre tem estado e CNPJ normalizado (14 posições, as 12
-- primeiras alfanuméricas desde o CNPJ alfanumérico da Receita).
DO $$ BEGIN
  ALTER TABLE organizations ADD CONSTRAINT organizations_institution_required_check
    CHECK (institution_kind IS NULL
      OR (validation_status IS NOT NULL AND cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD CONSTRAINT organizations_government_sphere_check
    CHECK (government_sphere IS NULL OR government_sphere IN ('municipal', 'estadual', 'federal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD CONSTRAINT organizations_cnae_primary_check
    CHECK (cnae_primary IS NULL OR cnae_primary ~ '^[0-9]{7}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Um cadastro institucional por perfil (o vínculo perfil ↔ instituição).
-- O CNPJ não é único: vários órgãos de uma prefeitura, ou dois representantes
-- da mesma associação, compartilham o CNPJ; o dm-gestao confere na validação.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_institution_profile
  ON organizations(profile_id) WHERE institution_kind IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_cnpj ON organizations(cnpj);
CREATE INDEX IF NOT EXISTS idx_organizations_validation_status
  ON organizations(validation_status) WHERE institution_kind IS NOT NULL;

-- Representante (Poder Público) ou responsável (Agente de Transformação).
-- Contatos institucionais privados: nunca saem em rota pública.
CREATE TABLE IF NOT EXISTS organization_representatives (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  full_name           VARCHAR(255) NOT NULL,
  position            VARCHAR(255) NOT NULL,
  institutional_email VARCHAR(255) NOT NULL,
  institutional_phone VARCHAR(11) NOT NULL,
  -- Referência ao documento de comprovação da representação, quando aplicável
  -- (URL/chave do arquivo; o upload real é a T08).
  proof_document_ref  VARCHAR(500),
  proof_description   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_representatives_user_id
  ON organization_representatives(user_id);

-- Trilha de validação: uma linha por mudança de estado, gravada pelo trigger.
CREATE TABLE IF NOT EXISTS organization_validation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_status     VARCHAR(20),
  to_status       VARCHAR(20) NOT NULL,
  note            TEXT,
  actor_type      VARCHAR(20) NOT NULL CHECK (actor_type IN ('titular', 'gestao')),
  actor           VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_validation_events_org
  ON organization_validation_events(organization_id, created_at);

-- Regras de estado. Quem conecta como gestao_app é a equipe da plataforma no
-- dm-gestao; qualquer outra sessão (os serviços do portal) é o titular.
CREATE OR REPLACE FUNCTION organizations_validation_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  is_gestao BOOLEAN := session_user = 'gestao_app';
  allowed   BOOLEAN;
BEGIN
  IF NEW.institution_kind IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.validation_status IS DISTINCT FROM 'pendente' THEN
      RAISE EXCEPTION 'cadastro institucional nasce pendente (recebido: %)', NEW.validation_status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.institution_kind IS DISTINCT FROM OLD.institution_kind AND OLD.institution_kind IS NOT NULL THEN
    RAISE EXCEPTION 'o tipo do cadastro institucional não muda' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.validation_status IS NOT DISTINCT FROM OLD.validation_status THEN
    -- verified* é derivado do estado nas linhas institucionais.
    IF NEW.verified IS DISTINCT FROM OLD.verified THEN
      RAISE EXCEPTION 'organização institucional: valide pela coluna validation_status, não por verified'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF is_gestao THEN
    allowed := (OLD.validation_status, NEW.validation_status) IN
      (('em_analise', 'validada'), ('em_analise', 'devolvida'), ('validada', 'revogada'));
  ELSE
    allowed := OLD.validation_status IN ('pendente', 'devolvida', 'revogada')
      AND NEW.validation_status = 'em_analise';
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'transição de validação não permitida: % → % (%)',
      OLD.validation_status, NEW.validation_status, CASE WHEN is_gestao THEN 'gestao' ELSE 'titular' END
      USING ERRCODE = 'check_violation';
  END IF;

  IF is_gestao THEN
    IF coalesce(btrim(NEW.validation_reviewed_by), '') = '' THEN
      RAISE EXCEPTION 'validation_reviewed_by é obrigatório na decisão da gestão' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.validation_status IN ('devolvida', 'revogada') AND coalesce(btrim(NEW.validation_note), '') = '' THEN
      RAISE EXCEPTION 'parecer (validation_note) é obrigatório para %', NEW.validation_status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.validation_reviewed_at := NOW();
    IF NEW.validation_status = 'validada' THEN
      NEW.verified := true;
      NEW.verified_at := NOW();
      NEW.verified_by := NEW.validation_reviewed_by;
    ELSE
      NEW.verified := false;
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
    END IF;
  ELSE
    -- Reenvio: o parecer anterior fica na trilha de eventos.
    NEW.submitted_at := NOW();
    NEW.validation_note := NULL;
    NEW.verified := false;
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

-- Grava a trilha. SECURITY DEFINER: o gestao_app não tem INSERT em
-- organization_validation_events; o registro é consequência do UPDATE.
CREATE OR REPLACE FUNCTION organizations_validation_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  is_gestao BOOLEAN := session_user = 'gestao_app';
  actor_id  VARCHAR(255);
BEGIN
  IF NEW.institution_kind IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.validation_status IS NOT DISTINCT FROM OLD.validation_status THEN
    RETURN NULL;
  END IF;
  IF is_gestao THEN
    actor_id := NEW.validation_reviewed_by;
  ELSE
    SELECT p.user_id::text INTO actor_id FROM profiles p WHERE p.id = NEW.profile_id;
  END IF;
  INSERT INTO organization_validation_events (organization_id, from_status, to_status, note, actor_type, actor)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.validation_status END,
    NEW.validation_status,
    CASE WHEN is_gestao THEN NEW.validation_note END,
    CASE WHEN is_gestao THEN 'gestao' ELSE 'titular' END,
    actor_id
  );
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION organizations_validation_log() FROM PUBLIC;

-- A trilha não se reescreve (a remoção só acontece em cascata com a organização).
CREATE OR REPLACE FUNCTION organization_validation_events_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'organization_validation_events é somente inserção' USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS organizations_validation_guard ON organizations;
CREATE TRIGGER organizations_validation_guard
  BEFORE INSERT OR UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION organizations_validation_guard();

DROP TRIGGER IF EXISTS organizations_validation_log ON organizations;
CREATE TRIGGER organizations_validation_log
  AFTER INSERT OR UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION organizations_validation_log();

DROP TRIGGER IF EXISTS organization_validation_events_block_update ON organization_validation_events;
CREATE TRIGGER organization_validation_events_block_update
  BEFORE UPDATE ON organization_validation_events
  FOR EACH ROW EXECUTE FUNCTION organization_validation_events_immutable();
