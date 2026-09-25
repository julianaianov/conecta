-- Migração 043: nível de visibilidade dos documentos da demanda (T-05-18).
--
-- Fonte: Modelo de Conexão §33 ("PÚBLICO"; "INSTITUCIONAL: informações
-- acessíveis aos usuários envolvidos no processo"; "RESTRITO: apenas usuários
-- autorizados"), §09 (o parceiro "acessa o Dossiê da Demanda … Documentação:
-- quais documentos comprovam") e §31; Fluxo 3, slide 8 ("Documentação").
-- Decisão 13 (dm-docs/fonte-da-verdade/decisoes-de-implementacao.md): o
-- documento da demanda nasce `institucional`; o Agente pode torná-lo
-- `publico` ou `restrito` (autor e lista explícita de contas).
--
-- Decisões:
-- - Tabela própria `demand_document_access` (um registro por documento), e não
--   coluna em `demand_documents`: os itens da demanda só mudam em rascunho ou
--   devolvida (`demand_items_guard`, migração 007), mas o nível de acesso é
--   escolha do Agente a qualquer tempo. Sem registro, vale `institucional`.
-- - `restricted_to`: contas (auth_db.users.id, outra base: sem FK) autorizadas
--   num documento `restrito`, além do autor.
-- - Quem é "envolvido no processo" é decidido no serviço
--   (`src/access/process-party.js`): autor e seus delegados (T29), partes dos
--   Processos de Conexão da demanda, órgãos com acompanhamento aberto e
--   interessados com conexão aceita. Cada abertura por quem não é o autor
--   grava `documento_consultado` ou `dossie_integral_consultado`, privados, em
--   `demand_events` (texto livre; nada a migrar).
-- - A gestão já lê os documentos (grant de `demand_documents`); esta tabela
--   não recebe grant do `gestao_app` (a gestão não decide acesso).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

DO $$ BEGIN
  CREATE TYPE document_access_level AS ENUM ('publico', 'institucional', 'restrito');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS demand_document_access (
  document_id    UUID PRIMARY KEY REFERENCES demand_documents(id) ON DELETE CASCADE,
  demand_id      UUID NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  access_level   document_access_level NOT NULL DEFAULT 'institucional',
  restricted_to  UUID[] NOT NULL DEFAULT '{}',
  updated_by     UUID NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_document_access_restricted_limit CHECK (cardinality(restricted_to) <= 50)
);

CREATE INDEX IF NOT EXISTS idx_demand_document_access_demand ON demand_document_access(demand_id);

-- O documento e a demanda do registro precisam casar; `updated_at` é do banco.
CREATE OR REPLACE FUNCTION demand_document_access_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM demand_documents WHERE id = NEW.document_id AND demand_id = NEW.demand_id) THEN
    RAISE EXCEPTION 'documento não pertence à demanda' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.document_id <> OLD.document_id OR NEW.demand_id <> OLD.demand_id) THEN
    RAISE EXCEPTION 'o registro de acesso não muda de documento' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS demand_document_access_guard ON demand_document_access;
CREATE TRIGGER demand_document_access_guard
  BEFORE INSERT OR UPDATE ON demand_document_access
  FOR EACH ROW EXECUTE FUNCTION demand_document_access_guard();

-- Consultas de "é parte?" (uploads, documentos e dossiê).
CREATE INDEX IF NOT EXISTS idx_demand_interests_accepted
  ON demand_interests(demand_id, user_id) WHERE connection_status = 'aceita' AND withdrawn_at IS NULL;
