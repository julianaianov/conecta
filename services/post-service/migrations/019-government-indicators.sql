-- Migração 019: área de governo e gestão pública — indicadores, priorização de
-- áreas, divulgação de ações e medição de impacto (T22).
--
-- Fonte: dm-docs/fonte-da-verdade/01-apresentacao-institucional.html,
-- slide 24 ("Área de governo e gestão pública": monitoramento em tempo real,
-- respostas oficiais, priorização de áreas, divulgação de ações, medição de
-- impacto) e 03-fluxo-cadastro-poder-publico.html, slide 14 (os 10 indicadores:
-- demandas recebidas, por território, por categoria, urgentes, encaminhadas,
-- em execução, concluídas, projetos apoiados, beneficiários alcançados e
-- resultados registrados).
--
-- Esta migração **não** cria tabela de agregação. O painel do órgão é lido por
-- consulta, com recorte (competência/território) e período, servida por estes
-- índices e por um cache curto no processo (src/government/cache.js): nenhuma
-- requisição varre tabela inteira e nada é pré-calculado em laço. O padrão
-- materializado da T21 (ranking_snapshots) continua valendo só para os
-- rankings públicos, que agregam a plataforma toda.
--
-- `government_actions` é a **divulgação de ações** do slide 24: o órgão publica
-- uma ação, programa, obra ou serviço ligado a uma demanda ou ao território. O
-- conteúdo em si é um post comum do feed (`posts.type = 'message'`, o tipo que
-- a T13 já usa para publicação do Poder Público); esta tabela é o vínculo
-- institucional (órgão, demanda, programa, período) que o feed não guarda.
-- Quando a ação é ligada a uma demanda, a rota grava junto uma resposta
-- institucional (T13) — é dela que sai a linha do tempo pública da demanda — e
-- o gatilho daqui grava também o evento `acao_institucional_divulgada`.
--
-- Nada aqui guarda dado pessoal de quem mora no território: a ação é
-- institucional e o autor gravado é a conta do representante, como nas demais
-- tabelas da T13.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- ── Divulgação de ações ─────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE government_action_kind AS ENUM (
    'acao', 'programa', 'servico', 'obra', 'evento_publico', 'edital'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS government_actions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Órgão (user_db.organizations.id, `poder_publico` `validada`; outra base,
  -- sem FK) e retrato da identificação pública na publicação.
  organization_id    UUID NOT NULL,
  organization_name  VARCHAR(255) NOT NULL CHECK (btrim(organization_name) <> ''),
  government_sphere  VARCHAR(20) CHECK (government_sphere IS NULL
                                        OR government_sphere IN ('municipal', 'estadual', 'federal')),
  department         VARCHAR(255),
  -- Publicação correspondente no feed (post_type `message`). Nunca é o
  -- post-vitrine de uma demanda: aquele tem `posts.demand_id` e é da demanda.
  post_id            UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE RESTRICT,
  -- Demanda relacionada (opcional: a ação pode ser só do território) e a
  -- resposta institucional (T13) gravada junto, que leva a ação à linha do tempo.
  demand_id          UUID REFERENCES demands(id) ON DELETE RESTRICT,
  response_id        UUID,
  kind               government_action_kind NOT NULL,
  title              VARCHAR(200) NOT NULL CHECK (btrim(title) <> ''),
  summary            TEXT NOT NULL CHECK (btrim(summary) <> '' AND char_length(summary) <= 5000),
  program_name       VARCHAR(255),
  program_url        VARCHAR(1000) CHECK (program_url IS NULL OR program_url ~ '^https://[^[:space:]]+$'),
  -- Recorte territorial declarado da ação (o painel agrupa por ele).
  territory          VARCHAR(255),
  municipality       VARCHAR(120),
  uf                 CHAR(2) CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  starts_on          DATE,
  ends_on            DATE,
  -- Representante que publicou (auth_db.users.id).
  author_id          UUID NOT NULL,
  author_name        VARCHAR(255),
  published_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT government_actions_period CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_government_actions_org
  ON government_actions(organization_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_government_actions_demand
  ON government_actions(demand_id, published_at DESC) WHERE demand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_government_actions_place
  ON government_actions(uf, municipality, published_at DESC);

-- O post da ação é do feed, não é vitrine de demanda, e a ação pertence ao
-- órgão que a publicou. A gestão (`gestao_app`) só lê. Depois de publicada, a
-- ação não troca de órgão, de post nem de demanda: correção é publicação nova.
CREATE OR REPLACE FUNCTION government_actions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  showcase UUID;
  st demand_status;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'government_actions é somente leitura para a gestão' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'divulgação de ação não é excluída' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.organization_id, NEW.post_id, NEW.demand_id, NEW.author_id, NEW.published_at)
       IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.post_id, OLD.demand_id, OLD.author_id, OLD.published_at) THEN
      RAISE EXCEPTION 'divulgação de ação: órgão, publicação, demanda e data não mudam'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  SELECT demand_id INTO showcase FROM posts WHERE id = NEW.post_id;
  IF showcase IS NOT NULL THEN
    RAISE EXCEPTION 'a divulgação de ação usa publicação própria do órgão, não o post-vitrine da demanda'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.demand_id IS NOT NULL THEN
    SELECT status INTO st FROM demands WHERE id = NEW.demand_id;
    IF st IS NULL OR st NOT IN ('publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao',
                                'concluida', 'prestacao_de_contas') THEN
      RAISE EXCEPTION 'a ação só se liga a demanda publicada' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- Linha do tempo pública da demanda (slide 15): a ação divulgada entra como
-- evento próprio, além da resposta institucional gravada pela rota.
CREATE OR REPLACE FUNCTION government_actions_record_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.demand_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
  VALUES (
    NEW.demand_id, 'acao_institucional_divulgada', 'poder_publico', NEW.author_id::text,
    jsonb_build_object(
      'action_id', NEW.id, 'organization_id', NEW.organization_id, 'post_id', NEW.post_id,
      'kind', NEW.kind,
      'public', jsonb_build_object(
        'organizationName', NEW.organization_name, 'actionKind', NEW.kind, 'actionTitle', NEW.title,
        'programName', NEW.program_name, 'postId', NEW.post_id, 'excerpt', left(NEW.summary, 280))),
    true, clock_timestamp());
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS government_actions_guard ON government_actions;
CREATE TRIGGER government_actions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON government_actions
  FOR EACH ROW EXECUTE FUNCTION government_actions_guard();

DROP TRIGGER IF EXISTS government_actions_record_event ON government_actions;
CREATE TRIGGER government_actions_record_event
  AFTER INSERT ON government_actions
  FOR EACH ROW EXECUTE FUNCTION government_actions_record_event();

-- ── Índices dos indicadores ─────────────────────────────────────────────────
-- Toda consulta do painel recorta por (status público × lugar × published_at)
-- ou pelo órgão. Sem estes índices, cada abertura do painel varreria `demands`.

CREATE INDEX IF NOT EXISTS idx_demands_indicators_place_published
  ON demands(uf, municipality, published_at)
  WHERE published_at IS NOT NULL
    AND status IN ('publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao',
                   'concluida', 'prestacao_de_contas');

CREATE INDEX IF NOT EXISTS idx_demands_indicators_published
  ON demands(published_at)
  WHERE published_at IS NOT NULL
    AND status IN ('publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao',
                   'concluida', 'prestacao_de_contas');

-- Recorte por competência: as demandas em que o órgão já atuou.
CREATE INDEX IF NOT EXISTS idx_institutional_tracks_org_received
  ON demand_institutional_tracks(organization_id, received_at);
CREATE INDEX IF NOT EXISTS idx_institutional_responses_org_created
  ON demand_institutional_responses(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_institutional_offers_org_created
  ON demand_institutional_offers(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_forwardings_origin_org
  ON demand_forwardings(organization_id, forwarded_at);
-- Marcas por demanda do recorte (encaminhou? já respondeu?), lidas por EXISTS.
CREATE INDEX IF NOT EXISTS idx_forwardings_demand_org
  ON demand_forwardings(demand_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_institutional_responses_demand_org
  ON demand_institutional_responses(demand_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_forwardings_destination_org
  ON demand_forwardings(destination_organization_id, forwarded_at)
  WHERE destination_organization_id IS NOT NULL;

-- Medição de impacto: prestação de contas concluída das demandas do recorte.
CREATE INDEX IF NOT EXISTS idx_demand_accountability_concluded
  ON demand_accountability(demand_id, concluded_at) WHERE status = 'concluida';
CREATE INDEX IF NOT EXISTS idx_demand_accountability_results_demand
  ON demand_accountability_results(demand_id);
