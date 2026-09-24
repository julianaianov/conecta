-- Migração 012: mensagens dentro da conexão (T27).
--
-- Fonte: dm-docs/fonte-da-verdade/DM_Conecta_Arquitetura_de_Perfis_e_Fluxo_do_Ecossistema.html,
-- §3.1 (Agentes de Transformação: "Receber solicitações de conexão" e
-- "Conversar com parceiros") e Modelo de Conexão §12 (comunicação dentro do
-- processo de conexão). Até aqui a conexão tinha só a mensagem inicial do
-- pedido (`connections.message`) e o desfecho (`outcome`); a conversa entre as
-- duas partes não existia.
--
-- Decisões:
-- - `connection_messages` é a conversa: uma linha por mensagem, das duas
--   partes, em ordem cronológica. A mensagem inicial continua em
--   `connections.message` (é o pedido, não a conversa).
-- - Só as duas partes escrevem e leem (regra na rota); a conversa segue aberta
--   enquanto a conexão está `pending` ou `accepted`; em estado final a conversa
--   fica registrada e não recebe mais mensagens (regra na rota, 409).
-- - Append-only: nada é editado nem excluído. A única mudança aceita é a
--   anonimização a pedido do titular (LGPD art. 18, IV), que troca o corpo da
--   mensagem pelo rótulo `[removido a pedido do titular]`, o mesmo usado em
--   `connections.message` (src/privacy/store.js). A gestão só lê (grant
--   SELECT herdado do dm-infra 003; nenhuma escrita).
-- - `connection_message_reads` guarda a última leitura de cada parte, para o
--   sino avisar mensagem não lida sem varrer a conversa.
-- - `connections.messages_count` e `last_message_at` são mantidos por trigger
--   e a conexão sobe na lista (`updated_at`) a cada mensagem.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

CREATE TABLE IF NOT EXISTS connection_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 2000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connection_messages_thread
  ON connection_messages(connection_id, created_at, id);

CREATE TABLE IF NOT EXISTS connection_message_reads (
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (connection_id, user_id)
);

ALTER TABLE connections ADD COLUMN IF NOT EXISTS messages_count INT NOT NULL DEFAULT 0;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Guarda: append-only, gestão só lê, e a única edição é a anonimização.
CREATE OR REPLACE FUNCTION connection_messages_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  is_gestao BOOLEAN := session_user = 'gestao_app';
BEGIN
  IF is_gestao THEN
    RAISE EXCEPTION 'a gestão só lê as mensagens da conexão' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'mensagem da conexão não é excluída' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.connection_id <> OLD.connection_id OR NEW.author_id <> OLD.author_id
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'mensagem da conexão é imutável' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.body <> OLD.body AND NEW.body <> '[removido a pedido do titular]' THEN
      RAISE EXCEPTION 'mensagem da conexão não é editada; só a anonimização a pedido do titular'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS connection_messages_guard ON connection_messages;
CREATE TRIGGER connection_messages_guard
  BEFORE INSERT OR UPDATE OR DELETE ON connection_messages
  FOR EACH ROW EXECUTE FUNCTION connection_messages_guard();

CREATE OR REPLACE FUNCTION connection_messages_block_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'mensagens da conexão não são truncadas' USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS connection_messages_block_truncate ON connection_messages;
CREATE TRIGGER connection_messages_block_truncate
  BEFORE TRUNCATE ON connection_messages
  FOR EACH STATEMENT EXECUTE FUNCTION connection_messages_block_truncate();

-- Contadores da conexão e subida na lista.
CREATE OR REPLACE FUNCTION connection_messages_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE connections
     SET messages_count = messages_count + 1,
         last_message_at = NEW.created_at,
         updated_at = NOW()
   WHERE id = NEW.connection_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS connection_messages_count ON connection_messages;
CREATE TRIGGER connection_messages_count
  AFTER INSERT ON connection_messages
  FOR EACH ROW EXECUTE FUNCTION connection_messages_count();
