-- Migração 038: oferta de equipe e execução de etapa pelo Parceiro (T-05-15).
--
-- Fonte: dm-docs/fonte-da-verdade/DM_Conecta_Modelo_de_Conexao.html, §27 ("O
-- Parceiro ou Patrocinador poderá: … Financiar, Patrocinar, Doar materiais,
-- Fornecer equipamentos, Oferecer serviços, Disponibilizar equipe, Oferecer
-- conhecimento técnico, Executar determinada etapa, Estabelecer parceria.
-- Assim, o apoio não fica limitado ao dinheiro.") e §28 ("Parceiro C — Serviço
-- técnico"). O Processo de Conexão (026) já tem `equipe` e `execucao_de_etapa`
-- como contribuição; aqui o interesse (012) e o apoio (013) ganham o mesmo
-- vocabulário.
--
-- - `demand_interest_offer` ganha `materiais`, `equipamentos`, `equipe`,
--   `execucao_de_etapa`, `patrocinio` e `parceria` (as seis que faltavam do §27);
-- - `demand_interests.schedule_item_id`: a etapa do cronograma da própria
--   demanda (FK composta com `demand_id`), obrigatória quando a oferta tem
--   `execucao_de_etapa` e ausente fora dela; imutável;
-- - `support_modality` ganha `disponibilizar_equipe` e `executar_etapa`;
--   `supports.schedule_item_id` (mesma regra, com `executar_etapa`);
-- - a linha do tempo pública do interesse mostra a etapa (`scheduleStage` em
--   payload->'public'); a do apoio, pela 041 (que redefine
--   supports_record_event depois desta).
--
-- A etapa é só referenciada por id: nada muda no módulo de execução (014/034).
-- Comparações com os valores novos são por texto, porque o arquivo inteiro pode
-- rodar numa transação só (ADD VALUE não é usável antes do COMMIT).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

ALTER TYPE demand_interest_offer ADD VALUE IF NOT EXISTS 'materiais';
ALTER TYPE demand_interest_offer ADD VALUE IF NOT EXISTS 'equipamentos';
ALTER TYPE demand_interest_offer ADD VALUE IF NOT EXISTS 'equipe';
ALTER TYPE demand_interest_offer ADD VALUE IF NOT EXISTS 'execucao_de_etapa';
ALTER TYPE demand_interest_offer ADD VALUE IF NOT EXISTS 'patrocinio';
ALTER TYPE demand_interest_offer ADD VALUE IF NOT EXISTS 'parceria';

ALTER TYPE support_modality ADD VALUE IF NOT EXISTS 'disponibilizar_equipe';
ALTER TYPE support_modality ADD VALUE IF NOT EXISTS 'executar_etapa';

-- ── Interesse ──────────────────────────────────────────────────────────────
ALTER TABLE demand_interests ADD COLUMN IF NOT EXISTS schedule_item_id UUID;

DO $$ BEGIN
  ALTER TABLE demand_interests ADD CONSTRAINT demand_interests_schedule_item_fk
    FOREIGN KEY (demand_id, schedule_item_id) REFERENCES demand_schedule_items(demand_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Doze ofertas possíveis (antes, seis).
ALTER TABLE demand_interests DROP CONSTRAINT IF EXISTS demand_interests_offers;
ALTER TABLE demand_interests ADD CONSTRAINT demand_interests_offers CHECK (
  cardinality(offer_types) <= 12
  AND ((kind = 'apoio') = (cardinality(offer_types) >= 1))) NOT VALID;

DO $$ BEGIN
  ALTER TABLE demand_interests ADD CONSTRAINT demand_interests_schedule_item CHECK (
    ('execucao_de_etapa' = ANY (offer_types::text[])) = (schedule_item_id IS NOT NULL)
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_demand_interests_schedule_item
  ON demand_interests(schedule_item_id) WHERE schedule_item_id IS NOT NULL;

-- A etapa oferecida não muda (o guard da 012 cobre as demais colunas).
CREATE OR REPLACE FUNCTION demand_interests_schedule_item_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.schedule_item_id IS DISTINCT FROM OLD.schedule_item_id THEN
    RAISE EXCEPTION 'a etapa oferecida não muda' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS demand_interests_schedule_item_immutable ON demand_interests;
CREATE TRIGGER demand_interests_schedule_item_immutable
  BEFORE UPDATE OF schedule_item_id ON demand_interests
  FOR EACH ROW EXECUTE FUNCTION demand_interests_schedule_item_immutable();

-- Linha do tempo (012), agora com a etapa oferecida no payload público.
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
  IF NEW.schedule_item_id IS NOT NULL THEN
    public_part := public_part || jsonb_build_object(
      'scheduleItemId', NEW.schedule_item_id,
      'scheduleStage', (SELECT stage FROM demand_schedule_items WHERE id = NEW.schedule_item_id));
    base := base || jsonb_build_object('schedule_item_id', NEW.schedule_item_id);
  END IF;

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

-- ── Apoio ──────────────────────────────────────────────────────────────────
ALTER TABLE supports ADD COLUMN IF NOT EXISTS schedule_item_id UUID;

DO $$ BEGIN
  ALTER TABLE supports ADD CONSTRAINT supports_schedule_item_fk
    FOREIGN KEY (demand_id, schedule_item_id) REFERENCES demand_schedule_items(demand_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE supports ADD CONSTRAINT supports_schedule_item CHECK (
    demand_id IS NULL
    OR (modality::text = 'executar_etapa') = (schedule_item_id IS NOT NULL)
  ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION supports_schedule_item_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.schedule_item_id IS DISTINCT FROM OLD.schedule_item_id THEN
    RAISE EXCEPTION 'a etapa do apoio não muda' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS supports_schedule_item_immutable ON supports;
CREATE TRIGGER supports_schedule_item_immutable
  BEFORE UPDATE OF schedule_item_id ON supports
  FOR EACH ROW EXECUTE FUNCTION supports_schedule_item_immutable();
