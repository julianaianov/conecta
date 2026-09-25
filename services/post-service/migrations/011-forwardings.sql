-- Migração 011: encaminhamentos da demanda entre órgãos e setores (T14).
--
-- Fonte: dm-docs/fonte-da-verdade/03-fluxo-cadastro-poder-publico.html,
-- etapa 06 (slide 11, "Encaminhamento"): quando a demanda não estiver sob
-- responsabilidade do órgão que a recebeu, o Poder Público a encaminha ao setor
-- ou órgão competente, e a plataforma registra órgão responsável, setor de
-- destino, data do encaminhamento, responsável pelo encaminhamento, status,
-- providências realizadas e atualizações posteriores — o histórico de
-- tramitação. Etapa 08 (slide 15): encaminhamentos entram na linha do tempo.
-- Contrato com o dm-gestao: dm-docs/gestao/04-modelagem-de-dados.md §3.9.
--
-- - `demand_forwardings`: um encaminhamento parte do acompanhamento do órgão
--   de origem (FK composta (track_id, demand_id, organization_id) para
--   demand_institutional_tracks) e vai para
--     (a) `orgao_plataforma`: outro órgão do Poder Público validado na
--         plataforma; o acompanhamento dele é aberto como `recebida` na mesma
--         transação (FK composta destination_track_id) e ele vê o encaminhamento
--         na caixa "Encaminhadas a nós";
--     (b) `setor_interno`: setor do próprio órgão (texto);
--     (c) `orgao_externo`: órgão fora da plataforma (texto).
--   Status: enviado → recebido → aceito, ou devolvido (com motivo). Quem muda o
--   status é o destinatário em (a) e o próprio órgão de origem em (b) e (c),
--   registrando a resposta recebida fora da plataforma.
-- - `demand_forwarding_updates`: providências realizadas e atualizações
--   posteriores, só inserção, dos dois órgãos envolvidos; as mudanças de status
--   entram aqui também (kind `status`, gravadas pelo trigger).
-- - Linha do tempo pública: `demanda_encaminhada`,
--   `encaminhamento_status_alterado` e `encaminhamento_atualizado` em
--   demand_events (actor_type `poder_publico`), com o que é público em
--   payload->'public': órgãos, setor, status, trecho do texto. Nunca o
--   responsável pelo encaminhamento nem o representante.
-- - A gestão só lê (grant SELECT no dm-infra, db/migrations/gestao/010); os
--   triggers recusam qualquer escrita da sessão gestao_app. Nada é excluído.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

DO $$ BEGIN
  CREATE TYPE forwarding_destination_kind AS ENUM ('orgao_plataforma', 'setor_interno', 'orgao_externo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE forwarding_status AS ENUM ('enviado', 'recebido', 'aceito', 'devolvido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE forwarding_update_kind AS ENUM ('providencia', 'atualizacao', 'status');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Prazo do encaminhamento (Modelo de Conexão §13, `due_on`): migração 028.
CREATE TABLE IF NOT EXISTS demand_forwardings (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Acompanhamento do órgão de origem (quem encaminha).
  track_id                        UUID NOT NULL,
  demand_id                       UUID NOT NULL,
  organization_id                 UUID NOT NULL,
  origin_organization_name        VARCHAR(255) NOT NULL,
  destination_kind                forwarding_destination_kind NOT NULL,
  -- (a) órgão validado na plataforma e o acompanhamento aberto para ele.
  destination_organization_id     UUID,
  destination_track_id            UUID,
  -- Órgão responsável (retrato do órgão da plataforma, o próprio órgão no setor
  -- interno ou o nome informado do órgão externo) e setor de destino.
  destination_organization_name   VARCHAR(255) NOT NULL CHECK (btrim(destination_organization_name) <> ''),
  destination_sector              VARCHAR(255),
  destination_sphere              VARCHAR(20) CHECK (destination_sphere IS NULL OR destination_sphere IN ('municipal', 'estadual', 'federal')),
  destination_municipality        VARCHAR(120),
  destination_uf                  CHAR(2) CHECK (destination_uf IS NULL OR destination_uf ~ '^[A-Z]{2}$'),
  -- Motivo e providências do encaminhamento (público).
  reason                          TEXT NOT NULL CHECK (btrim(reason) <> '' AND char_length(reason) <= 3000),
  -- Responsável pelo encaminhamento: a conta (auth_db.users.id) e o nome/cargo
  -- informados. Privado: só os dois órgãos envolvidos e a gestão veem.
  forwarded_by                    UUID NOT NULL,
  forwarded_by_name               VARCHAR(255),
  responsible_name                VARCHAR(255),
  responsible_role                VARCHAR(255),
  status                          forwarding_status NOT NULL DEFAULT 'enviado',
  -- Nota pública da última mudança (motivo obrigatório na devolução), quem
  -- mudou (conta e órgão) e datas de cada etapa.
  status_note                     TEXT CHECK (status_note IS NULL OR char_length(status_note) <= 2000),
  status_changed_by               UUID,
  status_changed_by_organization  UUID,
  status_changed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  forwarded_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at                     TIMESTAMPTZ,
  accepted_at                     TIMESTAMPTZ,
  returned_at                     TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_forwardings_origin FOREIGN KEY (track_id, demand_id, organization_id)
    REFERENCES demand_institutional_tracks(id, demand_id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT demand_forwardings_destination_track FOREIGN KEY (destination_track_id, demand_id, destination_organization_id)
    REFERENCES demand_institutional_tracks(id, demand_id, organization_id) ON DELETE RESTRICT,
  -- Alvo da FK composta das atualizações.
  CONSTRAINT demand_forwardings_ref UNIQUE (id, demand_id),
  CONSTRAINT demand_forwardings_destination CHECK (CASE destination_kind
    WHEN 'orgao_plataforma' THEN destination_organization_id IS NOT NULL AND destination_track_id IS NOT NULL
                                 AND destination_organization_id <> organization_id
    WHEN 'setor_interno' THEN destination_organization_id IS NULL AND destination_track_id IS NULL
                              AND coalesce(btrim(destination_sector), '') <> ''
    ELSE destination_organization_id IS NULL AND destination_track_id IS NULL
  END),
  CONSTRAINT demand_forwardings_returned_note CHECK (status <> 'devolvido' OR coalesce(btrim(status_note), '') <> '')
);

-- Um encaminhamento em aberto por (demanda, origem, órgão de destino da plataforma).
CREATE UNIQUE INDEX IF NOT EXISTS uq_demand_forwardings_open_destination
  ON demand_forwardings(demand_id, organization_id, destination_organization_id)
  WHERE destination_kind = 'orgao_plataforma' AND status IN ('enviado', 'recebido', 'aceito');
CREATE INDEX IF NOT EXISTS idx_demand_forwardings_demand
  ON demand_forwardings(demand_id, forwarded_at);
CREATE INDEX IF NOT EXISTS idx_demand_forwardings_origin
  ON demand_forwardings(organization_id, status, forwarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_forwardings_destination
  ON demand_forwardings(destination_organization_id, status, forwarded_at DESC)
  WHERE destination_organization_id IS NOT NULL;

-- Mensagens com cargo, instituição, destinatário e anexos entre o Agente e os
-- conectados (Modelo de Conexão §12) são a comunicação do Processo de Conexão:
-- connection_process_messages (migração 027, T-05-02).
CREATE TABLE IF NOT EXISTS demand_forwarding_updates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forwarding_id      UUID NOT NULL,
  demand_id          UUID NOT NULL,
  -- Órgão autor (origem ou destino do encaminhamento) e o lado dele, gravados
  -- pelo trigger a partir do encaminhamento.
  organization_id    UUID NOT NULL,
  organization_name  VARCHAR(255) NOT NULL,
  side               VARCHAR(10) NOT NULL CHECK (side IN ('origem', 'destino')),
  kind               forwarding_update_kind NOT NULL,
  body               TEXT CHECK (body IS NULL OR (btrim(body) <> '' AND char_length(body) <= 3000)),
  -- Só em kind `status`.
  from_status        forwarding_status,
  to_status          forwarding_status,
  -- Representante que registrou (auth_db.users.id). Privado.
  author_id          UUID NOT NULL,
  author_name        VARCHAR(255),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_forwarding_updates_forwarding FOREIGN KEY (forwarding_id, demand_id)
    REFERENCES demand_forwardings(id, demand_id) ON DELETE RESTRICT,
  CONSTRAINT demand_forwarding_updates_status CHECK ((kind = 'status') = (to_status IS NOT NULL)),
  CONSTRAINT demand_forwarding_updates_body CHECK (kind = 'status' OR body IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_demand_forwarding_updates_forwarding
  ON demand_forwarding_updates(forwarding_id, created_at);
CREATE INDEX IF NOT EXISTS idx_demand_forwarding_updates_demand
  ON demand_forwarding_updates(demand_id, created_at);

-- ---------------------------------------------------------------------------
-- Transições do status do encaminhamento (espelha FORWARDING_TRANSITIONS em
-- src/institutional/forwardings.js). Aceito e devolvido são finais.
CREATE OR REPLACE FUNCTION forwarding_status_transition_allowed(
  from_status forwarding_status, to_status forwarding_status
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE from_status
    WHEN 'enviado' THEN to_status IN ('recebido', 'aceito', 'devolvido')
    WHEN 'recebido' THEN to_status IN ('aceito', 'devolvido')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION forwardings_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  origin RECORD;
  destination RECORD;
  status_owner UUID;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os encaminhamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'encaminhamentos não são excluídos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM institutional_assert_demand_open(NEW.demand_id);

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'enviado' OR NEW.status_note IS NOT NULL THEN
      RAISE EXCEPTION 'encaminhamento nasce enviado (recebido: %)', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    SELECT organization_name INTO origin FROM demand_institutional_tracks
     WHERE id = NEW.track_id AND demand_id = NEW.demand_id AND organization_id = NEW.organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'acompanhamento institucional inexistente' USING ERRCODE = 'foreign_key_violation';
    END IF;
    NEW.origin_organization_name := origin.organization_name;
    IF NEW.destination_kind = 'orgao_plataforma' THEN
      -- Retrato do órgão de destino = o do acompanhamento aberto para ele.
      SELECT organization_name, government_sphere, municipality, uf INTO destination
        FROM demand_institutional_tracks
       WHERE id = NEW.destination_track_id AND demand_id = NEW.demand_id
         AND organization_id = NEW.destination_organization_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'acompanhamento do órgão de destino inexistente' USING ERRCODE = 'foreign_key_violation';
      END IF;
      NEW.destination_organization_name := destination.organization_name;
      NEW.destination_sphere := destination.government_sphere;
      NEW.destination_municipality := destination.municipality;
      NEW.destination_uf := destination.uf;
    ELSIF NEW.destination_kind = 'setor_interno' THEN
      NEW.destination_organization_name := origin.organization_name;
      NEW.destination_sphere := NULL;
      NEW.destination_municipality := NULL;
      NEW.destination_uf := NULL;
    END IF;
    NEW.forwarded_at := NOW();
    NEW.status_changed_at := NOW();
    NEW.status_changed_by := NEW.forwarded_by;
    NEW.status_changed_by_organization := NEW.organization_id;
    NEW.received_at := NULL;
    NEW.accepted_at := NULL;
    NEW.returned_at := NULL;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.track_id, NEW.demand_id, NEW.organization_id, NEW.origin_organization_name,
      NEW.destination_kind, NEW.destination_organization_id, NEW.destination_track_id,
      NEW.destination_organization_name, NEW.destination_sector, NEW.destination_sphere,
      NEW.destination_municipality, NEW.destination_uf, NEW.reason, NEW.forwarded_by,
      NEW.forwarded_by_name, NEW.responsible_name, NEW.responsible_role, NEW.forwarded_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.track_id, OLD.demand_id, OLD.organization_id, OLD.origin_organization_name,
      OLD.destination_kind, OLD.destination_organization_id, OLD.destination_track_id,
      OLD.destination_organization_name, OLD.destination_sector, OLD.destination_sphere,
      OLD.destination_municipality, OLD.destination_uf, OLD.reason, OLD.forwarded_by,
      OLD.forwarded_by_name, OLD.responsible_name, OLD.responsible_role, OLD.forwarded_at, OLD.created_at) THEN
    RAISE EXCEPTION 'origem, destino e registro do encaminhamento não mudam' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT forwarding_status_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'transição do encaminhamento não permitida: % → %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'devolvido' AND coalesce(btrim(NEW.status_note), '') = '' THEN
      RAISE EXCEPTION 'motivo da devolução é obrigatório' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status_changed_by IS NULL THEN
      RAISE EXCEPTION 'status_changed_by é obrigatório na mudança de status' USING ERRCODE = 'check_violation';
    END IF;
    -- Na plataforma responde o órgão de destino; fora dela, a origem registra.
    status_owner := CASE WHEN NEW.destination_kind = 'orgao_plataforma'
                         THEN NEW.destination_organization_id ELSE NEW.organization_id END;
    IF NEW.status_changed_by_organization IS DISTINCT FROM status_owner THEN
      RAISE EXCEPTION 'órgão sem permissão para mudar o status deste encaminhamento'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.status_changed_at := NOW();
    IF NEW.status = 'recebido' THEN NEW.received_at := NOW(); END IF;
    IF NEW.status = 'aceito' THEN
      NEW.accepted_at := NOW();
      NEW.received_at := coalesce(OLD.received_at, NOW());
    END IF;
    IF NEW.status = 'devolvido' THEN NEW.returned_at := NOW(); END IF;
  ELSIF (NEW.status_note, NEW.status_changed_by, NEW.status_changed_by_organization, NEW.status_changed_at,
         NEW.received_at, NEW.accepted_at, NEW.returned_at)
        IS DISTINCT FROM (OLD.status_note, OLD.status_changed_by, OLD.status_changed_by_organization,
                          OLD.status_changed_at, OLD.received_at, OLD.accepted_at, OLD.returned_at) THEN
    RAISE EXCEPTION 'nota, autor e datas do status mudam só junto de uma transição' USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

-- Linha do tempo pública e histórico de tramitação. payload->'public' é o que
-- a página pública mostra (órgãos, setor, status, trecho); nunca o
-- responsável, o representante ou ids.
CREATE OR REPLACE FUNCTION forwardings_record_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor_org_name VARCHAR(255);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, 'demanda_encaminhada', 'poder_publico', NEW.forwarded_by::text,
      jsonb_build_object(
        'forwarding_id', NEW.id, 'track_id', NEW.track_id, 'organization_id', NEW.organization_id,
        'destination_organization_id', NEW.destination_organization_id,
        'destination_track_id', NEW.destination_track_id,
        'public', jsonb_build_object(
          'organizationName', NEW.origin_organization_name, 'destinationKind', NEW.destination_kind,
          'destinationOrganizationName', NEW.destination_organization_name,
          'destinationSector', NEW.destination_sector, 'forwardingStatus', NEW.status,
          'excerpt', left(NEW.reason, 280))),
      true, clock_timestamp());
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    actor_org_name := CASE WHEN NEW.destination_kind = 'orgao_plataforma'
                           THEN NEW.destination_organization_name ELSE NEW.origin_organization_name END;
    INSERT INTO demand_forwarding_updates
      (forwarding_id, demand_id, organization_id, organization_name, side, kind, body, from_status, to_status,
       author_id, author_name)
    VALUES (
      NEW.id, NEW.demand_id, NEW.status_changed_by_organization, actor_org_name,
      CASE WHEN NEW.destination_kind = 'orgao_plataforma' THEN 'destino' ELSE 'origem' END,
      'status', nullif(btrim(coalesce(NEW.status_note, '')), ''), OLD.status, NEW.status,
      NEW.status_changed_by, nullif(current_setting('dm.actor_name', true), ''));
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, note, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, 'encaminhamento_status_alterado', 'poder_publico', NEW.status_changed_by::text,
      NEW.status_note,
      jsonb_build_object(
        'forwarding_id', NEW.id, 'organization_id', NEW.status_changed_by_organization,
        'from_forwarding_status', OLD.status, 'forwarding_status', NEW.status,
        'public', jsonb_build_object(
          'organizationName', actor_org_name, 'originOrganizationName', NEW.origin_organization_name,
          'destinationOrganizationName', NEW.destination_organization_name,
          'destinationSector', NEW.destination_sector, 'destinationKind', NEW.destination_kind,
          'fromForwardingStatus', OLD.status, 'forwardingStatus', NEW.status, 'note', NEW.status_note)),
      true, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;

-- Providências e atualizações: dos dois órgãos do encaminhamento, só inserção.
CREATE OR REPLACE FUNCTION forwarding_updates_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  f RECORD;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os encaminhamentos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% é somente inserção', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Registro de status só pelo trigger do encaminhamento.
  IF NEW.kind = 'status' AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'mudança de status do encaminhamento é registrada pelo próprio encaminhamento'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM institutional_assert_demand_open(NEW.demand_id);
  SELECT organization_id, origin_organization_name, destination_kind, destination_organization_id,
         destination_organization_name
    INTO f FROM demand_forwardings WHERE id = NEW.forwarding_id AND demand_id = NEW.demand_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'encaminhamento inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.organization_id = f.organization_id THEN
    NEW.side := 'origem';
    NEW.organization_name := f.origin_organization_name;
  ELSIF f.destination_kind = 'orgao_plataforma' AND NEW.organization_id = f.destination_organization_id THEN
    NEW.side := 'destino';
    NEW.organization_name := f.destination_organization_name;
  ELSE
    RAISE EXCEPTION 'órgão fora deste encaminhamento' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.created_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION forwarding_updates_record_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  f RECORD;
BEGIN
  IF NEW.kind = 'status' THEN
    RETURN NULL; -- o evento é o encaminhamento_status_alterado
  END IF;
  SELECT origin_organization_name, destination_organization_name, destination_sector
    INTO f FROM demand_forwardings WHERE id = NEW.forwarding_id;
  INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
  VALUES (
    NEW.demand_id, 'encaminhamento_atualizado', 'poder_publico', NEW.author_id::text,
    jsonb_build_object(
      'forwarding_id', NEW.forwarding_id, 'update_id', NEW.id, 'organization_id', NEW.organization_id,
      'public', jsonb_build_object(
        'organizationName', NEW.organization_name, 'originOrganizationName', f.origin_organization_name,
        'destinationOrganizationName', f.destination_organization_name,
        'destinationSector', f.destination_sector, 'updateKind', NEW.kind,
        'excerpt', left(NEW.body, 280))),
    true, clock_timestamp());
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS forwardings_guard ON demand_forwardings;
CREATE TRIGGER forwardings_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_forwardings
  FOR EACH ROW EXECUTE FUNCTION forwardings_guard();

DROP TRIGGER IF EXISTS forwardings_block_truncate ON demand_forwardings;
CREATE TRIGGER forwardings_block_truncate
  BEFORE TRUNCATE ON demand_forwardings
  FOR EACH STATEMENT EXECUTE FUNCTION institutional_entries_no_truncate();

DROP TRIGGER IF EXISTS forwardings_record_event ON demand_forwardings;
CREATE TRIGGER forwardings_record_event
  AFTER INSERT OR UPDATE ON demand_forwardings
  FOR EACH ROW EXECUTE FUNCTION forwardings_record_event();

DROP TRIGGER IF EXISTS forwarding_updates_guard ON demand_forwarding_updates;
CREATE TRIGGER forwarding_updates_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_forwarding_updates
  FOR EACH ROW EXECUTE FUNCTION forwarding_updates_guard();

DROP TRIGGER IF EXISTS forwarding_updates_block_truncate ON demand_forwarding_updates;
CREATE TRIGGER forwarding_updates_block_truncate
  BEFORE TRUNCATE ON demand_forwarding_updates
  FOR EACH STATEMENT EXECUTE FUNCTION institutional_entries_no_truncate();

DROP TRIGGER IF EXISTS forwarding_updates_record_event ON demand_forwarding_updates;
CREATE TRIGGER forwarding_updates_record_event
  AFTER INSERT ON demand_forwarding_updates
  FOR EACH ROW EXECUTE FUNCTION forwarding_updates_record_event();
