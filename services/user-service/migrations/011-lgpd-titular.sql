-- T24 — Direitos do titular (LGPD, art. 18) no portal.
--
-- Fonte: Apresentação Institucional, slide 25 ("Conformidade com a LGPD em
-- toda a coleta, uso e compartilhamento"; "apenas dados verificáveis são
-- publicados; funcionalidades ainda em desenvolvimento são identificadas como
-- tal").
--
-- ── Como a gestão recebe a solicitação ─────────────────────────────────────
-- O dm-gestao já tem a fila de solicitações de titulares em
-- `gestao_db.data_subject_requests` (migration 2026_09_22_000010, documentada
-- em dm-docs/gestao/05-lgpd.md §2), com protocolo `LGPD-AAAA-NNNNNN` e
-- prazo de 15 dias corridos. O portal **não escreve no gestao_db** e a gestão
-- **não escreve no post_db além do permitido**: o pedido feito pelo titular
-- nasce aqui, em `user_db.data_subject_requests`, e a gestão **lê** esta
-- tabela (grant dm-infra db/migrations/gestao/018-gestao-app-user-lgpd.sql),
-- importa para a fila dela e escreve de volta **só** o desfecho
-- (`status`, `gestao_request_id`, `imported_at`, `response`, `responded_at`,
-- `closed_by`, `closed_at`, `updated_at`).
--
-- Protocolo: o mesmo formato da gestão, `LGPD-AAAA-NNNNNN`, com a **faixa
-- 900000+ reservada ao portal** (a sequência começa em 900001). A gestão numera
-- pelo id dela, que começa em 1; as duas faixas não se cruzam e o protocolo do
-- portal pode ser importado sem colisão no índice único de lá.
-- Prazo: `due_at` = `received_at` + 15 dias corridos (art. 19, II), o mesmo
-- padrão de `GESTAO_LGPD_RESPONSE_DEADLINE_DAYS`.
--
-- Minimização: a solicitação guarda o **id** da conta, nunca nome, e-mail ou
-- telefone (a gestão resolve o titular pelo id, como já faz).
--
-- ── Eliminação / anonimização ──────────────────────────────────────────────
-- `account_anonymizations` é a trilha de execução (append-only): o que foi
-- anonimizado em cada banco e quantos registros foram tocados — contagens, sem
-- dado pessoal. A regra por tipo de dado está em dm-docs/gestao/05-lgpd.md
-- §7 e no AGENTS.md do dm-api: o que a lei e o interesse público mandam reter
-- (demanda publicada, dossiê, prestação de contas, apoios, trilha de auditoria)
-- permanece, com a identificação suprimida onde ela é do titular pessoa
-- física; nada da trilha imutável é apagado ou reescrito.
--
-- Idempotente: o deploy reaplica o manifesto inteiro.

-- ── Solicitações do titular ────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS data_subject_request_number START 900001;

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number             BIGINT      NOT NULL DEFAULT nextval('data_subject_request_number'),
  protocol           VARCHAR(32) NOT NULL UNIQUE,
  subject_user_id    UUID        NOT NULL,
  request_type       VARCHAR(40) NOT NULL,
  channel            VARCHAR(30) NOT NULL DEFAULT 'portal',
  description        TEXT,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at             TIMESTAMPTZ NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'recebida',
  -- Atendimento automático do portal (exportação gerada, consentimento
  -- revogado, conta anonimizada). Não encerra a solicitação: quem encerra é a
  -- equipe, na gestão.
  fulfilled_at       TIMESTAMPTZ,
  export_object_key  TEXT,
  export_sha256      CHAR(64),
  export_bytes       BIGINT,
  export_expires_at  TIMESTAMPTZ,
  -- Desfecho, escrito só pela gestão.
  gestao_request_id  BIGINT,
  imported_at        TIMESTAMPTZ,
  response           TEXT,
  responded_at       TIMESTAMPTZ,
  closed_by          VARCHAR(64),
  closed_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT data_subject_requests_type CHECK (request_type IN (
    'acesso', 'correcao', 'eliminacao', 'portabilidade',
    'revogacao_consentimento', 'compartilhamento'
  )),
  CONSTRAINT data_subject_requests_channel CHECK (channel = 'portal'),
  CONSTRAINT data_subject_requests_status CHECK (status IN (
    'recebida', 'em_andamento', 'concluida', 'indeferida'
  )),
  CONSTRAINT data_subject_requests_due CHECK (due_at > received_at)
);

CREATE INDEX IF NOT EXISTS idx_data_subject_requests_subject
  ON data_subject_requests (subject_user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_queue
  ON data_subject_requests (status, due_at);
-- Fila de importação da gestão: o que ainda não foi levado para o gestao_db.
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_pending_import
  ON data_subject_requests (received_at) WHERE imported_at IS NULL;

CREATE OR REPLACE FUNCTION data_subject_requests_guard() RETURNS TRIGGER AS $$
DECLARE
  from_gestao BOOLEAN := session_user = 'gestao_app';
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'data_subject_requests: % não é permitido (solicitações não são excluídas)', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF from_gestao THEN
      RAISE EXCEPTION 'a solicitação nasce no portal; a gestão só lê e despacha'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.protocol, NEW.number, NEW.subject_user_id, NEW.request_type, NEW.channel,
      NEW.description, NEW.received_at, NEW.due_at)
     IS DISTINCT FROM
     (OLD.protocol, OLD.number, OLD.subject_user_id, OLD.request_type, OLD.channel,
      OLD.description, OLD.received_at, OLD.due_at) THEN
    RAISE EXCEPTION 'data_subject_requests: protocolo, titular, tipo, pedido, recebimento e prazo não mudam'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status IN ('concluida', 'indeferida') THEN
    RAISE EXCEPTION 'data_subject_requests: solicitação encerrada é imutável'
      USING ERRCODE = 'check_violation';
  END IF;

  IF from_gestao THEN
    -- A gestão despacha; o atendimento automático é do portal.
    IF (NEW.fulfilled_at, NEW.export_object_key, NEW.export_sha256, NEW.export_bytes, NEW.export_expires_at)
       IS DISTINCT FROM
       (OLD.fulfilled_at, OLD.export_object_key, OLD.export_sha256, OLD.export_bytes, OLD.export_expires_at) THEN
      RAISE EXCEPTION 'a gestão não altera o atendimento automático do portal'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    -- O portal registra o atendimento automático e no máximo põe a
    -- solicitação em andamento; encerrar e responder é da equipe.
    IF NEW.status NOT IN ('recebida', 'em_andamento') THEN
      RAISE EXCEPTION 'o portal não encerra solicitação (quem responde é a equipe, na gestão)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (NEW.gestao_request_id, NEW.imported_at, NEW.response, NEW.responded_at, NEW.closed_by, NEW.closed_at)
       IS DISTINCT FROM
       (OLD.gestao_request_id, OLD.imported_at, OLD.response, OLD.responded_at, OLD.closed_by, OLD.closed_at) THEN
      RAISE EXCEPTION 'o desfecho da solicitação é escrito pela gestão'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS data_subject_requests_guard ON data_subject_requests;
CREATE TRIGGER data_subject_requests_guard
  BEFORE INSERT OR UPDATE OR DELETE ON data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION data_subject_requests_guard();

DROP TRIGGER IF EXISTS data_subject_requests_block_truncate ON data_subject_requests;
CREATE TRIGGER data_subject_requests_block_truncate
  BEFORE TRUNCATE ON data_subject_requests
  FOR EACH STATEMENT EXECUTE FUNCTION data_subject_requests_guard();

-- ── Trilha da eliminação / anonimização ────────────────────────────────────

CREATE TABLE IF NOT EXISTS account_anonymizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL,
  request_id    UUID        REFERENCES data_subject_requests(id) ON DELETE RESTRICT,
  protocol      VARCHAR(32),
  scope         VARCHAR(20) NOT NULL,
  summary       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_anonymizations_scope CHECK (scope IN ('conta', 'perfil', 'conteudo'))
);

CREATE INDEX IF NOT EXISTS idx_account_anonymizations_user
  ON account_anonymizations (user_id, executed_at DESC);

CREATE OR REPLACE FUNCTION account_anonymizations_guard() RETURNS TRIGGER AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê a trilha de anonimização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'account_anonymizations: % não é permitido (trilha imutável)', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS account_anonymizations_guard ON account_anonymizations;
CREATE TRIGGER account_anonymizations_guard
  BEFORE INSERT OR UPDATE OR DELETE ON account_anonymizations
  FOR EACH ROW EXECUTE FUNCTION account_anonymizations_guard();

DROP TRIGGER IF EXISTS account_anonymizations_block_truncate ON account_anonymizations;
CREATE TRIGGER account_anonymizations_block_truncate
  BEFORE TRUNCATE ON account_anonymizations
  FOR EACH STATEMENT EXECUTE FUNCTION account_anonymizations_guard();

-- Perfil anonimizado sai das projeções públicas e do ranking.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
