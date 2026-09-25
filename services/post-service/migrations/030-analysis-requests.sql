-- Migração 030: respostas à análise — solicitar informações, documentos,
-- reunião, análise técnica e recusar com motivo (T-05-05).
--
-- Fonte: dm-docs/fonte-da-verdade/ (Modelo de Conexão) §10 "O usuário poderá:
-- demonstrar interesse, solicitar informações adicionais, solicitar
-- documentos, solicitar reunião, encaminhar para outro setor, solicitar
-- análise técnica, recusar a demanda informando o motivo, iniciar uma
-- conexão"; §12 exemplo "Secretaria solicita informações complementares …
-- Agente envia os documentos solicitados". Decisões 13 e 16.
--
-- - Poder Público: `institutional_response_type` ganha
--   `solicitacao_de_documentos`, `solicitacao_de_reuniao`,
--   `solicitacao_de_analise_tecnica` e `recusa_com_motivo` (a 010 já nasce com
--   eles em banco novo), com as colunas dos tipos novos em
--   `demand_institutional_responses` (tipos de documento pedidos, data e
--   formato da reunião, motivo da recusa — obrigatório na recusa). A recusa
--   leva o acompanhamento (ou o processo) a `nao_aprovada` pela rota.
-- - `demand_analysis_requests`: a solicitação que o Agente autor responde.
--   Parceiros registram por aqui; as respostas do Poder Público que pedem algo
--   ao Agente (informações, documentos, reunião, análise técnica, recusa) entram
--   como espelho (`institutional_response_id`), para o Agente ter uma caixa
--   única de "Solicitações recebidas". Só Parceiro ou Poder Público validado,
--   nunca o autor, com a demanda aberta; nada é excluído; a resposta é única
--   (texto e documentos da demanda ou do processo). A recusa nasce encerrada.
-- - Linha do tempo: `solicitacao_registrada` (pública: tipo e categoria da
--   conta; privada na recusa e ausente no espelho, que já tem a resposta
--   institucional) e `solicitacao_respondida` (pública: tipo, categoria e
--   quantidade de documentos).
-- - A gestão só lê (grant SELECT no dm-infra,
--   db/migrations/gestao/027-gestao-app-post-deadlines-requests.sql).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro). Os
-- valores novos do enum não são usados como literal do tipo nesta migração
-- (ADD VALUE não pode ser usado na mesma transação): as regras comparam texto.

ALTER TYPE institutional_response_type ADD VALUE IF NOT EXISTS 'solicitacao_de_documentos';
ALTER TYPE institutional_response_type ADD VALUE IF NOT EXISTS 'solicitacao_de_reuniao';
ALTER TYPE institutional_response_type ADD VALUE IF NOT EXISTS 'solicitacao_de_analise_tecnica';
ALTER TYPE institutional_response_type ADD VALUE IF NOT EXISTS 'recusa_com_motivo';

ALTER TABLE demand_institutional_responses
  ADD COLUMN IF NOT EXISTS requested_document_types demand_document_type[] NOT NULL DEFAULT '{}';
ALTER TABLE demand_institutional_responses
  ADD COLUMN IF NOT EXISTS meeting_proposed_at TIMESTAMPTZ;
ALTER TABLE demand_institutional_responses
  ADD COLUMN IF NOT EXISTS meeting_mode VARCHAR(10) CHECK (meeting_mode IS NULL OR meeting_mode IN ('presencial', 'online'));
ALTER TABLE demand_institutional_responses
  ADD COLUMN IF NOT EXISTS refusal_reason TEXT CHECK (refusal_reason IS NULL OR char_length(refusal_reason) <= 3000);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_institutional_responses'::regclass
                    AND conname = 'demand_institutional_responses_refusal') THEN
    ALTER TABLE demand_institutional_responses ADD CONSTRAINT demand_institutional_responses_refusal
      CHECK (response_type::text <> 'recusa_com_motivo' OR coalesce(btrim(refusal_reason), '') <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_institutional_responses'::regclass
                    AND conname = 'demand_institutional_responses_documents') THEN
    ALTER TABLE demand_institutional_responses ADD CONSTRAINT demand_institutional_responses_documents
      CHECK (response_type::text <> 'solicitacao_de_documentos' OR cardinality(requested_document_types) >= 1);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE analysis_request_kind AS ENUM (
    'informacoes_adicionais', 'documentos', 'reuniao', 'analise_tecnica', 'recusa'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE analysis_request_status AS ENUM ('aberta', 'respondida', 'encerrada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS demand_analysis_requests (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id                    UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  -- Processo de Conexão da parte com a demanda, quando já formalizado.
  process_id                   UUID REFERENCES connection_processes(id) ON DELETE RESTRICT,
  -- Espelho da resposta institucional que pediu algo ao Agente.
  institutional_response_id    UUID UNIQUE REFERENCES demand_institutional_responses(id) ON DELETE RESTRICT,
  -- Quem pede (auth_db.users.id) e o retrato da conta/órgão. Privado: o
  -- público vê só a categoria.
  requester_user_id            UUID NOT NULL,
  requester_name               VARCHAR(255),
  requester_category           VARCHAR(20) NOT NULL CHECK (requester_category IN ('parceiro', 'poder_publico')),
  requester_profile_type       VARCHAR(50),
  requester_organization_id    UUID,
  requester_organization_name  VARCHAR(255),
  kind                         analysis_request_kind NOT NULL,
  body                         TEXT NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 3000),
  requested_document_types     demand_document_type[] NOT NULL DEFAULT '{}',
  meeting_proposed_at          TIMESTAMPTZ,
  meeting_mode                 VARCHAR(10) CHECK (meeting_mode IS NULL OR meeting_mode IN ('presencial', 'online')),
  status                       analysis_request_status NOT NULL DEFAULT 'aberta',
  -- Resposta do Agente autor (uma só), com documentos da demanda ou do processo.
  answer_body                  TEXT CHECK (answer_body IS NULL OR (btrim(answer_body) <> '' AND char_length(answer_body) <= 5000)),
  answer_document_ids          UUID[] NOT NULL DEFAULT '{}' CHECK (cardinality(answer_document_ids) <= 20),
  answered_by                  UUID,
  answered_at                  TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_analysis_requests_org CHECK (
    requester_category <> 'poder_publico' OR requester_organization_id IS NOT NULL),
  CONSTRAINT demand_analysis_requests_answered CHECK (
    (status = 'respondida') = (answered_at IS NOT NULL AND answered_by IS NOT NULL AND answer_body IS NOT NULL)),
  CONSTRAINT demand_analysis_requests_refusal CHECK (kind <> 'recusa' OR status = 'encerrada')
);

CREATE INDEX IF NOT EXISTS idx_analysis_requests_demand
  ON demand_analysis_requests(demand_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_requests_requester
  ON demand_analysis_requests(requester_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_requests_org
  ON demand_analysis_requests(requester_organization_id, created_at DESC) WHERE requester_organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_requests_open
  ON demand_analysis_requests(demand_id) WHERE status = 'aberta';
-- Uma recusa por conta/órgão e demanda.
CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_requests_one_refusal
  ON demand_analysis_requests(demand_id, (coalesce(requester_organization_id, requester_user_id)))
  WHERE kind = 'recusa';

CREATE OR REPLACE FUNCTION demand_analysis_requests_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  d RECORD;
  doc UUID;
  found BOOLEAN;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê as solicitações de análise' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'solicitações de análise não são excluídas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT status::text AS status, author_id INTO d FROM demands WHERE id = NEW.demand_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'demanda inexistente' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF d.status NOT IN ('publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao') THEN
      RAISE EXCEPTION 'solicitação de análise só com a demanda aberta (estado: %)', d.status USING ERRCODE = 'check_violation';
    END IF;
    IF d.author_id = NEW.requester_user_id THEN
      RAISE EXCEPTION 'o autor não solicita análise da própria demanda' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.process_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM connection_processes WHERE id = NEW.process_id AND demand_id = NEW.demand_id) THEN
      RAISE EXCEPTION 'processo de outra demanda' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.institutional_response_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM demand_institutional_responses
                        WHERE id = NEW.institutional_response_id AND demand_id = NEW.demand_id
                          AND organization_id = NEW.requester_organization_id) THEN
      RAISE EXCEPTION 'resposta institucional de outra demanda ou órgão' USING ERRCODE = 'check_violation';
    END IF;
    NEW.status := CASE WHEN NEW.kind = 'recusa' THEN 'encerrada' ELSE 'aberta' END;
    NEW.answer_body := NULL;
    NEW.answer_document_ids := '{}';
    NEW.answered_by := NULL;
    NEW.answered_at := NULL;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.demand_id, NEW.process_id, NEW.institutional_response_id, NEW.requester_user_id, NEW.requester_name,
      NEW.requester_category, NEW.requester_profile_type, NEW.requester_organization_id,
      NEW.requester_organization_name, NEW.kind, NEW.body, NEW.requested_document_types, NEW.meeting_proposed_at,
      NEW.meeting_mode, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.demand_id, OLD.process_id, OLD.institutional_response_id, OLD.requester_user_id, OLD.requester_name,
      OLD.requester_category, OLD.requester_profile_type, OLD.requester_organization_id,
      OLD.requester_organization_name, OLD.kind, OLD.body, OLD.requested_document_types, OLD.meeting_proposed_at,
      OLD.meeting_mode, OLD.created_at) THEN
    RAISE EXCEPTION 'a solicitação registrada não muda' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'aberta' THEN
    RAISE EXCEPTION 'solicitação já respondida ou encerrada' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'respondida' THEN
    -- Documentos da resposta: da própria demanda ou do processo dela.
    FOREACH doc IN ARRAY NEW.answer_document_ids LOOP
      found := EXISTS (SELECT 1 FROM demand_documents WHERE id = doc AND demand_id = NEW.demand_id);
      IF NOT found AND to_regclass('public.connection_process_documents') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (SELECT 1 FROM connection_process_documents WHERE id = $1 AND demand_id = $2)'
          INTO found USING doc, NEW.demand_id;
      END IF;
      IF NOT found THEN
        RAISE EXCEPTION 'documento da resposta não pertence à demanda' USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
    NEW.answered_at := NOW();
  ELSIF NEW.status = 'encerrada' THEN
    IF NEW.answer_body IS NOT NULL OR cardinality(NEW.answer_document_ids) > 0 THEN
      RAISE EXCEPTION 'solicitação encerrada sem resposta' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'a solicitação aberta só é respondida ou encerrada' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_analysis_requests_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'demand_analysis_requests não é apagada' USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE OR REPLACE FUNCTION demand_analysis_requests_record_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  base JSONB := jsonb_build_object('analysis_request_id', NEW.id, 'kind', NEW.kind,
                                   'requester_category', NEW.requester_category, 'process_id', NEW.process_id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- O espelho do Poder Público já entrou na linha do tempo como resposta institucional.
    IF NEW.institutional_response_id IS NULL THEN
      INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, note, payload, is_public, created_at)
      VALUES (
        NEW.demand_id, NEW.process_id, 'solicitacao_registrada',
        CASE WHEN NEW.requester_category = 'poder_publico' THEN 'poder_publico' ELSE 'parceiro' END,
        NEW.requester_user_id::text, CASE WHEN NEW.kind = 'recusa' THEN NEW.body END,
        base || jsonb_build_object('public', jsonb_build_object(
          'kind', NEW.kind, 'requesterCategory', NEW.requester_category,
          'requestedDocumentTypes', to_jsonb(NEW.requested_document_types))),
        NEW.kind <> 'recusa', clock_timestamp());
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'respondida' THEN
    INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, NEW.process_id, 'solicitacao_respondida', 'agente', NEW.answered_by::text,
      base || jsonb_build_object('public', jsonb_build_object(
        'kind', NEW.kind, 'requesterCategory', NEW.requester_category,
        'documentsCount', cardinality(NEW.answer_document_ids))),
      true, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS demand_analysis_requests_guard ON demand_analysis_requests;
CREATE TRIGGER demand_analysis_requests_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_analysis_requests
  FOR EACH ROW EXECUTE FUNCTION demand_analysis_requests_guard();

DROP TRIGGER IF EXISTS demand_analysis_requests_block_truncate ON demand_analysis_requests;
CREATE TRIGGER demand_analysis_requests_block_truncate
  BEFORE TRUNCATE ON demand_analysis_requests
  FOR EACH STATEMENT EXECUTE FUNCTION demand_analysis_requests_no_truncate();

DROP TRIGGER IF EXISTS demand_analysis_requests_record_event ON demand_analysis_requests;
CREATE TRIGGER demand_analysis_requests_record_event
  AFTER INSERT OR UPDATE ON demand_analysis_requests
  FOR EACH ROW EXECUTE FUNCTION demand_analysis_requests_record_event();
