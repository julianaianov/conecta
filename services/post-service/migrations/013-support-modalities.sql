-- Migração 013: modalidades de apoio da fonte, registro de apoio realizado,
-- dupla confirmação e histórico público de apoio (T16).
--
-- Fonte: dm-docs/docs/fonte-da-verdade/01-apresentacao-institucional.html,
-- slide 20 ("Sistema de apoio": patrocinar projetos, doar recursos, financiar
-- eventos, adotar espaços públicos, apoiar ações ambientais, contratar
-- serviços locais), slide 21 ("Transparência e impacto": histórico de apoio) e
-- slide 10 (Parceiros: "oferecer recursos", "oferecer produtos ou serviços",
-- "apoiar projetos", "registrar apoio realizado", "acompanhar resultados",
-- "participar do ranking de apoiadores"); slide 11 (Poder Público também
-- apoia, sem ranking competitivo). Decisão 5 (decisoes-de-implementacao.md):
-- a plataforma não processa pagamento — o apoio financeiro é valor declarado.
-- Contrato com o dm-gestao: dm-docs/docs/gestao/04-modelagem-de-dados.md.
--
-- O apoio continua na tabela `supports` (a mesma que o dm-gestao lê e cujo
-- `status` ele confirma/rejeita). A T16 acrescenta:
--
-- - `modality` (as 6 modalidades da fonte) ao lado de `type`, que passa a ser
--   "o que é oferecido" (financeiro, materiais, equipamentos, serviços/mão de
--   obra, voluntariado, espaço, alimentação, transporte, conhecimento,
--   divulgação). Os apoios antigos recebem a modalidade por este mapeamento:
--     financial                         → patrocinar_projeto
--                                         (em post de evento → financiar_evento)
--     materials, equipment, food, space,
--     volunteering                      → doar_recursos
--     labor, transport, knowledge       → contratar_servicos_locais
--     sharing                           → NULL (divulgação é amplificação, e
--                                         não uma das 6 modalidades de apoio)
-- - `demand_id`: apoio registrado na demanda (T06). O `post_id` continua
--   preenchido com o post-vitrine da demanda, para o dm-gestao (Post::supports,
--   IndicatorsService) seguir enxergando o apoio pelo feed.
-- - Registro de apoio realizado com dupla confirmação: o Parceiro (ou o Poder
--   Público) declara; o Agente autor confirma o recebimento, com evidência
--   opcional (uploads da T08), ou contesta. `receipt_status`:
--   `declarado` → `confirmado` | `contestado`; `contestado` → `confirmado`.
--   `confirmado` é final.
-- - Transparência (slide 21): `display_consent` (o apoiador consente em
--   aparecer com nome público), `public_name` e `amount_public` (valor
--   declarado visível). Sem consentimento, o histórico público mostra só a
--   categoria do apoiador.
-- - `supports.status` continua sendo a coluna do dm-gestao
--   (`pending`/`confirmed`/`rejected`, SupportController::updateStatus): o
--   apoio de demanda nasce `pending` e vai a `confirmed` quando o Agente
--   confirma o recebimento. A gestão continua podendo confirmar ou rejeitar.
--
-- Imutabilidade: no apoio de demanda, quem apoiou, a modalidade, o que foi
-- oferecido, a descrição e o valor declarado não mudam depois de gravados;
-- nada é excluído (o apoiador cancela com `canceled_at`); o histórico fica em
-- `demand_events` (só inserção). A gestão só grava `status` (e `updated_at`,
-- que o Eloquent atualiza junto): o grant do dm-infra
-- (db/migrations/gestao/013-gestao-app-post-supports.sql) e o trigger
-- `supports_guard` dizem o mesmo.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- "Sistema de apoio" (Apresentação, slide 20).
DO $$ BEGIN
  CREATE TYPE support_modality AS ENUM (
    'patrocinar_projeto', 'doar_recursos', 'financiar_evento',
    'adotar_espaco_publico', 'apoiar_acao_ambiental', 'contratar_servicos_locais'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_receipt_status AS ENUM ('declarado', 'confirmado', 'contestado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE supports
  ADD COLUMN IF NOT EXISTS modality         support_modality,
  ADD COLUMN IF NOT EXISTS demand_id        UUID REFERENCES demands(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS supporter_category VARCHAR(20),
  ADD COLUMN IF NOT EXISTS profile_type     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS organization_id  UUID,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS receipt_status   support_receipt_status,
  ADD COLUMN IF NOT EXISTS receipt_note     TEXT,
  ADD COLUMN IF NOT EXISTS receipt_evidence TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS receipt_answered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS display_consent  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_name      VARCHAR(160),
  ADD COLUMN IF NOT EXISTS amount_public    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS occurred_on      DATE,
  ADD COLUMN IF NOT EXISTS canceled_at      TIMESTAMPTZ;

-- Mapeamento dos tipos antigos (o comentário do topo é o contrato documentado).
UPDATE supports s SET modality = CASE
    WHEN s.type = 'financial' AND EXISTS (SELECT 1 FROM posts p WHERE p.id = s.post_id AND p.type = 'event')
      THEN 'financiar_evento'::support_modality
    WHEN s.type = 'financial' THEN 'patrocinar_projeto'::support_modality
    WHEN s.type IN ('materials', 'equipment', 'food', 'space', 'volunteering') THEN 'doar_recursos'::support_modality
    WHEN s.type IN ('labor', 'transport', 'knowledge') THEN 'contratar_servicos_locais'::support_modality
    ELSE NULL
  END
 WHERE s.modality IS NULL AND s.type <> 'sharing';

-- Apoio de demanda: modalidade, descrição, estado do recebimento e categoria
-- de quem apoiou são obrigatórios; o apoio antigo do feed segue como está.
DO $$ BEGIN
  ALTER TABLE supports ADD CONSTRAINT supports_demand_fields CHECK (
    demand_id IS NULL
    OR (modality IS NOT NULL AND receipt_status IS NOT NULL
        AND description IS NOT NULL AND btrim(description) <> ''
        AND char_length(description) <= 2000
        AND supporter_category IN ('parceiro', 'poder_publico'))
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE supports ADD CONSTRAINT supports_receipt_answer CHECK (
    (receipt_status IN ('confirmado', 'contestado')) = (receipt_answered_at IS NOT NULL)
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Valor declarado (decisão 5: nenhum pagamento é processado).
DO $$ BEGIN
  ALTER TABLE supports ADD CONSTRAINT supports_amount_positive CHECK (amount IS NULL OR amount >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estado lido e escrito pelo dm-gestao (SupportController::updateStatus).
DO $$ BEGIN
  ALTER TABLE supports ADD CONSTRAINT supports_status_values
    CHECK (status IN ('pending', 'confirmed', 'rejected')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE supports ADD CONSTRAINT supports_public_name CHECK (
    public_name IS NULL OR (btrim(public_name) <> '' AND char_length(public_name) <= 160)
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE supports ADD CONSTRAINT supports_evidence_limit
    CHECK (cardinality(receipt_evidence) <= 10) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- O apoio do feed continua com um registro por (post, conta, tipo); o apoio de
-- demanda é um registro de fato ocorrido e pode repetir a modalidade.
ALTER TABLE supports DROP CONSTRAINT IF EXISTS supports_post_id_user_id_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_supports_feed_unique
  ON supports(post_id, user_id, type) WHERE demand_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_supports_demand ON supports(demand_id, created_at DESC)
  WHERE demand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supports_demand_user ON supports(user_id, created_at DESC)
  WHERE demand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supports_modality ON supports(modality) WHERE modality IS NOT NULL;

-- Estados da demanda que recebem registro de apoio: da publicação em diante,
-- fora `arquivada` (o apoio realizado também é registrado depois da conclusão).
CREATE OR REPLACE FUNCTION supports_assert_demand_open(target UUID, supporter UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  st demand_status;
  author UUID;
BEGIN
  SELECT status, author_id INTO st, author FROM demands WHERE id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'demanda inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF st NOT IN ('publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao', 'concluida', 'prestacao_de_contas') THEN
    RAISE EXCEPTION 'o apoio é registrado com a demanda publicada (estado: %)', st USING ERRCODE = 'check_violation';
  END IF;
  IF supporter IS NOT NULL AND author = supporter THEN
    RAISE EXCEPTION 'o autor não registra apoio à própria demanda' USING ERRCODE = 'check_violation';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION supports_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  is_gestao BOOLEAN := session_user = 'gestao_app';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF is_gestao THEN
      RAISE EXCEPTION 'a gestão não exclui apoios' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.demand_id IS NOT NULL THEN
      RAISE EXCEPTION 'apoio de demanda não é excluído (cancele com canceled_at)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF is_gestao THEN
      RAISE EXCEPTION 'a gestão não registra apoios' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Modalidade dos apoios antigos do feed, pelo mesmo mapeamento da migração.
    IF NEW.modality IS NULL AND NEW.demand_id IS NULL THEN
      NEW.modality := CASE
        WHEN NEW.type = 'financial' AND EXISTS (SELECT 1 FROM posts p WHERE p.id = NEW.post_id AND p.type = 'event')
          THEN 'financiar_evento'::support_modality
        WHEN NEW.type = 'financial' THEN 'patrocinar_projeto'::support_modality
        WHEN NEW.type IN ('materials', 'equipment', 'food', 'space', 'volunteering') THEN 'doar_recursos'::support_modality
        WHEN NEW.type IN ('labor', 'transport', 'knowledge') THEN 'contratar_servicos_locais'::support_modality
        ELSE NULL END;
    END IF;
    IF NEW.demand_id IS NULL THEN
      -- O apoio à demanda passa pelo registro de apoio realizado, e não pelo
      -- post-vitrine (o post é só a face social da demanda).
      IF EXISTS (SELECT 1 FROM posts p WHERE p.id = NEW.post_id AND p.demand_id IS NOT NULL) THEN
        RAISE EXCEPTION 'o apoio à demanda é registrado na demanda, não no post-vitrine' USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;
    PERFORM supports_assert_demand_open(NEW.demand_id, NEW.user_id);
    IF NEW.receipt_status IS DISTINCT FROM 'declarado' OR NEW.canceled_at IS NOT NULL THEN
      RAISE EXCEPTION 'o apoio nasce declarado e em aberto' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'o apoio de demanda nasce pendente de confirmação' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.payment_method IS NOT NULL THEN
      RAISE EXCEPTION 'a plataforma não processa pagamento: o apoio financeiro é valor declarado' USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- UPDATE
  IF is_gestao THEN
    -- O grant do dm-infra já limita as colunas; aqui a regra fica no banco.
    IF (NEW.id, NEW.post_id, NEW.demand_id, NEW.user_id, NEW.type, NEW.modality, NEW.amount,
        NEW.description, NEW.receipt_status, NEW.display_consent, NEW.amount_public, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.post_id, OLD.demand_id, OLD.user_id, OLD.type, OLD.modality, OLD.amount,
        OLD.description, OLD.receipt_status, OLD.display_consent, OLD.amount_public, OLD.created_at) THEN
      RAISE EXCEPTION 'a gestão só confirma ou rejeita o status do apoio' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF OLD.demand_id IS NULL THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.post_id, NEW.demand_id, NEW.user_id, NEW.user_name, NEW.supporter_category,
      NEW.profile_type, NEW.organization_id, NEW.type, NEW.modality, NEW.description, NEW.amount,
      NEW.occurred_on, NEW.message, NEW.payment_method, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.post_id, OLD.demand_id, OLD.user_id, OLD.user_name, OLD.supporter_category,
      OLD.profile_type, OLD.organization_id, OLD.type, OLD.modality, OLD.description, OLD.amount,
      OLD.occurred_on, OLD.message, OLD.payment_method, OLD.created_at) THEN
    RAISE EXCEPTION 'quem apoiou, a modalidade, o que foi oferecido, a descrição e o valor declarado não mudam'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.canceled_at IS NOT NULL AND NEW.canceled_at IS NOT NULL THEN
    RAISE EXCEPTION 'apoio cancelado não muda' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.canceled_at IS NOT NULL AND NEW.canceled_at IS NULL THEN
    RAISE EXCEPTION 'o cancelamento do apoio é final' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.canceled_at IS NOT NULL THEN
    IF OLD.receipt_status = 'confirmado' THEN
      RAISE EXCEPTION 'apoio confirmado pelo Agente não é cancelado' USING ERRCODE = 'check_violation';
    END IF;
    NEW.canceled_at := NOW();
  END IF;

  IF NEW.receipt_status IS DISTINCT FROM OLD.receipt_status THEN
    IF OLD.receipt_status = 'confirmado' THEN
      RAISE EXCEPTION 'a confirmação do recebimento é final' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.receipt_status = 'declarado' THEN
      RAISE EXCEPTION 'transição de recebimento não permitida (% → %)', OLD.receipt_status, NEW.receipt_status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.receipt_answered_at := NOW();
    -- Dupla confirmação: confirmado pelo Agente vira `confirmed` para a gestão,
    -- que segue podendo rejeitar depois.
    IF NEW.receipt_status = 'confirmado' AND OLD.status = 'pending' THEN
      NEW.status := 'confirmed';
    END IF;
  ELSIF NEW.receipt_answered_at IS DISTINCT FROM OLD.receipt_answered_at THEN
    RAISE EXCEPTION 'a data da resposta muda só com o estado do recebimento' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'pending' AND NEW.status = 'confirmed' AND NEW.receipt_status = 'confirmado') THEN
    RAISE EXCEPTION 'o status do apoio é da gestão (confirmar/rejeitar)' USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION supports_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'supports não é apagada' USING ERRCODE = 'insufficient_privilege';
END
$$;

-- Linha do tempo da demanda. payload->'public' é o que a rota pública mostra:
-- modalidade, o que foi oferecido, categoria do apoiador e, quando houver
-- consentimento, o nome público; valor só quando o apoiador o torna público.
CREATE OR REPLACE FUNCTION supports_record_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor_kind TEXT;
  public_part JSONB;
  base JSONB;
  author UUID;
BEGIN
  IF NEW.demand_id IS NULL THEN RETURN NULL; END IF;
  actor_kind := CASE NEW.supporter_category WHEN 'poder_publico' THEN 'poder_publico' ELSE 'parceiro' END;
  public_part := jsonb_build_object(
    'modality', NEW.modality,
    'supportType', NEW.type,
    'supporterCategory', NEW.supporter_category,
    'supporterName', CASE WHEN NEW.display_consent THEN coalesce(NEW.public_name, NEW.user_name) ELSE NULL END,
    'amount', CASE WHEN NEW.amount_public THEN NEW.amount ELSE NULL END);
  base := jsonb_build_object('support_id', NEW.id, 'modality', NEW.modality, 'support_type', NEW.type);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (NEW.demand_id, 'apoio_declarado', actor_kind, NEW.user_id::text,
            base || jsonb_build_object('public', public_part), true, clock_timestamp());
    RETURN NULL;
  END IF;

  IF NEW.receipt_status IS DISTINCT FROM OLD.receipt_status THEN
    SELECT author_id INTO author FROM demands WHERE id = NEW.demand_id;
    IF NEW.receipt_status = 'confirmado' THEN
      INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
      VALUES (NEW.demand_id, 'apoio_confirmado', 'agente', author::text,
              base || jsonb_build_object('public', public_part,
                                         'evidence_count', cardinality(NEW.receipt_evidence)),
              true, clock_timestamp());
    ELSE
      -- A contestação aparece na linha do tempo sem o motivo (privado).
      INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
      VALUES (NEW.demand_id, 'apoio_contestado', 'agente', author::text,
              base || jsonb_build_object('public', public_part - 'supporterName' - 'amount',
                                         'note', NEW.receipt_note),
              true, clock_timestamp());
    END IF;
  END IF;

  IF NEW.canceled_at IS NOT NULL AND OLD.canceled_at IS NULL THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (NEW.demand_id, 'apoio_cancelado', actor_kind, NEW.user_id::text, base, false, clock_timestamp());
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.receipt_status IS NOT DISTINCT FROM OLD.receipt_status THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (NEW.demand_id, 'apoio_revisado_gestao', 'gestao', NULL,
            base || jsonb_build_object('status', NEW.status), false, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS supports_guard ON supports;
CREATE TRIGGER supports_guard
  BEFORE INSERT OR UPDATE OR DELETE ON supports
  FOR EACH ROW EXECUTE FUNCTION supports_guard();

DROP TRIGGER IF EXISTS supports_block_truncate ON supports;
CREATE TRIGGER supports_block_truncate
  BEFORE TRUNCATE ON supports
  FOR EACH STATEMENT EXECUTE FUNCTION supports_no_truncate();

DROP TRIGGER IF EXISTS supports_record_event ON supports;
CREATE TRIGGER supports_record_event
  AFTER INSERT OR UPDATE ON supports
  FOR EACH ROW EXECUTE FUNCTION supports_record_event();
