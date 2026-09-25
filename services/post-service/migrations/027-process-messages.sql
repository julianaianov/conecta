-- Migração 027: comunicação do Processo de Conexão (T-05-02).
--
-- Fonte: dm-docs/fonte-da-verdade/ (Modelo de Conexão) §12 "Cada interação
-- poderá registrar: usuário, instituição, cargo/perfil, data, horário,
-- destinatário, mensagem, documentos anexados, histórico"; §08 "Nova
-- mensagem". Decisão 13 de decisoes-de-implementacao.md: a conversa T27
-- (user_db.connection_messages) vale na fase de pedido; a partir do protocolo a
-- comunicação é `connection_process_messages`, aqui, no post_db.
--
-- - `connection_process_messages`: uma linha por mensagem do processo, com o
--   retrato de quem escreveu (nome, instituição e cargo/perfil no momento do
--   envio), o lado dele (`agente` = Agente autor da demanda; `conectado` =
--   parte conectada, conta do Parceiro ou órgão do Poder Público), o
--   destinatário (`agente` | `conectado` | `todos`), o corpo (≤ 4000) e os
--   anexos (ids de `uploads` da finalidade `process_attachment`, confirmados,
--   do autor e deste processo; no máximo 10). Data e horário = `created_at`.
-- - Append-only (mesmo padrão de `connection_messages_guard`, user 012): nada
--   é editado nem excluído; a única mudança aceita é a anonimização a pedido do
--   titular (corpo → `[removido a pedido do titular]`, nome → `Conta
--   removida`, cargo apagado). A gestão só lê (dm-infra
--   db/migrations/gestao/026-gestao-app-post-process-comms.sql).
-- - Cada mensagem entra na linha do tempo do processo como `mensagem_registrada`
--   (privado: só as partes; payload sem o corpo).
-- - `connection_process_message_reads`: última leitura de cada conta (o aviso
--   `nova_mensagem` da central é lido ao abrir a conversa).
-- - `uploads.process_id`: vínculo dos arquivos do processo (anexos aqui e
--   documentos na 029). O trigger `uploads_link_process` preenche também
--   `demand_id` com a demanda do processo, para o arquivo continuar sob as
--   regras de `uploads_confirmed_complete` (024).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- ---------------------------------------------------------------------------
-- Arquivos do processo em `uploads`.
ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS process_id UUID REFERENCES connection_processes(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_uploads_process ON uploads(process_id) WHERE process_id IS NOT NULL;

-- Finalidade nova, somada às que já estão no CHECK (a lista é lida do
-- catálogo: outras migrações também acrescentam finalidades).
DO $$
DECLARE
  def    TEXT;
  vals   TEXT[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'uploads'::regclass AND conname = 'uploads_purpose_check';
  IF def IS NOT NULL AND def LIKE '%''process_attachment''%' THEN
    RETURN;
  END IF;
  SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::TEXT[]) INTO vals
    FROM regexp_matches(coalesce(def, ''), '''([a-z_]+)''', 'g') AS m;
  vals := array_append(vals, 'process_attachment');
  ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_purpose_check;
  EXECUTE format('ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (%s))',
                 (SELECT string_agg(quote_literal(v), ', ' ORDER BY v) FROM unnest(vals) v));
END $$;

CREATE OR REPLACE FUNCTION uploads_link_process() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  process_demand UUID;
BEGIN
  IF NEW.process_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.purpose NOT LIKE 'process\_%' THEN
    RAISE EXCEPTION 'só arquivos do processo se vinculam a um processo (finalidade %)', NEW.purpose
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.process_id IS NOT NULL AND NEW.process_id IS DISTINCT FROM OLD.process_id THEN
    RAISE EXCEPTION 'o processo do arquivo não muda' USING ERRCODE = 'check_violation';
  END IF;
  SELECT demand_id INTO process_demand FROM connection_processes WHERE id = NEW.process_id;
  IF NEW.demand_id IS NULL THEN
    NEW.demand_id := process_demand;
  ELSIF NEW.demand_id IS DISTINCT FROM process_demand THEN
    RAISE EXCEPTION 'arquivo do processo fica na demanda do processo' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS uploads_link_process ON uploads;
CREATE TRIGGER uploads_link_process
  BEFORE INSERT OR UPDATE ON uploads
  FOR EACH ROW EXECUTE FUNCTION uploads_link_process();

-- ---------------------------------------------------------------------------
-- Mensagens do processo.
CREATE TABLE IF NOT EXISTS connection_process_messages (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id                UUID NOT NULL REFERENCES connection_processes(id) ON DELETE RESTRICT,
  -- Demanda do processo (gravada pelo trigger), para consultas da gestão.
  demand_id                 UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  author_id                 UUID NOT NULL,
  -- `agente`: Agente autor da demanda; `conectado`: parte conectada.
  author_side               VARCHAR(10) NOT NULL CHECK (author_side IN ('agente', 'conectado')),
  -- Retrato no envio (§12: usuário, instituição, cargo/perfil).
  author_name               VARCHAR(255) NOT NULL CHECK (btrim(author_name) <> ''),
  author_organization_name  VARCHAR(255),
  author_role_label         VARCHAR(120),
  recipient_party           VARCHAR(10) NOT NULL CHECK (recipient_party IN ('agente', 'conectado', 'todos')),
  body                      TEXT NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 4000),
  -- Ids de uploads `process_attachment` (a API expõe `upload:<id>`).
  attachments               UUID[] NOT NULL DEFAULT '{}' CHECK (cardinality(attachments) <= 10),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connection_process_messages_thread
  ON connection_process_messages(process_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_connection_process_messages_author
  ON connection_process_messages(author_id, created_at);

CREATE TABLE IF NOT EXISTS connection_process_message_reads (
  process_id    UUID NOT NULL REFERENCES connection_processes(id) ON DELETE RESTRICT,
  user_id       UUID NOT NULL,
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (process_id, user_id)
);

-- Guarda: append-only, gestão só lê, a única edição é a anonimização.
CREATE OR REPLACE FUNCTION connection_process_messages_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  p RECORD;
  author UUID;
  bad INT;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê as mensagens do processo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'mensagem do processo não é excluída' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.process_id, NEW.demand_id, NEW.author_id, NEW.author_side, NEW.author_organization_name,
        NEW.recipient_party, NEW.attachments, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.process_id, OLD.demand_id, OLD.author_id, OLD.author_side, OLD.author_organization_name,
        OLD.recipient_party, OLD.attachments, OLD.created_at) THEN
      RAISE EXCEPTION 'mensagem do processo é imutável' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.body IS DISTINCT FROM OLD.body AND NEW.body <> '[removido a pedido do titular]')
       OR (NEW.author_name IS DISTINCT FROM OLD.author_name AND NEW.author_name <> 'Conta removida')
       OR (NEW.author_role_label IS DISTINCT FROM OLD.author_role_label AND NEW.author_role_label IS NOT NULL) THEN
      RAISE EXCEPTION 'mensagem do processo não é editada; só a anonimização a pedido do titular'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT: processo aberto, autor coerente com o lado, anexos do processo.
  SELECT id, demand_id, party_kind, party_user_id, closed_at INTO p
    FROM connection_processes WHERE id = NEW.process_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'processo inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF p.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'processo encerrado não recebe mensagens' USING ERRCODE = 'check_violation';
  END IF;
  SELECT author_id INTO author FROM demands WHERE id = p.demand_id;
  IF NEW.author_side = 'agente' AND NEW.author_id IS DISTINCT FROM author THEN
    RAISE EXCEPTION 'o lado agente é o autor da demanda' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.author_side = 'conectado' AND p.party_kind <> 'poder_publico' AND NEW.author_id IS DISTINCT FROM p.party_user_id THEN
    RAISE EXCEPTION 'o lado conectado é a parte do processo' USING ERRCODE = 'check_violation';
  END IF;
  IF cardinality(NEW.attachments) <> (SELECT count(DISTINCT a) FROM unnest(NEW.attachments) AS a) THEN
    RAISE EXCEPTION 'anexo repetido' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO bad FROM unnest(NEW.attachments) AS a
   WHERE NOT EXISTS (SELECT 1 FROM uploads u
                      WHERE u.id = a AND u.purpose = 'process_attachment' AND u.status = 'confirmado'
                        AND u.process_id = NEW.process_id AND u.owner_id = NEW.author_id);
  IF bad > 0 THEN
    RAISE EXCEPTION 'anexo não confirmado para este processo' USING ERRCODE = 'check_violation';
  END IF;
  NEW.demand_id := p.demand_id;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS connection_process_messages_guard ON connection_process_messages;
CREATE TRIGGER connection_process_messages_guard
  BEFORE INSERT OR UPDATE OR DELETE ON connection_process_messages
  FOR EACH ROW EXECUTE FUNCTION connection_process_messages_guard();

CREATE OR REPLACE FUNCTION connection_process_messages_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'mensagens do processo não são apagadas' USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS connection_process_messages_block_truncate ON connection_process_messages;
CREATE TRIGGER connection_process_messages_block_truncate
  BEFORE TRUNCATE ON connection_process_messages
  FOR EACH STATEMENT EXECUTE FUNCTION connection_process_messages_no_truncate();

-- Linha do tempo do processo (§35): evento privado, sem o corpo.
CREATE OR REPLACE FUNCTION connection_process_messages_after() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  p RECORD;
BEGIN
  SELECT protocol, party_kind INTO p FROM connection_processes WHERE id = NEW.process_id;
  INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, payload, is_public, created_at)
  VALUES (
    NEW.demand_id, NEW.process_id, 'mensagem_registrada',
    connection_process_actor_type(CASE WHEN NEW.author_side = 'agente' THEN 'agente' ELSE 'parte' END, p.party_kind),
    NEW.author_id::text,
    jsonb_build_object('process_id', NEW.process_id, 'protocol', p.protocol, 'message_id', NEW.id,
                       'recipient', NEW.recipient_party, 'attachments', cardinality(NEW.attachments)),
    false, NEW.created_at);
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS connection_process_messages_after ON connection_process_messages;
CREATE TRIGGER connection_process_messages_after
  AFTER INSERT ON connection_process_messages
  FOR EACH ROW EXECUTE FUNCTION connection_process_messages_after();

-- Leituras: nunca pela gestão.
CREATE OR REPLACE FUNCTION connection_process_message_reads_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê as leituras do processo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

DROP TRIGGER IF EXISTS connection_process_message_reads_guard ON connection_process_message_reads;
CREATE TRIGGER connection_process_message_reads_guard
  BEFORE INSERT OR UPDATE OR DELETE ON connection_process_message_reads
  FOR EACH ROW EXECUTE FUNCTION connection_process_message_reads_guard();
