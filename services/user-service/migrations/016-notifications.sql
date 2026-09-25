-- Migração 016: central de notificações persistente e caixa de saída de e-mail
-- no user_db (T-05-16). Mesmo formato de post-service/migrations/039-notifications.sql
-- (fonte, decisão 19 e regras estão lá); aqui ficam os avisos dos eventos que
-- nascem no user_db:
--
-- - `conexao`: pedido de conexão recebido (destinatário) e conexão aceita
--   (quem pediu). Quando o pedido sai de `pending`, o aviso do destinatário é
--   dado como lido.
-- - `nova_mensagem`: mensagem da outra parte na conversa da conexão (T27). Um
--   aviso em aberto por conversa; abrir a conversa (connection_message_reads)
--   o marca como lido.
-- - `convite_de_vinculo`: convite para atuar em nome de uma instituição (T29);
--   aceitar, recusar ou encerrar o convite o marca como lido.
--
-- O nome de quem agiu não é gravado no aviso: vem de `actor_user_id` →
-- profiles na leitura, então a anonimização do perfil (T24) vale também aqui.
-- Tudo por trigger, na mesma transação do evento; falha no aviso vira WARNING
-- e nunca desfaz a ação.
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
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  kind             VARCHAR(40) NOT NULL REFERENCES notification_kinds(kind),
  title            VARCHAR(200) NOT NULL CHECK (btrim(title) <> ''),
  summary          VARCHAR(500),
  href             VARCHAR(500) CHECK (href IS NULL OR href ~ '^/([^/]|$)'),
  actor_user_id    UUID,
  connection_id    UUID REFERENCES connections(id) ON DELETE CASCADE,
  demand_id        UUID,
  process_id       UUID,
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_open_dedupe
  ON notifications((coalesce(user_id, organization_id)), dedupe_key)
  WHERE dedupe_key IS NOT NULL AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;

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
-- Porta de entrada (a mesma do post_db, com quem agiu e a conexão).
CREATE OR REPLACE FUNCTION notification_create(
  p_user_id       UUID,
  p_kind          TEXT,
  p_title         TEXT,
  p_summary       TEXT DEFAULT NULL,
  p_href          TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_connection_id UUID DEFAULT NULL,
  p_demand_id     UUID DEFAULT NULL,
  p_process_id    UUID DEFAULT NULL,
  p_dedupe_key    TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  pref_in_app BOOLEAN := true;
  pref_email  BOOLEAN := true;
  found_id    UUID;
BEGIN
  IF p_user_id IS NULL OR p_user_id IS NOT DISTINCT FROM p_actor_user_id THEN RETURN NULL; END IF;
  SELECT in_app, email INTO pref_in_app, pref_email
    FROM notification_preferences WHERE user_id = p_user_id AND kind = p_kind;
  pref_in_app := coalesce(pref_in_app, true);
  pref_email := coalesce(pref_email, true);
  IF NOT pref_in_app AND NOT pref_email THEN RETURN NULL; END IF;

  IF p_dedupe_key IS NOT NULL AND pref_in_app THEN
    UPDATE notifications
       SET title = left(p_title, 200), summary = left(p_summary, 500), href = p_href,
           actor_user_id = p_actor_user_id, created_at = NOW()
     WHERE user_id = p_user_id AND dedupe_key = p_dedupe_key AND read_at IS NULL
     RETURNING id INTO found_id;
    IF found_id IS NOT NULL THEN RETURN found_id; END IF;
  END IF;

  BEGIN
    INSERT INTO notifications (user_id, kind, title, summary, href, actor_user_id, connection_id, demand_id,
                               process_id, dedupe_key, read_at)
    VALUES (p_user_id, p_kind, left(p_title, 200), left(p_summary, 500), p_href, p_actor_user_id, p_connection_id,
            p_demand_id, p_process_id, p_dedupe_key, CASE WHEN pref_in_app THEN NULL ELSE NOW() END)
    RETURNING id INTO found_id;
  EXCEPTION WHEN unique_violation THEN
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

REVOKE ALL ON FUNCTION notification_create(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC;

-- Dá como lido o aviso em aberto de uma chave (a ação já foi vista ou resolvida).
CREATE OR REPLACE FUNCTION notification_resolve(p_user_id UUID, p_dedupe_key TEXT) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE notifications SET read_at = NOW()
   WHERE user_id = p_user_id AND dedupe_key = p_dedupe_key AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION notification_resolve(UUID, TEXT) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Conexões: pedido recebido e conexão aceita.
CREATE OR REPLACE FUNCTION connections_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status = 'pending' THEN
        PERFORM notification_create(NEW.to_user_id, 'conexao', 'Nova solicitação de conexão',
                                    'enviou uma solicitação de conexão', '/conexoes/' || NEW.id,
                                    NEW.from_user_id, NEW.id, NEW.demand_id, NULL, 'conexao:' || NEW.id);
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'pending' THEN
        PERFORM notification_resolve(NEW.to_user_id, 'conexao:' || NEW.id);
      END IF;
      IF NEW.status = 'accepted' THEN
        PERFORM notification_create(NEW.from_user_id, 'conexao', 'Conexão aceita', 'aceitou sua conexão',
                                    '/conexoes/' || NEW.id, NEW.to_user_id, NEW.id, NEW.demand_id);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'connections_notify: %', SQLERRM;
  END;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS connections_notify ON connections;
CREATE TRIGGER connections_notify
  AFTER INSERT OR UPDATE OF status ON connections
  FOR EACH ROW EXECUTE FUNCTION connections_notify();

-- Conversa da conexão (T27): a outra parte recebe um aviso por conversa.
CREATE OR REPLACE FUNCTION connection_messages_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c RECORD;
  other UUID;
BEGIN
  BEGIN
    SELECT id, from_user_id, to_user_id, demand_id INTO c FROM connections WHERE id = NEW.connection_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    other := CASE WHEN NEW.author_id = c.from_user_id THEN c.to_user_id ELSE c.from_user_id END;
    PERFORM notification_create(other, 'nova_mensagem', 'Nova mensagem na conexão',
                                'enviou uma mensagem na conexão', '/conexoes/' || c.id,
                                NEW.author_id, c.id, c.demand_id, NULL, 'mensagem:' || c.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'connection_messages_notify: %', SQLERRM;
  END;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS connection_messages_notify ON connection_messages;
CREATE TRIGGER connection_messages_notify
  AFTER INSERT ON connection_messages
  FOR EACH ROW EXECUTE FUNCTION connection_messages_notify();

-- Abrir a conversa dá o aviso de mensagem como lido.
CREATE OR REPLACE FUNCTION connection_message_reads_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  BEGIN
    PERFORM notification_resolve(NEW.user_id, 'mensagem:' || NEW.connection_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'connection_message_reads_notify: %', SQLERRM;
  END;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS connection_message_reads_notify ON connection_message_reads;
CREATE TRIGGER connection_message_reads_notify
  AFTER INSERT OR UPDATE ON connection_message_reads
  FOR EACH ROW EXECUTE FUNCTION connection_message_reads_notify();

-- Convite para atuar em nome de uma instituição (T29).
CREATE OR REPLACE FUNCTION organization_members_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  org_name TEXT;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'convidado' THEN
      SELECT coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), o.org_name) INTO org_name
        FROM organizations o WHERE o.id = NEW.organization_id;
      PERFORM notification_create(
        NEW.user_id, 'convite_de_vinculo', 'Convite para atuar por uma instituição',
        coalesce(org_name, 'Uma instituição') || ' convidou você para atuar como '
          || CASE NEW.level WHEN 'gestor' THEN 'Gestor' WHEN 'publicador' THEN 'Publicador'
                            WHEN 'colaborador' THEN 'Colaborador' ELSE NEW.level END,
        '/vinculos', NEW.invited_by, NULL, NULL, NULL, 'vinculo:' || NEW.id);
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'convidado' AND NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM notification_resolve(NEW.user_id, 'vinculo:' || NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'organization_members_notify: %', SQLERRM;
  END;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS organization_members_notify ON organization_members;
CREATE TRIGGER organization_members_notify
  AFTER INSERT OR UPDATE OF status ON organization_members
  FOR EACH ROW EXECUTE FUNCTION organization_members_notify();

-- Avisos que ainda pedem ação quando a central entrou no ar: pedidos de conexão
-- pendentes e convites em aberto. Uma vez por chave (mesmo lido, nunca volta).
INSERT INTO notifications (user_id, kind, title, summary, href, actor_user_id, connection_id, demand_id,
                           dedupe_key, created_at)
SELECT c.to_user_id, 'conexao', 'Nova solicitação de conexão', 'enviou uma solicitação de conexão',
       '/conexoes/' || c.id, c.from_user_id, c.id, c.demand_id, 'conexao:' || c.id, coalesce(c.created_at, NOW())
  FROM connections c
 WHERE c.status = 'pending'
   AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedupe_key = 'conexao:' || c.id);

INSERT INTO notifications (user_id, kind, title, summary, href, actor_user_id, dedupe_key, created_at)
SELECT m.user_id, 'convite_de_vinculo', 'Convite para atuar por uma instituição',
       coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), o.org_name, 'Uma instituição')
         || ' convidou você para atuar como '
         || CASE m.level WHEN 'gestor' THEN 'Gestor' WHEN 'publicador' THEN 'Publicador'
                         WHEN 'colaborador' THEN 'Colaborador' ELSE m.level END,
       '/vinculos', m.invited_by, 'vinculo:' || m.id, m.invited_at
  FROM organization_members m
  JOIN organizations o ON o.id = m.organization_id
 WHERE m.status = 'convidado'
   AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedupe_key = 'vinculo:' || m.id);
