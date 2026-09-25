-- Migração 029: documentos do Processo de Conexão (T-05-04).
--
-- Fonte: dm-docs/fonte-da-verdade/ (Modelo de Conexão) §17 "Cada processo terá
-- uma área própria de documentos … nome, tipo, instituição responsável,
-- usuário que enviou, data, hora, versão, status, permissão de acesso …
-- controle de versões" (Projeto técnico.pdf, Orçamento.xlsx, Parecer
-- técnico.pdf, Termo de parceria.pdf, Relatório de execução.pdf,
-- Comprovantes.pdf); §33 (níveis Público, Institucional e Restrito); decisão 13.
--
-- - `connection_process_documents`: um registro por versão. Todas as versões
--   de um documento têm o mesmo `document_group_id`; `version` é gravada pelo
--   trigger (max + 1 no grupo). A versão nova nasce `vigente` e a anterior
--   vigente passa a `substituido` (trigger); `arquivado` só pelo remetente,
--   com motivo. Nada é excluído.
-- - Arquivo: upload confirmado da finalidade `process_document`, do remetente e
--   deste processo (`uploads.process_id`, migração 027); um upload por registro.
-- - Acesso (§33): `publico` (qualquer sessão; o evento da linha do tempo é
--   público), `institucional` (padrão: as partes do processo) e `restrito`
--   (remetente e as contas/órgãos de `restricted_to`).
-- - Linha do tempo: `documento_registrado` (público só quando o documento é
--   público; payload sem arquivo) e `documento_arquivado` (privado).
-- - A gestão só lê (dm-infra db/migrations/gestao/026-gestao-app-post-process-comms.sql).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- Finalidade nova, somada às que já estão no CHECK (lista lida do catálogo).
DO $$
DECLARE
  def    TEXT;
  vals   TEXT[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'uploads'::regclass AND conname = 'uploads_purpose_check';
  IF def IS NOT NULL AND def LIKE '%''process_document''%' THEN
    RETURN;
  END IF;
  SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::TEXT[]) INTO vals
    FROM regexp_matches(coalesce(def, ''), '''([a-z_]+)''', 'g') AS m;
  vals := array_append(vals, 'process_document');
  ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_purpose_check;
  -- NOT VALID: ver 009 e 027 (o deploy reaplica o manifesto inteiro).
  EXECUTE format('ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (%s)) NOT VALID',
                 (SELECT string_agg(quote_literal(v), ', ' ORDER BY v) FROM unnest(vals) v));
END $$;

DO $$ BEGIN
  CREATE TYPE connection_process_document_type AS ENUM (
    'projeto_tecnico', 'orcamento', 'parecer_tecnico', 'termo_de_parceria', 'relatorio_de_execucao',
    'comprovante', 'plano_de_execucao', 'autorizacao_ou_licenca', 'contrato', 'nota_fiscal', 'laudo',
    'certificado', 'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE connection_process_document_status AS ENUM ('vigente', 'substituido', 'arquivado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE connection_process_document_access AS ENUM ('publico', 'institucional', 'restrito');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS connection_process_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id         UUID NOT NULL REFERENCES connection_processes(id) ON DELETE RESTRICT,
  -- Demanda do processo (gravada pelo trigger), para consultas da gestão.
  demand_id          UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  -- Mesmo valor em todas as versões de um documento (a primeira gera).
  document_group_id  UUID NOT NULL,
  version            INT NOT NULL CHECK (version >= 1),
  name               VARCHAR(255) NOT NULL CHECK (btrim(name) <> ''),
  document_type      connection_process_document_type NOT NULL,
  -- Instituição responsável pelo documento (retrato no envio).
  organization_name  VARCHAR(255),
  uploaded_by        UUID NOT NULL,
  uploaded_by_name   VARCHAR(255) NOT NULL CHECK (btrim(uploaded_by_name) <> ''),
  uploaded_by_side   VARCHAR(10) NOT NULL CHECK (uploaded_by_side IN ('agente', 'conectado')),
  upload_id          UUID NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
  status             connection_process_document_status NOT NULL DEFAULT 'vigente',
  access_level       connection_process_document_access NOT NULL DEFAULT 'institucional',
  -- Contas ou órgãos autorizados quando `restrito` (além do remetente).
  restricted_to      UUID[] NOT NULL DEFAULT '{}' CHECK (cardinality(restricted_to) <= 20),
  archived_at        TIMESTAMPTZ,
  archived_by        UUID,
  archive_reason     TEXT CHECK (archive_reason IS NULL OR (btrim(archive_reason) <> '' AND char_length(archive_reason) <= 1000)),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT connection_process_documents_version UNIQUE (document_group_id, version),
  CONSTRAINT connection_process_documents_restricted CHECK (
    (access_level = 'restrito') = (cardinality(restricted_to) > 0)),
  CONSTRAINT connection_process_documents_archived CHECK (
    (status = 'arquivado') = (archived_at IS NOT NULL AND archived_by IS NOT NULL AND archive_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_connection_process_documents_process
  ON connection_process_documents(process_id, document_group_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_connection_process_documents_uploader
  ON connection_process_documents(uploaded_by, created_at);

CREATE OR REPLACE FUNCTION connection_process_documents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  p RECORD;
  u RECORD;
  author UUID;
  group_process UUID;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os documentos do processo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'documento do processo não é excluído' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.process_id, NEW.demand_id, NEW.document_group_id, NEW.version, NEW.name, NEW.document_type,
        NEW.organization_name, NEW.uploaded_by, NEW.uploaded_by_side, NEW.upload_id, NEW.access_level,
        NEW.restricted_to, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.process_id, OLD.demand_id, OLD.document_group_id, OLD.version, OLD.name, OLD.document_type,
        OLD.organization_name, OLD.uploaded_by, OLD.uploaded_by_side, OLD.upload_id, OLD.access_level,
        OLD.restricted_to, OLD.created_at) THEN
      RAISE EXCEPTION 'documento do processo é imutável; envie uma nova versão' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.uploaded_by_name IS DISTINCT FROM OLD.uploaded_by_name AND NEW.uploaded_by_name <> 'Conta removida' THEN
      RAISE EXCEPTION 'documento do processo é imutável; só a anonimização a pedido do titular'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'arquivado' THEN
        RAISE EXCEPTION 'documento arquivado não muda' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status = 'substituido' THEN
        IF OLD.status <> 'vigente' OR coalesce(current_setting('dm.process_document_supersede', true), '') <> 'on' THEN
          RAISE EXCEPTION 'documento passa a substituído só com uma nova versão' USING ERRCODE = 'check_violation';
        END IF;
      ELSIF NEW.status = 'arquivado' THEN
        IF NEW.archived_by IS DISTINCT FROM OLD.uploaded_by THEN
          RAISE EXCEPTION 'só quem enviou arquiva o documento' USING ERRCODE = 'check_violation';
        END IF;
        IF coalesce(btrim(NEW.archive_reason), '') = '' THEN
          RAISE EXCEPTION 'informe o motivo do arquivamento' USING ERRCODE = 'check_violation';
        END IF;
        NEW.archived_at := NOW();
      ELSE
        RAISE EXCEPTION 'status do documento não volta a vigente' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF (NEW.archived_at, NEW.archived_by, NEW.archive_reason)
          IS DISTINCT FROM (OLD.archived_at, OLD.archived_by, OLD.archive_reason) THEN
      RAISE EXCEPTION 'dados do arquivamento mudam só ao arquivar' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT: processo aberto, arquivo do remetente e deste processo, versão no grupo.
  SELECT id, demand_id, party_kind, party_user_id, closed_at INTO p
    FROM connection_processes WHERE id = NEW.process_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'processo inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF p.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'processo encerrado não recebe documentos' USING ERRCODE = 'check_violation';
  END IF;
  SELECT author_id INTO author FROM demands WHERE id = p.demand_id;
  IF NEW.uploaded_by_side = 'agente' AND NEW.uploaded_by IS DISTINCT FROM author THEN
    RAISE EXCEPTION 'o lado agente é o autor da demanda' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.uploaded_by_side = 'conectado' AND p.party_kind <> 'poder_publico' AND NEW.uploaded_by IS DISTINCT FROM p.party_user_id THEN
    RAISE EXCEPTION 'o lado conectado é a parte do processo' USING ERRCODE = 'check_violation';
  END IF;
  SELECT purpose, status, owner_id, process_id INTO u FROM uploads WHERE id = NEW.upload_id;
  IF u.purpose IS DISTINCT FROM 'process_document' OR u.status IS DISTINCT FROM 'confirmado'
     OR u.owner_id IS DISTINCT FROM NEW.uploaded_by OR u.process_id IS DISTINCT FROM NEW.process_id THEN
    RAISE EXCEPTION 'arquivo do documento não confirmado para este processo' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.document_group_id IS NULL THEN
    NEW.document_group_id := gen_random_uuid();
    NEW.version := 1;
  ELSE
    -- Nova versão: o grupo é deste processo; trava as versões para numerar em ordem.
    PERFORM 1 FROM connection_process_documents WHERE document_group_id = NEW.document_group_id FOR UPDATE;
    SELECT process_id INTO group_process FROM connection_process_documents
     WHERE document_group_id = NEW.document_group_id LIMIT 1;
    IF group_process IS NULL OR group_process <> NEW.process_id THEN
      RAISE EXCEPTION 'documento a substituir não é deste processo' USING ERRCODE = 'check_violation';
    END IF;
    NEW.version := (SELECT max(version) FROM connection_process_documents
                     WHERE document_group_id = NEW.document_group_id) + 1;
  END IF;
  NEW.demand_id := p.demand_id;
  NEW.status := 'vigente';
  NEW.archived_at := NULL;
  NEW.archived_by := NULL;
  NEW.archive_reason := NULL;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS connection_process_documents_guard ON connection_process_documents;
CREATE TRIGGER connection_process_documents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON connection_process_documents
  FOR EACH ROW EXECUTE FUNCTION connection_process_documents_guard();

CREATE OR REPLACE FUNCTION connection_process_documents_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'documentos do processo não são apagados' USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS connection_process_documents_block_truncate ON connection_process_documents;
CREATE TRIGGER connection_process_documents_block_truncate
  BEFORE TRUNCATE ON connection_process_documents
  FOR EACH STATEMENT EXECUTE FUNCTION connection_process_documents_no_truncate();

-- Versão anterior → substituído; linha do tempo do processo.
CREATE OR REPLACE FUNCTION connection_process_documents_after() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  p RECORD;
  actor TEXT;
BEGIN
  SELECT protocol, party_kind INTO p FROM connection_processes WHERE id = NEW.process_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM set_config('dm.process_document_supersede', 'on', true);
    UPDATE connection_process_documents SET status = 'substituido'
     WHERE document_group_id = NEW.document_group_id AND id <> NEW.id AND status = 'vigente';
    PERFORM set_config('dm.process_document_supersede', '', true);
    actor := connection_process_actor_type(CASE WHEN NEW.uploaded_by_side = 'agente' THEN 'agente' ELSE 'parte' END,
                                           p.party_kind);
    INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, NEW.process_id, 'documento_registrado', actor, NEW.uploaded_by::text,
      jsonb_build_object('process_id', NEW.process_id, 'protocol', p.protocol, 'document_id', NEW.id,
                         'document_group_id', NEW.document_group_id, 'version', NEW.version,
                         'document_type', NEW.document_type, 'access_level', NEW.access_level)
        || CASE WHEN NEW.access_level = 'publico' THEN jsonb_build_object('public', jsonb_build_object(
             'protocol', p.protocol, 'documentId', NEW.id, 'name', NEW.name, 'documentType', NEW.document_type,
             'version', NEW.version, 'organizationName', NEW.organization_name))
           ELSE '{}'::jsonb END,
      NEW.access_level = 'publico', NEW.created_at);
    RETURN NULL;
  END IF;
  IF NEW.status = 'arquivado' AND OLD.status IS DISTINCT FROM 'arquivado' THEN
    actor := connection_process_actor_type(CASE WHEN NEW.uploaded_by_side = 'agente' THEN 'agente' ELSE 'parte' END,
                                           p.party_kind);
    INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, note, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, NEW.process_id, 'documento_arquivado', actor, NEW.archived_by::text, NEW.archive_reason,
      jsonb_build_object('process_id', NEW.process_id, 'protocol', p.protocol, 'document_id', NEW.id,
                         'document_group_id', NEW.document_group_id, 'version', NEW.version),
      false, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS connection_process_documents_after ON connection_process_documents;
CREATE TRIGGER connection_process_documents_after
  AFTER INSERT OR UPDATE ON connection_process_documents
  FOR EACH ROW EXECUTE FUNCTION connection_process_documents_after();
