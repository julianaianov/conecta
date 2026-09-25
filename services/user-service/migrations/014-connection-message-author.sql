-- Migração 014: instituição e cargo/perfil de quem escreve na conversa da
-- conexão (T-05-02).
--
-- Fonte: dm-docs/fonte-da-verdade/ (Modelo de Conexão) §12 "Cada interação
-- poderá registrar: usuário, instituição, cargo/perfil, data, horário…".
-- Decisão 13: a conversa T27 (`connection_messages`, migração 012) vale na
-- fase de pedido; depois do protocolo a comunicação é
-- `post_db.connection_process_messages` (post-service 027), com destinatário e
-- anexos. Aqui a conversa do pedido ganha só o mínimo da fonte: o retrato da
-- instituição e do cargo/perfil do autor no envio, preenchido pelo
-- `POST /connections/:id/messages` (cadastro institucional próprio com o cargo
-- do representante, vínculo T29 com o nível, ou o subperfil da conta).
-- Mensagens antigas ficam sem o retrato (não há como reconstruí-lo).
--
-- O guard da 012 é refeito: o retrato também é imutável (a anonimização
-- continua trocando só o corpo).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

ALTER TABLE connection_messages ADD COLUMN IF NOT EXISTS author_role_label VARCHAR(120);
ALTER TABLE connection_messages ADD COLUMN IF NOT EXISTS author_organization_name VARCHAR(255);

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
       OR NEW.created_at <> OLD.created_at
       OR NEW.author_role_label IS DISTINCT FROM OLD.author_role_label
       OR NEW.author_organization_name IS DISTINCT FROM OLD.author_organization_name THEN
      RAISE EXCEPTION 'mensagem da conexão é imutável' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.body <> OLD.body AND NEW.body <> '[removido a pedido do titular]' THEN
      RAISE EXCEPTION 'mensagem da conexão não é editada; só a anonimização a pedido do titular'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
