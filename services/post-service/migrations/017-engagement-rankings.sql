-- Migração 017: engajamento, rankings e selos de impacto social (T21).
--
-- Fonte: dm-docs/fonte-da-verdade/01-apresentacao-institucional.html —
-- slide 22 ("Engajamento e rankings": curtidas e comentários, compartilhamentos,
-- gamificação, selos de impacto social; rankings de usuários mais ativos,
-- maiores apoiadores, empresas em destaque, voluntários mais participativos,
-- maiores patrocinadores, bairros mais engajados e projetos mais apoiados) e
-- slide 13 ("Restrições e governança": o ranking prioriza o reconhecimento de
-- apoio e impacto; não incluir políticos ou órgãos públicos em ranking
-- competitivo de "melhores apoiadores", preservando a neutralidade
-- institucional; para o Poder Público valem indicadores de atuação, respostas,
-- encaminhamentos e resultados).
--
-- - `content_shares`: o compartilhamento registrado de um post do feed ou de
--   uma demanda. Só inserção (append-only), um registro por conteúdo × conta ×
--   dia, sempre de conta autenticada — não há registro anônimo, nem por IP.
--   Guarda o retrato do nome, avatar, papel e subperfil de quem compartilhou,
--   porque o post_db não conhece `profiles` (outra base). Os contadores
--   `posts.shares_count` e `demands.shares_count` são mantidos pelo trigger.
-- - `ranking_consents`: o consentimento explícito de aparecer **com o nome** nos
--   rankings públicos (LGPD). Sem ele, a conta continua sendo contada — os
--   números ficam honestos — mas a linha aparece sem nome, sem avatar e sem
--   link. Nos rankings de apoio vale também o `display_consent` do próprio
--   apoio (T16, migração 013).
-- - `ranking_snapshots` / `ranking_runs`: a agregação **materializada**. Nenhuma
--   requisição pública roda a agregação: o laço do serviço recalcula os 7
--   rankings × 3 períodos de uma vez e troca o conteúdo numa transação; a rota
--   lê só esta tabela, por índice.
-- - `profile_badges` / `profile_engagement`: os selos de impacto social e os
--   números do perfil, também materializados pelo mesmo laço. Selo é concedido
--   por regra objetiva sobre dado real (apoio confirmado, demanda concluída,
--   prestação de contas concluída, voluntariado com conexão aceita…); nada é
--   atribuído à mão e nada é fictício. `profile_engagement.metrics` guarda, para
--   o Poder Público, os **indicadores de atuação** do slide 13 — nunca pontos
--   nem posição.
--
-- Neutralidade: o Poder Público e os políticos (categoria `poder_publico`) ficam
-- fora de todos os rankings de pessoas; a agregação só admite conta com
-- categoria conhecida e diferente de `poder_publico` (falha fechada).
--
-- A gestão (`gestao_app`) só lê (grant no dm-infra,
-- db/migrations/gestao/016-gestao-app-post-engagement.sql).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- ── Compartilhamentos ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind   VARCHAR(10) NOT NULL CHECK (target_kind IN ('post', 'demand')),
  post_id       UUID REFERENCES posts(id) ON DELETE RESTRICT,
  demand_id     UUID REFERENCES demands(id) ON DELETE RESTRICT,
  -- Chave do alvo, para o índice de unicidade (um compartilhamento por dia).
  target_id     UUID GENERATED ALWAYS AS (COALESCE(post_id, demand_id)) STORED,
  user_id       UUID NOT NULL,
  -- Retrato da identidade (auth_db/user_db são outras bases): o ranking não
  -- consulta outro serviço para saber quem é quem.
  user_name     VARCHAR(255),
  user_avatar   VARCHAR(500),
  user_role     VARCHAR(20),
  profile_type  VARCHAR(50),
  channel       VARCHAR(20) NOT NULL DEFAULT 'outro'
                  CHECK (channel IN ('web_share', 'copiar_link', 'outro')),
  shared_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT content_shares_target CHECK (
    ((post_id IS NULL) <> (demand_id IS NULL))
    AND ((target_kind = 'post') = (post_id IS NOT NULL))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_shares_actor_day
  ON content_shares(target_id, user_id, shared_on);
CREATE INDEX IF NOT EXISTS idx_content_shares_user
  ON content_shares(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_content_shares_demand
  ON content_shares(demand_id, created_at) WHERE demand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_shares_post
  ON content_shares(post_id, created_at) WHERE post_id IS NOT NULL;

ALTER TABLE posts   ADD COLUMN IF NOT EXISTS shares_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS shares_count INTEGER NOT NULL DEFAULT 0;

-- O compartilhamento só existe em conteúdo público: post visível e demanda
-- publicada em diante (fora `arquivada`). Append-only; a gestão não escreve.
CREATE OR REPLACE FUNCTION content_shares_guard() RETURNS TRIGGER AS $$
DECLARE
  st demand_status;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os compartilhamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'o registro de compartilhamento não é alterado nem excluído'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.post_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM posts WHERE id = NEW.post_id AND visibility = 'visible') THEN
      RAISE EXCEPTION 'post indisponível para compartilhamento' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT status INTO st FROM demands WHERE id = NEW.demand_id;
    IF st IS NULL THEN
      RAISE EXCEPTION 'demanda inexistente' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF st IN ('em_analise', 'arquivada') THEN
      RAISE EXCEPTION 'demanda indisponível para compartilhamento (estado: %)', st
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.created_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_shares_guard ON content_shares;
CREATE TRIGGER content_shares_guard
  BEFORE INSERT OR UPDATE OR DELETE ON content_shares
  FOR EACH ROW EXECUTE FUNCTION content_shares_guard();

CREATE OR REPLACE FUNCTION content_shares_block_truncate() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'compartilhamentos não são apagados' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_shares_block_truncate ON content_shares;
CREATE TRIGGER content_shares_block_truncate
  BEFORE TRUNCATE ON content_shares
  FOR EACH STATEMENT EXECUTE FUNCTION content_shares_block_truncate();

-- Contador desnormalizado: a leitura pública do post e da demanda já traz o
-- número sem consultar `content_shares`.
CREATE OR REPLACE FUNCTION content_shares_count() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.post_id IS NOT NULL THEN
    UPDATE posts SET shares_count = shares_count + 1 WHERE id = NEW.post_id;
  ELSE
    UPDATE demands SET shares_count = shares_count + 1 WHERE id = NEW.demand_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_shares_count ON content_shares;
CREATE TRIGGER content_shares_count
  AFTER INSERT ON content_shares
  FOR EACH ROW EXECUTE FUNCTION content_shares_count();

-- ── Consentimento de exibição do nome (LGPD) ────────────────────────────────

CREATE TABLE IF NOT EXISTS ranking_consents (
  user_id     UUID PRIMARY KEY,
  consent     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION ranking_consents_guard() RETURNS TRIGGER AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê o consentimento de ranking' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'o consentimento é revogado com consent = false, não excluído'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ranking_consents_guard ON ranking_consents;
CREATE TRIGGER ranking_consents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON ranking_consents
  FOR EACH ROW EXECUTE FUNCTION ranking_consents_guard();

-- ── Agregação materializada ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ranking_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  entries      INTEGER NOT NULL DEFAULT 0,
  badges       INTEGER NOT NULL DEFAULT 0,
  duration_ms  INTEGER,
  error        TEXT
);

CREATE TABLE IF NOT EXISTS ranking_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board         VARCHAR(40) NOT NULL,
  period        VARCHAR(10) NOT NULL CHECK (period IN ('mes', 'ano', 'sempre')),
  position      INTEGER NOT NULL CHECK (position > 0),
  tied          BOOLEAN NOT NULL DEFAULT false,
  subject_kind  VARCHAR(12) NOT NULL CHECK (subject_kind IN ('usuario', 'bairro', 'demanda')),
  subject_id    VARCHAR(200) NOT NULL,
  -- `identified` = há consentimento para exibir o nome. Sem ele, a linha não
  -- guarda nome nem avatar (o CHECK impede).
  identified    BOOLEAN NOT NULL DEFAULT false,
  display_name  VARCHAR(200),
  avatar_url    VARCHAR(500),
  category      VARCHAR(60),
  profile_type  VARCHAR(50),
  place         VARCHAR(200),
  points        BIGINT NOT NULL CHECK (points >= 0),
  metrics       JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ranking_snapshots_identity CHECK (
    identified OR (display_name IS NULL AND avatar_url IS NULL)
  ),
  CONSTRAINT ranking_snapshots_unique UNIQUE (board, period, subject_id)
);

ALTER TABLE ranking_snapshots ALTER COLUMN category TYPE VARCHAR(60);

CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_board
  ON ranking_snapshots(board, period, position);

-- ── Selos de impacto e números do perfil ────────────────────────────────────

CREATE TABLE IF NOT EXISTS profile_badges (
  user_id         UUID NOT NULL,
  badge           VARCHAR(48) NOT NULL,
  awarded_at      TIMESTAMPTZ NOT NULL,
  evidence_count  INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge)
);

CREATE TABLE IF NOT EXISTS profile_engagement (
  user_id      UUID PRIMARY KEY,
  category     VARCHAR(60),
  metrics      JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profile_engagement ALTER COLUMN category TYPE VARCHAR(60);

-- ── Índices da agregação ────────────────────────────────────────────────────
-- O laço roda poucas vezes por hora, mas sem estes índices cada passada varre
-- as tabelas inteiras.

CREATE INDEX IF NOT EXISTS idx_supports_ranking
  ON supports(user_id, created_at)
  WHERE canceled_at IS NULL AND status <> 'rejected';
CREATE INDEX IF NOT EXISTS idx_supports_demand_ranking
  ON supports(demand_id, created_at)
  WHERE demand_id IS NOT NULL AND canceled_at IS NULL AND status <> 'rejected';
CREATE INDEX IF NOT EXISTS idx_demand_interests_ranking
  ON demand_interests(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_demand_interests_demand_ranking
  ON demand_interests(demand_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reactions_user_created
  ON reactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_author_created
  ON comments(author_id, created_at);
CREATE INDEX IF NOT EXISTS idx_demands_author_published
  ON demands(author_id, published_at)
  WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_demands_district_published
  ON demands(uf, municipality, district, published_at)
  WHERE published_at IS NOT NULL AND district IS NOT NULL;
