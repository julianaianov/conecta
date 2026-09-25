-- Migração 039: central de notificações persistente e caixa de saída de e-mail
-- (T-05-16, absorve a T-02-03).
--
-- Fonte: dm-docs/fonte-da-verdade/DM_Conecta_Fluxo_do_Ecossistema_e_Modelo_de_Conexao
-- §08 ("Central de notificações, Painel de processos, Alertas de novas
-- demandas"; por e-mail "Aviso de nova demanda, Aviso de prazo, Solicitação de
-- análise, Atualização de processo, Nova mensagem, Novo documento") e §34
-- ("O e-mail avisa. O DM Conecta organiza e registra o processo."); decisão 19
-- em dm-docs/fonte-da-verdade/decisoes-de-implementacao.md.
--
-- - `notification_kinds`: os tipos aceitos. Tipo novo entra com
--   `INSERT INTO notification_kinds (kind) VALUES ('x') ON CONFLICT DO NOTHING`
--   numa migração própria (e na lista espelhada em src/notifications/constants.js
--   dos dois serviços e em src/lib/app/notifications.ts).
-- - `notifications`: uma linha por destinatário. Destinatário é uma conta
--   (`user_id`) ou um órgão/instituição inteiro (`organization_id`, de
--   user_db.organizations, sem FK: outra base) — o encaminhamento é recebido
--   pelo órgão, e qualquer representante dele vê e marca como lida. `read_at`
--   é a leitura (persistida: vale em qualquer sessão e dispositivo).
--   `dedupe_key` junta avisos repetidos enquanto não lidos (o segundo só
--   atualiza o primeiro).
-- - `notification_preferences`: por conta e tipo, `in_app` e `email`; sem
--   linha, os dois ligados. `in_app = false` grava a notificação já lida (fica
--   no histórico da central, sem contar no sino).
-- - `email_outbox`: a caixa de saída. Cada notificação de conta com `email`
--   ligado gera uma linha `pendente`; o laço src/notifications/mailer.js marca
--   `desligado` enquanto não houver provedor (DM_MAIL_PROVIDER vazio), então
--   nada falha nem bloqueia sem e-mail. A gestão só lê (dm-infra
--   db/migrations/gestao/032-gestao-app-post-notifications.sql).
-- - `notification_create(...)` e `notification_create_for_organization(...)`
--   são a porta de entrada (usada pelo trigger abaixo e por
--   src/notifications/index.js `notify`).
-- - Trigger `demand_events_fan_out` (AFTER INSERT em `demand_events`,
--   SECURITY DEFINER porque a gestão grava como gestao_app): decide os
--   destinatários pelo tipo do evento, na mesma transação, sem HTTP e sem
--   fila. Falha dentro dele vira WARNING: aviso nunca desfaz a ação.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

CREATE TABLE IF NOT EXISTS notification_kinds (
  kind VARCHAR(40) PRIMARY KEY CHECK (kind ~ '^[a-z_]+$')
);

INSERT INTO notification_kinds (kind) VALUES
  ('nova_demanda_compativel'), ('prazo_proximo'), ('prazo_vencido'), ('solicitacao_de_analise'),
  ('atualizacao_de_processo'), ('nova_mensagem'), ('novo_documento'), ('encaminhamento_recebido'),
  ('interesse_recebido'), ('conexao'), ('apoio'), ('resultado_registrado'),
  ('demanda_devolvida'), ('demanda_publicada'), ('convite_de_vinculo')
ON CONFLICT (kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID,
  organization_id  UUID,
  kind             VARCHAR(40) NOT NULL REFERENCES notification_kinds(kind),
  title            VARCHAR(200) NOT NULL CHECK (btrim(title) <> ''),
  summary          VARCHAR(500),
  href             VARCHAR(500) CHECK (href IS NULL OR href ~ '^/([^/]|$)'),
  demand_id        UUID REFERENCES demands(id) ON DELETE CASCADE,
  process_id       UUID,
  event_id         UUID REFERENCES demand_events(id) ON DELETE SET NULL,
  dedupe_key       VARCHAR(200),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at          TIMESTAMPTZ,
  emailed_at       TIMESTAMPTZ,
  CONSTRAINT notifications_one_recipient CHECK ((user_id IS NULL) <> (organization_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC) WHERE user_id IS NOT NULL AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_org
  ON notifications(organization_id, created_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_org_unread
  ON notifications(organization_id, created_at DESC) WHERE organization_id IS NOT NULL AND read_at IS NULL;
-- Um aviso em aberto por destinatário e chave.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_open_dedupe
  ON notifications((coalesce(user_id, organization_id)), dedupe_key)
  WHERE dedupe_key IS NOT NULL AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_event
  ON notifications(event_id) WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id     UUID NOT NULL,
  kind        VARCHAR(40) NOT NULL REFERENCES notification_kinds(kind),
  in_app      BOOLEAN NOT NULL DEFAULT true,
  email       BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id  UUID NOT NULL UNIQUE REFERENCES notifications(id) ON DELETE CASCADE,
  to_user_id       UUID NOT NULL,
  status           VARCHAR(12) NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('pendente', 'enviado', 'falhou', 'desligado')),
  attempts         INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error       VARCHAR(500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_pending
  ON email_outbox(created_at) WHERE status = 'pendente';

-- ---------------------------------------------------------------------------
-- Porta de entrada. Devolve o id da notificação (nova ou atualizada) ou NULL
-- quando a conta desligou o tipo no aplicativo e no e-mail.
CREATE OR REPLACE FUNCTION notification_create(
  p_user_id    UUID,
  p_kind       TEXT,
  p_title      TEXT,
  p_summary    TEXT DEFAULT NULL,
  p_href       TEXT DEFAULT NULL,
  p_demand_id  UUID DEFAULT NULL,
  p_process_id UUID DEFAULT NULL,
  p_event_id   UUID DEFAULT NULL,
  p_dedupe_key TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  pref_in_app BOOLEAN := true;
  pref_email  BOOLEAN := true;
  found_id    UUID;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;
  SELECT in_app, email INTO pref_in_app, pref_email
    FROM notification_preferences WHERE user_id = p_user_id AND kind = p_kind;
  pref_in_app := coalesce(pref_in_app, true);
  pref_email := coalesce(pref_email, true);
  IF NOT pref_in_app AND NOT pref_email THEN RETURN NULL; END IF;

  IF p_dedupe_key IS NOT NULL AND pref_in_app THEN
    UPDATE notifications
       SET title = left(p_title, 200), summary = left(p_summary, 500), href = p_href,
           created_at = NOW(), event_id = coalesce(p_event_id, event_id)
     WHERE user_id = p_user_id AND dedupe_key = p_dedupe_key AND read_at IS NULL
     RETURNING id INTO found_id;
    IF found_id IS NOT NULL THEN RETURN found_id; END IF;
  END IF;

  BEGIN
    INSERT INTO notifications (user_id, kind, title, summary, href, demand_id, process_id, event_id,
                               dedupe_key, read_at)
    VALUES (p_user_id, p_kind, left(p_title, 200), left(p_summary, 500), p_href, p_demand_id, p_process_id,
            p_event_id, p_dedupe_key, CASE WHEN pref_in_app THEN NULL ELSE NOW() END)
    RETURNING id INTO found_id;
  EXCEPTION WHEN unique_violation THEN
    -- Outra transação abriu o mesmo aviso agora: fica o dela.
    SELECT id INTO found_id FROM notifications
     WHERE user_id = p_user_id AND dedupe_key = p_dedupe_key AND read_at IS NULL;
    RETURN found_id;
  END;

  IF pref_email THEN
    INSERT INTO email_outbox (notification_id, to_user_id) VALUES (found_id, p_user_id);
  END IF;
  RETURN found_id;
END
$$;

-- Aviso ao órgão/instituição inteiro (sem e-mail: não há uma caixa única).
CREATE OR REPLACE FUNCTION notification_create_for_organization(
  p_organization_id UUID,
  p_kind       TEXT,
  p_title      TEXT,
  p_summary    TEXT DEFAULT NULL,
  p_href       TEXT DEFAULT NULL,
  p_demand_id  UUID DEFAULT NULL,
  p_process_id UUID DEFAULT NULL,
  p_event_id   UUID DEFAULT NULL,
  p_dedupe_key TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  found_id UUID;
BEGIN
  IF p_organization_id IS NULL THEN RETURN NULL; END IF;
  IF p_dedupe_key IS NOT NULL THEN
    UPDATE notifications
       SET title = left(p_title, 200), summary = left(p_summary, 500), href = p_href, created_at = NOW()
     WHERE organization_id = p_organization_id AND dedupe_key = p_dedupe_key AND read_at IS NULL
     RETURNING id INTO found_id;
    IF found_id IS NOT NULL THEN RETURN found_id; END IF;
  END IF;
  BEGIN
    INSERT INTO notifications (organization_id, kind, title, summary, href, demand_id, process_id, event_id, dedupe_key)
    VALUES (p_organization_id, p_kind, left(p_title, 200), left(p_summary, 500), p_href, p_demand_id, p_process_id,
            p_event_id, p_dedupe_key)
    RETURNING id INTO found_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO found_id FROM notifications
     WHERE organization_id = p_organization_id AND dedupe_key = p_dedupe_key AND read_at IS NULL;
  END;
  RETURN found_id;
END
$$;

REVOKE ALL ON FUNCTION notification_create(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION notification_create_for_organization(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Destinatários por tipo de evento da linha do tempo. O ator nunca é avisado
-- do que ele mesmo fez. Texto sem nota da gestão nem dado privado: a nota fica
-- na tela da demanda.
CREATE OR REPLACE FUNCTION demand_events_fan_out() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d           RECORD;
  label       TEXT;
  mine        TEXT;
  public_page TEXT;
  author      UUID;
  target      UUID;
  origin_org  UUID;
BEGIN
  BEGIN
    SELECT id, author_id, title INTO d FROM demands WHERE id = NEW.demand_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    label := '«' || coalesce(nullif(btrim(d.title), ''), 'Demanda sem título') || '»';
    mine := '/minhas-demandas#demanda-' || d.id;
    public_page := '/demandas/' || d.id;
    -- Autor, se não foi ele quem agiu.
    author := CASE WHEN NEW.actor IS DISTINCT FROM d.author_id::text THEN d.author_id END;

    CASE NEW.event_type
      WHEN 'devolvida_para_ajustes' THEN
        PERFORM notification_create(author, 'demanda_devolvida', 'Demanda devolvida para ajustes', label,
                                    mine, d.id, NULL, NEW.id);
      WHEN 'publicada' THEN
        PERFORM notification_create(author, 'demanda_publicada', 'Demanda publicada', label,
                                    public_page, d.id, NULL, NEW.id);
      WHEN 'interesse_registrado' THEN
        PERFORM notification_create(author, 'interesse_recebido', 'Novo interesse na sua demanda', label,
                                    mine, d.id, NULL, NEW.id, 'interesse:' || d.id);
      WHEN 'apoio_declarado' THEN
        PERFORM notification_create(author, 'apoio', 'Apoio registrado na sua demanda', label,
                                    mine, d.id, NULL, NEW.id);
      WHEN 'apoio_institucional_oferecido' THEN
        PERFORM notification_create(author, 'apoio', 'Um órgão público ofereceu apoio', label,
                                    public_page, d.id, NULL, NEW.id);
      WHEN 'apoio_confirmado' THEN
        SELECT user_id INTO target FROM supports WHERE id::text = NEW.payload->>'support_id';
        IF target IS NOT NULL AND target::text IS DISTINCT FROM NEW.actor THEN
          PERFORM notification_create(target, 'apoio', 'O Agente confirmou o recebimento do seu apoio', label,
                                      public_page, d.id, NULL, NEW.id);
        END IF;
      WHEN 'acompanhamento_institucional_aberto' THEN
        PERFORM notification_create(author, 'atualizacao_de_processo',
                                    'Um órgão público passou a acompanhar sua demanda', label,
                                    public_page, d.id, NULL, NEW.id, 'atualizacao:' || d.id);
      WHEN 'resposta_institucional' THEN
        PERFORM notification_create(author, 'atualizacao_de_processo', 'Resposta institucional registrada', label,
                                    public_page, d.id, NULL, NEW.id, 'atualizacao:' || d.id);
      WHEN 'status_institucional_alterado' THEN
        PERFORM notification_create(author, 'atualizacao_de_processo', 'Situação institucional atualizada', label,
                                    public_page, d.id, NULL, NEW.id, 'atualizacao:' || d.id);
      WHEN 'demanda_encaminhada' THEN
        PERFORM notification_create(author, 'atualizacao_de_processo', 'Sua demanda foi encaminhada', label,
                                    public_page, d.id, NULL, NEW.id, 'atualizacao:' || d.id);
        IF NEW.payload->>'destination_organization_id' IS NOT NULL THEN
          PERFORM notification_create_for_organization(
            (NEW.payload->>'destination_organization_id')::uuid, 'encaminhamento_recebido',
            'Encaminhamento recebido', coalesce(NEW.payload->'public'->>'organizationName', 'Um órgão')
              || ' encaminhou ' || label,
            '/governo/demandas/' || d.id, d.id, NULL, NEW.id);
        END IF;
      WHEN 'encaminhamento_status_alterado' THEN
        -- O destino respondeu: avisa a origem.
        SELECT organization_id INTO origin_org FROM demand_forwardings
         WHERE id::text = NEW.payload->>'forwarding_id';
        IF origin_org IS NOT NULL AND origin_org::text IS DISTINCT FROM NEW.payload->>'organization_id' THEN
          PERFORM notification_create_for_organization(
            origin_org, 'atualizacao_de_processo', 'Encaminhamento respondido',
            coalesce(NEW.payload->'public'->>'destinationOrganizationName', 'O órgão de destino')
              || ' atualizou o encaminhamento de ' || label,
            '/governo/demandas/' || d.id, d.id, NULL, NEW.id);
        END IF;
      ELSE
        NULL;
    END CASE;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'demand_events_fan_out (%): %', NEW.event_type, SQLERRM;
  END;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION demand_events_fan_out() FROM PUBLIC;

DROP TRIGGER IF EXISTS demand_events_fan_out ON demand_events;
CREATE TRIGGER demand_events_fan_out
  AFTER INSERT ON demand_events
  FOR EACH ROW EXECUTE FUNCTION demand_events_fan_out();

-- Avisos que ainda pedem ação quando a central entrou no ar: demanda devolvida
-- e encaminhamento recebido sem resposta. Uma vez por evento (mesmo lido,
-- nunca volta), então reaplicar a migração não repete aviso.
INSERT INTO notifications (user_id, kind, title, summary, href, demand_id, event_id, dedupe_key, created_at)
SELECT d.author_id, 'demanda_devolvida', 'Demanda devolvida para ajustes',
       '«' || coalesce(nullif(btrim(d.title), ''), 'Demanda sem título') || '»',
       '/minhas-demandas#demanda-' || d.id, d.id, e.id, 'backfill:' || e.id, e.created_at
  FROM demands d
  JOIN LATERAL (SELECT id, created_at FROM demand_events
                 WHERE demand_id = d.id AND event_type = 'devolvida_para_ajustes'
                 ORDER BY created_at DESC LIMIT 1) e ON true
 WHERE d.review_state = 'devolvida'
   AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.event_id = e.id);

INSERT INTO notifications (organization_id, kind, title, summary, href, demand_id, event_id, dedupe_key, created_at)
SELECT f.destination_organization_id, 'encaminhamento_recebido', 'Encaminhamento recebido',
       coalesce(f.origin_organization_name, 'Um órgão') || ' encaminhou «'
         || coalesce(nullif(btrim(d.title), ''), 'Demanda sem título') || '»',
       '/governo/demandas/' || d.id, d.id, e.id, 'backfill:' || e.id, f.forwarded_at
  FROM demand_forwardings f
  JOIN demands d ON d.id = f.demand_id
  JOIN demand_events e ON e.demand_id = f.demand_id AND e.event_type = 'demanda_encaminhada'
                      AND e.payload->>'forwarding_id' = f.id::text
 WHERE f.status = 'enviado' AND f.destination_organization_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.event_id = e.id);
