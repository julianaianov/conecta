-- Migração 052: registro de Entregas da execução e entrega obrigatória na
-- conclusão da prestação de contas.
--
-- Fonte: dm-docs/fonte-da-verdade/05 (Modelo de Conexão) - §22 "O encerramento
-- deve reunir: Entregas, Resultados, Indicadores, Evidências, Documentos,
-- Relatórios, Fotos, Vídeos, Informações financeiras, quando aplicável, Data de
-- conclusão, Responsáveis, Registro final"; §23 (Caso 1, passo "Entrega", entre
-- o registro fotográfico e o resultado) e §30 (camada 5, Resultados: "Entregas,
-- Indicadores, Fotos, Vídeos, Relatórios, Resultados, Encerramento").
--
-- - `demand_deliveries`: o que foi entregue (item), quando, a quem (recebedor) e
--   com que evidência (a foto ou o vídeo da migração 014, opcional), por etapa
--   do cronograma (opcional). Só inserção, como o resto da execução: nada é
--   editado nem excluído (registre outra entrega). Vale do início da execução em
--   diante e sempre pelo Agente autor (`demand_execution_assert_open`, da 014).
--   O nome de quem recebeu é privado por padrão (pode ser pessoa física):
--   `recipient_public` é a escolha do Agente de mostrá-lo na página pública e na
--   versão pública do dossiê. Linha do tempo pública `entrega_registrada`.
-- - A prestação de contas só conclui com ao menos uma entrega registrada
--   (`demand_accountability_require_deliveries`): é um gatilho próprio, para não
--   reescrever o `demand_accountability_guard` da 015. A prestação já concluída
--   não é revalidada (o gatilho só olha a transição para `concluida`).
--
-- A gestão só lê (grant no dm-infra: SELECT em `demand_deliveries`).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

CREATE TABLE IF NOT EXISTS demand_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id        UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  -- Etapa do cronograma a que a entrega se refere (opcional).
  schedule_item_id UUID,
  -- Foto ou vídeo da execução que comprova a entrega (opcional).
  evidence_id      UUID,
  item             VARCHAR(200) NOT NULL CHECK (btrim(item) <> ''),
  description      TEXT CHECK (description IS NULL
                               OR (btrim(description) <> '' AND char_length(description) <= 2000)),
  delivered_on     DATE NOT NULL,
  -- Quem recebeu (pessoa ou instituição). Privado, salvo `recipient_public`.
  recipient        VARCHAR(200) NOT NULL CHECK (btrim(recipient) <> ''),
  recipient_public BOOLEAN NOT NULL DEFAULT FALSE,
  author_id        UUID NOT NULL,
  author_name      VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_deliveries_demand_id UNIQUE (demand_id, id),
  CONSTRAINT demand_deliveries_schedule FOREIGN KEY (demand_id, schedule_item_id)
    REFERENCES demand_schedule_items(demand_id, id) ON DELETE RESTRICT,
  CONSTRAINT demand_deliveries_evidence FOREIGN KEY (demand_id, evidence_id)
    REFERENCES demand_evidences(demand_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_demand_deliveries_demand
  ON demand_deliveries(demand_id, delivered_on, created_at);

CREATE OR REPLACE FUNCTION demand_deliveries_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê as entregas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a entrega registrada não muda nem é excluída (registre outra entrega)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM demand_execution_assert_open(NEW.demand_id, NEW.author_id, true);
  NEW.created_at := NOW();
  RETURN NEW;
END
$$;

-- Linha do tempo pública: o recebedor só sai quando o Agente autorizou.
CREATE OR REPLACE FUNCTION demand_deliveries_record_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  stage_name TEXT;
BEGIN
  SELECT stage INTO stage_name FROM demand_schedule_items WHERE id = NEW.schedule_item_id;
  INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
  VALUES (NEW.demand_id, 'entrega_registrada', 'agente', NEW.author_id::text,
          jsonb_build_object('delivery_id', NEW.id, 'public', jsonb_strip_nulls(jsonb_build_object(
            'item', NEW.item, 'deliveredOn', NEW.delivered_on, 'stage', stage_name,
            'recipient', CASE WHEN NEW.recipient_public THEN NEW.recipient END))),
          true, clock_timestamp());
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION demand_deliveries_record_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS demand_deliveries_guard ON demand_deliveries;
CREATE TRIGGER demand_deliveries_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_deliveries
  FOR EACH ROW EXECUTE FUNCTION demand_deliveries_guard();

DROP TRIGGER IF EXISTS demand_deliveries_block_truncate ON demand_deliveries;
CREATE TRIGGER demand_deliveries_block_truncate
  BEFORE TRUNCATE ON demand_deliveries
  FOR EACH STATEMENT EXECUTE FUNCTION demand_execution_no_truncate();

DROP TRIGGER IF EXISTS demand_deliveries_record_event ON demand_deliveries;
CREATE TRIGGER demand_deliveries_record_event
  AFTER INSERT ON demand_deliveries
  FOR EACH ROW EXECUTE FUNCTION demand_deliveries_record_event();

-- ── Conclusão da prestação de contas: ao menos uma entrega registrada ────────
CREATE OR REPLACE FUNCTION demand_accountability_require_deliveries() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'concluida' AND OLD.status IS DISTINCT FROM 'concluida'
     AND NOT EXISTS (SELECT 1 FROM demand_deliveries WHERE demand_id = NEW.demand_id) THEN
    RAISE EXCEPTION 'a prestação de contas exige ao menos uma entrega registrada (aba Execução)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS demand_accountability_require_deliveries ON demand_accountability;
CREATE TRIGGER demand_accountability_require_deliveries
  BEFORE UPDATE ON demand_accountability
  FOR EACH ROW EXECUTE FUNCTION demand_accountability_require_deliveries();
