-- Migração 025: pautas da Comunicação e divulgação registrada (T28).
--
-- Fonte: dm-docs/fonte-da-verdade/DM_Conecta_Arquitetura_de_Perfis_e_Fluxo_do_Ecossistema.html,
-- §3.5 (Comunicação — Amplificação: "Identificar pautas", "Compartilhar
-- iniciativas", "Divulgar projetos e resultados") e §6, etapa 6
-- ("AMPLIFICAÇÃO — A Comunicação pode dar visibilidade a demandas, projetos e
-- resultados"). Até aqui a Comunicação só compartilhava (T21); a pauta e a
-- divulgação publicada não existiam.
--
-- Decisões:
-- - `media_agenda_items` é a pauta: uma conta da Comunicação marca uma demanda
--   ou um evento público como pauta, com o ângulo (enfoque) e o estado da
--   apuração: `identificada` → `em_apuracao` → `publicada` | `descartada`.
--   Uma pauta por (conta, alvo).
-- - `publicada` exige veículo, URL (https) e data da divulgação: é o registro
--   verificável da amplificação (Apresentação, slide 25: só dado verificável).
--   De `publicada` não se volta; a pauta nunca é excluída.
-- - Ao ser publicada, a pauta de uma demanda grava `divulgacao_registrada` em
--   `demand_events` (público, ator `comunicacao`), com veículo, URL e data —
--   nunca o nome nem o id da conta. A linha do tempo pública e a seção
--   "Divulgação" da demanda leem daí e de `media_agenda_items`.
-- - Sem FK para o alvo: a pauta é registro de divulgação e sobrevive ao alvo.
-- - A gestão só lê (grant SELECT no dm-infra,
--   db/migrations/gestao/024-gestao-app-post-media.sql).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- Linha do tempo: a Comunicação passa a ser ator (como a 012 fez para
-- parceiro/comunidade).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'demand_events'::regclass AND conname = 'demand_events_actor_type_check'
                AND pg_get_constraintdef(oid) NOT LIKE '%comunicacao%') THEN
    ALTER TABLE demand_events DROP CONSTRAINT demand_events_actor_type_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_events'::regclass AND conname = 'demand_events_actor_type_check') THEN
    ALTER TABLE demand_events ADD CONSTRAINT demand_events_actor_type_check
      CHECK (actor_type IN ('agente', 'gestao', 'sistema', 'poder_publico', 'parceiro', 'comunidade', 'comunicacao'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS media_agenda_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Conta da Comunicação (auth_db.users.id) e retrato do perfil no momento.
  user_id        UUID NOT NULL,
  user_name      VARCHAR(255),
  user_category  VARCHAR(20) NOT NULL CHECK (user_category = 'comunicacao'),
  profile_type   VARCHAR(50),
  -- Alvo da pauta (sem FK: a pauta sobrevive ao alvo) e retrato do título.
  target_kind    VARCHAR(20) NOT NULL CHECK (target_kind IN ('demanda', 'evento')),
  target_id      UUID NOT NULL,
  target_title   VARCHAR(255),
  -- Ângulo/enfoque da pauta.
  angle          TEXT CHECK (angle IS NULL OR (btrim(angle) <> '' AND char_length(angle) <= 1000)),
  status         VARCHAR(20) NOT NULL DEFAULT 'identificada'
                   CHECK (status IN ('identificada', 'em_apuracao', 'publicada', 'descartada')),
  -- Divulgação publicada: veículo, endereço e data (obrigatórios em `publicada`).
  outlet_name    VARCHAR(200) CHECK (outlet_name IS NULL OR btrim(outlet_name) <> ''),
  published_url  VARCHAR(500) CHECK (published_url IS NULL OR published_url ~ '^https://'),
  published_on   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_agenda_items_unique_target UNIQUE (user_id, target_kind, target_id),
  CONSTRAINT media_agenda_items_published CHECK (
    status <> 'publicada' OR (outlet_name IS NOT NULL AND published_url IS NOT NULL AND published_on IS NOT NULL)
  )
);

-- "Minhas pautas" (por conta, mais recente primeiro) e a cobertura pública por alvo.
CREATE INDEX IF NOT EXISTS idx_media_agenda_items_user ON media_agenda_items(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_agenda_items_coverage
  ON media_agenda_items(target_kind, target_id, published_on DESC) WHERE status = 'publicada';

-- Guarda: gestão só lê; nada é excluído; identidade e alvo imutáveis;
-- `publicada` é final.
CREATE OR REPLACE FUNCTION media_agenda_items_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  is_gestao BOOLEAN := session_user = 'gestao_app';
BEGIN
  IF is_gestao THEN
    RAISE EXCEPTION 'a gestão só lê as pautas da Comunicação' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pauta não é excluída' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.target_kind <> OLD.target_kind
       OR NEW.target_id <> OLD.target_id OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'conta e alvo da pauta são imutáveis' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status = 'publicada' AND (NEW.status <> 'publicada' OR NEW.outlet_name IS DISTINCT FROM OLD.outlet_name
       OR NEW.published_url IS DISTINCT FROM OLD.published_url OR NEW.published_on IS DISTINCT FROM OLD.published_on) THEN
      RAISE EXCEPTION 'divulgação publicada não muda' USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS media_agenda_items_guard ON media_agenda_items;
CREATE TRIGGER media_agenda_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON media_agenda_items
  FOR EACH ROW EXECUTE FUNCTION media_agenda_items_guard();

CREATE OR REPLACE FUNCTION media_agenda_items_block_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pautas não são truncadas' USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS media_agenda_items_block_truncate ON media_agenda_items;
CREATE TRIGGER media_agenda_items_block_truncate
  BEFORE TRUNCATE ON media_agenda_items
  FOR EACH STATEMENT EXECUTE FUNCTION media_agenda_items_block_truncate();

-- Linha do tempo pública da demanda: a divulgação publicada vira evento
-- `divulgacao_registrada` (ator `comunicacao`), sem nome nem id da conta.
CREATE OR REPLACE FUNCTION media_agenda_record_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.target_kind <> 'demanda' OR NEW.status <> 'publicada' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'publicada' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM demands WHERE id = NEW.target_id AND status <> 'arquivada' AND published_at IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
  VALUES (NEW.target_id, 'divulgacao_registrada', 'comunicacao', NEW.user_id::text,
          jsonb_build_object('agenda_item_id', NEW.id,
                             'public', jsonb_build_object(
                               'outletName', NEW.outlet_name,
                               'publishedUrl', NEW.published_url,
                               'publishedOn', to_char(NEW.published_on, 'YYYY-MM-DD'),
                               'profileType', NEW.profile_type)),
          true, clock_timestamp());
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS media_agenda_record_event ON media_agenda_items;
CREATE TRIGGER media_agenda_record_event
  AFTER INSERT OR UPDATE ON media_agenda_items
  FOR EACH ROW EXECUTE FUNCTION media_agenda_record_event();
