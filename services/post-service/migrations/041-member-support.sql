-- Migração 041: Membro da Comunidade registra apoio a demanda (T-04-01).
--
-- Fonte: dm-docs/fonte-da-verdade/DM_Conecta_Arquitetura_de_Perfis_e_Fluxo_do_Ecossistema.html (§3.2,
-- "Apoiar projetos"; §6 etapa 4, "a comunidade demonstra interesse e oferece
-- recursos, serviços, divulgação ou articulação"). Decisão 18
-- (decisoes-de-implementacao.md): o Membro apoia nas modalidades
-- `doar_recursos`, `apoiar_acao_ambiental` e `adotar_espaco_publico`;
-- patrocínio, financiamento e contratação ficam com Parceiro e Poder Público;
-- o Membro não entra em "Maiores patrocinadores"; voluntariado continua pelo
-- interesse da T15 (`demand_interests.kind = 'voluntariado'`).
--
-- O que muda em relação à 013:
-- - `supports.supporter_category` aceita `comunidade` no apoio de demanda
--   (CHECK `supports_demand_fields` refeito);
-- - CHECK novo `supports_member_modalities`: apoio de demanda da categoria
--   `comunidade` só nas três modalidades da decisão 18 e sem valor financeiro
--   nem voluntariado como "o que foi oferecido" (a rota diz o mesmo; o banco
--   é a última barreira);
-- - `supports_record_event` grava `apoio_declarado`/`apoio_cancelado` com o
--   ator `comunidade` (já aceito em `demand_events.actor_type` desde a 012).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro, e a
-- 013 é reaplicada antes desta sem recriar o CHECK, que já existe).

ALTER TABLE supports DROP CONSTRAINT IF EXISTS supports_demand_fields;
ALTER TABLE supports ADD CONSTRAINT supports_demand_fields CHECK (
  demand_id IS NULL
  OR (modality IS NOT NULL AND receipt_status IS NOT NULL
      AND description IS NOT NULL AND btrim(description) <> ''
      AND char_length(description) <= 2000
      AND supporter_category IN ('parceiro', 'poder_publico', 'comunidade'))
) NOT VALID;

-- Comparação por texto: a 038 acrescenta valores ao enum support_modality e
-- o arquivo inteiro pode rodar numa transação só.
ALTER TABLE supports DROP CONSTRAINT IF EXISTS supports_member_modalities;
ALTER TABLE supports ADD CONSTRAINT supports_member_modalities CHECK (
  demand_id IS NULL
  OR supporter_category IS DISTINCT FROM 'comunidade'
  OR (modality::text IN ('doar_recursos', 'apoiar_acao_ambiental', 'adotar_espaco_publico')
      AND type::text NOT IN ('financial', 'volunteering', 'sharing'))
) NOT VALID;

CREATE OR REPLACE FUNCTION supports_record_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor_kind TEXT;
  public_part JSONB;
  base JSONB;
  author UUID;
BEGIN
  IF NEW.demand_id IS NULL THEN RETURN NULL; END IF;
  actor_kind := CASE NEW.supporter_category
    WHEN 'poder_publico' THEN 'poder_publico'
    WHEN 'comunidade' THEN 'comunidade'
    ELSE 'parceiro' END;
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
