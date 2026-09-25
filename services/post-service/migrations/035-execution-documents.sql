-- Migração 035: evidências documentais da execução — laudos, certificados,
-- notas fiscais, registros técnicos, relatórios e documentos (T-05-12).
--
-- Fonte: dm-docs/fonte-da-verdade/05 (Modelo de Conexão) — §20 "Fotografias,
-- Vídeos, Documentos, Relatórios, Notas fiscais, Comprovantes, Laudos,
-- Certificados, Registros técnicos, Outros" e §24 (marcos ANTES → DIAGNÓSTICO
-- → INTERVENÇÃO → MONITORAMENTO → RESULTADO do módulo ambiental, que a
-- migração 032 acrescenta a `demand_record_milestone`).
--
-- - `demand_accountability_document_kind` ganha `nota_fiscal`, `laudo`,
--   `certificado`, `registro_tecnico`, `relatorio` e `documento` (continua com
--   `comprovante_financeiro`, `relatorio_execucao`, `registro_acao`, `outro`).
--   O mesmo tipo vale para os anexos da prestação e para os documentos da
--   execução.
-- - `demand_execution_documents`: o documento anexado **durante** a execução
--   (a prestação de contas só existe depois dela e congela ao concluir), com
--   etapa e marco opcionais, atualização de andamento opcional, data de emissão
--   e valor declarado. O arquivo é um upload confirmado da T08, finalidade
--   `demand_execution_document` (privada: o público vê tipo, título, etapa,
--   marco e data, nunca o arquivo). Só inserção. Linha do tempo pública
--   `documento_da_execucao_registrado`.
--
-- A gestão só lê (grant no dm-infra,
-- db/migrations/gestao/031-gestao-app-post-execution.sql).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).
-- Os valores novos do enum não são usados como literais nesta migração.

ALTER TYPE demand_accountability_document_kind ADD VALUE IF NOT EXISTS 'nota_fiscal';
ALTER TYPE demand_accountability_document_kind ADD VALUE IF NOT EXISTS 'laudo';
ALTER TYPE demand_accountability_document_kind ADD VALUE IF NOT EXISTS 'certificado';
ALTER TYPE demand_accountability_document_kind ADD VALUE IF NOT EXISTS 'registro_tecnico';
ALTER TYPE demand_accountability_document_kind ADD VALUE IF NOT EXISTS 'relatorio';
ALTER TYPE demand_accountability_document_kind ADD VALUE IF NOT EXISTS 'documento';

-- Finalidade de upload nova, somada às que já estão no CHECK (outras
-- migrações também acrescentam finalidades; a lista é lida do catálogo).
DO $$
DECLARE
  def    TEXT;
  values TEXT[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'uploads'::regclass AND conname = 'uploads_purpose_check';
  IF def IS NOT NULL AND def LIKE '%demand_execution_document%' THEN
    RETURN;
  END IF;
  SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::TEXT[]) INTO values
    FROM regexp_matches(coalesce(def, ''), '''([a-z_]+)''', 'g') AS m;
  values := array_append(values, 'demand_execution_document');
  ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_purpose_check;
  EXECUTE format('ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (%s))',
                 (SELECT string_agg(quote_literal(v), ', ' ORDER BY v) FROM unnest(values) v));
END $$;

CREATE TABLE IF NOT EXISTS demand_execution_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id          UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  -- Atualização de andamento que trouxe o documento (opcional).
  progress_update_id UUID REFERENCES demand_progress_updates(id) ON DELETE RESTRICT,
  schedule_item_id   UUID,
  -- Marco a que o documento se refere (ex.: laudo do diagnóstico, §24).
  milestone          demand_record_milestone,
  kind               demand_accountability_document_kind NOT NULL,
  title              VARCHAR(200) NOT NULL CHECK (btrim(title) <> ''),
  description        TEXT CHECK (description IS NULL
                                 OR (btrim(description) <> '' AND char_length(description) <= 2000)),
  reference          VARCHAR(80) NOT NULL CHECK (reference ~ '^upload:[0-9a-f-]{36}$'),
  upload_id          UUID NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
  issued_on          DATE,
  amount_cents       BIGINT CHECK (amount_cents IS NULL OR (amount_cents >= 0 AND amount_cents <= 9999999999)),
  author_id          UUID NOT NULL,
  author_name        VARCHAR(255),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_execution_documents_upload UNIQUE (upload_id),
  CONSTRAINT demand_execution_documents_schedule FOREIGN KEY (demand_id, schedule_item_id)
    REFERENCES demand_schedule_items(demand_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_demand_execution_documents_demand
  ON demand_execution_documents(demand_id, created_at);

CREATE OR REPLACE FUNCTION demand_execution_documents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  up_purpose TEXT;
  up_demand  UUID;
  up_owner   UUID;
  up_status  TEXT;
  parent     UUID;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os documentos da execução' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'o documento da execução registrado não muda nem é excluído'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM demand_execution_assert_open(NEW.demand_id, NEW.author_id, true);
  IF NEW.reference <> 'upload:' || NEW.upload_id::text THEN
    RAISE EXCEPTION 'a referência do arquivo não corresponde ao upload' USING ERRCODE = 'check_violation';
  END IF;
  SELECT purpose, demand_id, owner_id, status INTO up_purpose, up_demand, up_owner, up_status
    FROM uploads WHERE id = NEW.upload_id;
  IF up_status IS DISTINCT FROM 'confirmado' THEN
    RAISE EXCEPTION 'o documento da execução usa um arquivo já confirmado' USING ERRCODE = 'check_violation';
  END IF;
  IF up_demand IS DISTINCT FROM NEW.demand_id OR up_owner IS DISTINCT FROM NEW.author_id THEN
    RAISE EXCEPTION 'o arquivo do documento é desta demanda e de quem o registra' USING ERRCODE = 'check_violation';
  END IF;
  IF up_purpose <> 'demand_execution_document' THEN
    RAISE EXCEPTION 'o documento da execução usa a finalidade demand_execution_document (recebido: %)', up_purpose
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.progress_update_id IS NOT NULL THEN
    SELECT demand_id INTO parent FROM demand_progress_updates WHERE id = NEW.progress_update_id;
    IF parent IS DISTINCT FROM NEW.demand_id THEN
      RAISE EXCEPTION 'a atualização do documento é desta demanda' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.created_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_execution_documents_record_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  stage_name TEXT;
BEGIN
  SELECT stage INTO stage_name FROM demand_schedule_items WHERE id = NEW.schedule_item_id;
  INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
  VALUES (NEW.demand_id, 'documento_da_execucao_registrado', 'agente', NEW.author_id::text,
          jsonb_build_object('document_id', NEW.id, 'public', jsonb_strip_nulls(jsonb_build_object(
            'kind', NEW.kind, 'title', NEW.title, 'stage', stage_name, 'milestone', NEW.milestone,
            'issuedOn', NEW.issued_on))),
          true, clock_timestamp());
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION demand_execution_documents_record_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS demand_execution_documents_guard ON demand_execution_documents;
CREATE TRIGGER demand_execution_documents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_execution_documents
  FOR EACH ROW EXECUTE FUNCTION demand_execution_documents_guard();

DROP TRIGGER IF EXISTS demand_execution_documents_block_truncate ON demand_execution_documents;
CREATE TRIGGER demand_execution_documents_block_truncate
  BEFORE TRUNCATE ON demand_execution_documents
  FOR EACH STATEMENT EXECUTE FUNCTION demand_execution_no_truncate();

DROP TRIGGER IF EXISTS demand_execution_documents_record_event ON demand_execution_documents;
CREATE TRIGGER demand_execution_documents_record_event
  AFTER INSERT ON demand_execution_documents
  FOR EACH ROW EXECUTE FUNCTION demand_execution_documents_record_event();
