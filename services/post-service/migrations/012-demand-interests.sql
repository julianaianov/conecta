-- Migração 012: interesse, participação e conexão com a demanda (T15).
--
-- Fonte: dm-docs/fonte-da-verdade/01-apresentacao-institucional.html
-- (slides 9–11: permissões de Membros da Comunidade, Parceiros e Poder Público;
-- slide 15: "Empresas, marcas, comércio, patrocinadores, poder público ou
-- comunidade demonstram interesse e oferecem recursos, serviços, divulgação ou
-- articulação") e 02-fluxo-cadastro-agente-de-transformacao.html, slide 22
-- (Conexão com parceiros: demanda publicada → interesse → conexão → apoio).
-- Contrato com o dm-gestao: dm-docs/gestao/04-modelagem-de-dados.md.
--
-- - `demand_interests`: uma manifestação por (demanda, conta, tipo) em aberto.
--   Tipos: `apoio` (Parceiro ou Poder Público demonstra interesse em apoiar e
--   diz o que pretende oferecer: recursos, produtos, serviços, conhecimento,
--   estrutura, investimento), `participacao` e `voluntariado` (Membro da
--   Comunidade: "demonstrar interesse em participar" e "oferecer
--   voluntariado"). Retrato do nome e do perfil de quem manifestou (o Agente vê
--   quem se interessou; o público vê só contagens e categorias).
-- - A conexão com o Agente é a de user_db.connections (outra base, sem FK):
--   `connection_id` + `connection_status` espelham o pedido feito pelo
--   post-service no user-service. Aceita, a demanda vai para `conectada` pelo
--   ator `sistema` (src/routes/interests.js); o trigger demands_guard confere.
-- - Imutável depois de gravado: quem, demanda, tipo, oferta e mensagem não
--   mudam. Mudam só a retirada (uma vez, final) e o estado da conexão
--   (pendente → aceita | recusada | cancelada; recusada/cancelada → pendente com
--   outra conexão). Nada é excluído; a gestão só lê (grant SELECT no dm-infra,
--   db/migrations/gestao/011-gestao-app-post-interests.sql).
-- - Linha do tempo: `interesse_registrado`, `interesse_retirado`,
--   `conexao_solicitada` e `conexao_aceita` são públicos, com payload->'public'
--   só com tipo, categoria da conta e ofertas (sem nome nem id);
--   `conexao_recusada` e `conexao_cancelada` são privados (autor e gestão).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

DO $$ BEGIN
  CREATE TYPE demand_interest_kind AS ENUM ('apoio', 'participacao', 'voluntariado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- "Possuem recursos, produtos, serviços, conhecimento, estrutura ou
-- investimento para apoiar uma demanda ou projeto" (Apresentação, slide 10).
DO $$ BEGIN
  CREATE TYPE demand_interest_offer AS ENUM (
    'recursos', 'produtos', 'servicos', 'conhecimento', 'estrutura', 'investimento'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE demand_interest_connection_status AS ENUM ('pendente', 'aceita', 'recusada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Linha do tempo: Parceiros e Membros da Comunidade passam a ser atores.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'demand_events'::regclass AND conname = 'demand_events_actor_type_check'
                AND pg_get_constraintdef(oid) NOT LIKE '%comunidade%') THEN
    ALTER TABLE demand_events DROP CONSTRAINT demand_events_actor_type_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_events'::regclass AND conname = 'demand_events_actor_type_check') THEN
    ALTER TABLE demand_events ADD CONSTRAINT demand_events_actor_type_check
      CHECK (actor_type IN ('agente', 'gestao', 'sistema', 'poder_publico', 'parceiro', 'comunidade'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS demand_interests (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id                UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  -- Conta que manifestou (auth_db.users.id) e retrato do perfil no momento.
  user_id                  UUID NOT NULL,
  user_name                VARCHAR(255),
  user_avatar              VARCHAR(500),
  user_category            VARCHAR(20) NOT NULL
                             CHECK (user_category IN ('parceiro', 'comunidade', 'poder_publico')),
  profile_type             VARCHAR(50),
  -- Órgão do Poder Público validado (user_db.organizations.id), quando for o caso.
  organization_id          UUID,
  kind                     demand_interest_kind NOT NULL,
  offer_types              demand_interest_offer[] NOT NULL DEFAULT '{}',
  message                  TEXT CHECK (message IS NULL OR (btrim(message) <> '' AND char_length(message) <= 2000)),
  -- Conexão pedida ao Agente (user_db.connections.id, outra base: sem FK).
  connection_id            UUID,
  connection_status        demand_interest_connection_status,
  connection_requested_at  TIMESTAMPTZ,
  connection_answered_at   TIMESTAMPTZ,
  withdrawn_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Apoio diz o que oferece; participação e voluntariado não têm oferta.
  CONSTRAINT demand_interests_offers CHECK (
    cardinality(offer_types) <= 6
    AND ((kind = 'apoio') = (cardinality(offer_types) >= 1))),
  -- Quem pode cada tipo (Apresentação, slides 9–11).
  CONSTRAINT demand_interests_kind_category CHECK (
    (kind = 'apoio' AND user_category IN ('parceiro', 'poder_publico'))
    OR (kind IN ('participacao', 'voluntariado') AND user_category = 'comunidade')),
  CONSTRAINT demand_interests_connection CHECK (
    (connection_id IS NULL) = (connection_status IS NULL)
    AND (connection_id IS NULL) = (connection_requested_at IS NULL)
    AND ((connection_status IN ('aceita', 'recusada', 'cancelada')) = (connection_answered_at IS NOT NULL)))
);

-- Uma manifestação em aberto por tipo; depois de retirada, pode haver outra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_demand_interests_open
  ON demand_interests(demand_id, user_id, kind) WHERE withdrawn_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_demand_interests_demand
  ON demand_interests(demand_id, created_at);
CREATE INDEX IF NOT EXISTS idx_demand_interests_user
  ON demand_interests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_interests_connection
  ON demand_interests(connection_id) WHERE connection_id IS NOT NULL;

-- Interesse e conexão valem da publicação até a execução (antes da conclusão).
CREATE OR REPLACE FUNCTION demand_interests_assert_open(target UUID, author_must_differ UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  st demand_status;
  author UUID;
BEGIN
  SELECT status, author_id INTO st, author FROM demands WHERE id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'demanda inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF st NOT IN ('publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao') THEN
    RAISE EXCEPTION 'interesse e conexão só com a demanda publicada e antes da conclusão (estado: %)', st
      USING ERRCODE = 'check_violation';
  END IF;
  IF author_must_differ IS NOT NULL AND author = author_must_differ THEN
    RAISE EXCEPTION 'o autor não manifesta interesse na própria demanda' USING ERRCODE = 'check_violation';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION demand_interests_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os interesses' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'interesses não são excluídos (retire com withdrawn_at)' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM demand_interests_assert_open(NEW.demand_id, NEW.user_id);
    IF cardinality(NEW.offer_types) <> (SELECT count(DISTINCT t) FROM unnest(NEW.offer_types) AS t) THEN
      RAISE EXCEPTION 'oferta repetida' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.connection_id IS NOT NULL OR NEW.withdrawn_at IS NOT NULL THEN
      RAISE EXCEPTION 'interesse nasce sem conexão e em aberto' USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.demand_id, NEW.user_id, NEW.user_name, NEW.user_avatar, NEW.user_category,
      NEW.profile_type, NEW.organization_id, NEW.kind, NEW.offer_types, NEW.message, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.demand_id, OLD.user_id, OLD.user_name, OLD.user_avatar, OLD.user_category,
      OLD.profile_type, OLD.organization_id, OLD.kind, OLD.offer_types, OLD.message, OLD.created_at) THEN
    RAISE EXCEPTION 'quem manifestou, a demanda, o tipo, a oferta e a mensagem não mudam'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'interesse retirado não muda' USING ERRCODE = 'check_violation';
  END IF;

  IF (NEW.connection_id, NEW.connection_status) IS DISTINCT FROM (OLD.connection_id, OLD.connection_status) THEN
    IF NEW.connection_status = 'pendente' THEN
      -- Novo pedido: primeiro, ou depois de recusado/cancelado, sempre com outra conexão.
      IF NOT (OLD.connection_status IS NULL OR OLD.connection_status IN ('recusada', 'cancelada'))
         OR NEW.connection_id IS NULL OR NEW.connection_id IS NOT DISTINCT FROM OLD.connection_id THEN
        RAISE EXCEPTION 'pedido de conexão não permitido a partir de %', coalesce(OLD.connection_status::text, 'sem conexão')
          USING ERRCODE = 'check_violation';
      END IF;
      PERFORM demand_interests_assert_open(NEW.demand_id, NULL);
      NEW.connection_requested_at := NOW();
      NEW.connection_answered_at := NULL;
    ELSIF NEW.connection_status IN ('aceita', 'recusada', 'cancelada') THEN
      IF OLD.connection_status IS DISTINCT FROM 'pendente' OR NEW.connection_id IS DISTINCT FROM OLD.connection_id THEN
        RAISE EXCEPTION 'resposta de conexão só para o pedido pendente' USING ERRCODE = 'check_violation';
      END IF;
      NEW.connection_requested_at := OLD.connection_requested_at;
      NEW.connection_answered_at := NOW();
    ELSE
      RAISE EXCEPTION 'a conexão não é desfeita' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF (NEW.connection_requested_at, NEW.connection_answered_at)
        IS DISTINCT FROM (OLD.connection_requested_at, OLD.connection_answered_at) THEN
    RAISE EXCEPTION 'datas da conexão mudam só com o estado' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.withdrawn_at IS NOT NULL THEN
    NEW.withdrawn_at := NOW();
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_interests_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'demand_interests não é apagada' USING ERRCODE = 'insufficient_privilege';
END
$$;

-- Linha do tempo. payload->'public' é o que a rota pública mostra: tipo,
-- categoria da conta e ofertas; nunca nome, id ou mensagem.
CREATE OR REPLACE FUNCTION demand_interests_record_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor_kind TEXT := CASE NEW.user_category WHEN 'comunidade' THEN 'comunidade'
                                            WHEN 'poder_publico' THEN 'poder_publico'
                                            ELSE 'parceiro' END;
  public_part JSONB := jsonb_build_object(
    'interestKind', NEW.kind, 'userCategory', NEW.user_category, 'offerTypes', to_jsonb(NEW.offer_types));
  base JSONB := jsonb_build_object('interest_id', NEW.id, 'kind', NEW.kind, 'connection_id', NEW.connection_id);
  author UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (NEW.demand_id, 'interesse_registrado', actor_kind, NEW.user_id::text,
            base || jsonb_build_object('offer_types', to_jsonb(NEW.offer_types), 'public', public_part),
            true, clock_timestamp());
    RETURN NULL;
  END IF;

  IF NEW.connection_status IS DISTINCT FROM OLD.connection_status
     OR NEW.connection_id IS DISTINCT FROM OLD.connection_id THEN
    IF NEW.connection_status = 'pendente' THEN
      INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
      VALUES (NEW.demand_id, 'conexao_solicitada', actor_kind, NEW.user_id::text,
              base || jsonb_build_object('public', public_part), true, clock_timestamp());
    ELSIF NEW.connection_status = 'aceita' THEN
      SELECT author_id INTO author FROM demands WHERE id = NEW.demand_id;
      INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
      VALUES (NEW.demand_id, 'conexao_aceita', 'agente', author::text,
              base || jsonb_build_object('public', public_part), true, clock_timestamp());
    ELSIF NEW.connection_status = 'recusada' THEN
      SELECT author_id INTO author FROM demands WHERE id = NEW.demand_id;
      INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
      VALUES (NEW.demand_id, 'conexao_recusada', 'agente', author::text, base, false, clock_timestamp());
    ELSE
      INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
      VALUES (NEW.demand_id, 'conexao_cancelada', actor_kind, NEW.user_id::text, base, false, clock_timestamp());
    END IF;
  END IF;

  IF NEW.withdrawn_at IS NOT NULL AND OLD.withdrawn_at IS NULL THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (NEW.demand_id, 'interesse_retirado', actor_kind, NEW.user_id::text,
            base || jsonb_build_object('public', public_part), true, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS demand_interests_guard ON demand_interests;
CREATE TRIGGER demand_interests_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_interests
  FOR EACH ROW EXECUTE FUNCTION demand_interests_guard();

DROP TRIGGER IF EXISTS demand_interests_block_truncate ON demand_interests;
CREATE TRIGGER demand_interests_block_truncate
  BEFORE TRUNCATE ON demand_interests
  FOR EACH STATEMENT EXECUTE FUNCTION demand_interests_no_truncate();

DROP TRIGGER IF EXISTS demand_interests_record_event ON demand_interests;
CREATE TRIGGER demand_interests_record_event
  AFTER INSERT OR UPDATE ON demand_interests
  FOR EACH ROW EXECUTE FUNCTION demand_interests_record_event();

-- Oportunidades de apoio: recorte por recurso necessário.
CREATE INDEX IF NOT EXISTS idx_demand_resources_needed
  ON demand_resources(resource_type, demand_id) WHERE kind = 'necessario';
