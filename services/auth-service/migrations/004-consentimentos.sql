-- T24 — Consentimento versionado dos termos de uso e da política de
-- privacidade (LGPD, art. 8º, §1º: o consentimento é registrado; art. 8º, §6º:
-- mudança de finalidade exige novo consentimento).
--
-- Fonte: Apresentação Institucional, slide 25 ("Conformidade com a LGPD em
-- toda a coleta, uso e compartilhamento de dados").
--
-- `user_consents` é **append-only**: cada aceite é um registro novo, com o
-- documento, a versão aceita, a data da versão, a data do aceite e a origem
-- (cadastro, nova versão do documento ou reaceite pedido pelo titular).
-- Nada é atualizado nem excluído — a trilha do consentimento é a prova de que
-- ele existiu e de qual texto foi aceito. Revogar não apaga o aceite: a
-- revogação é o pedido de eliminação/revogação registrado em
-- `user_db.data_subject_requests` (migração user-service 011).
--
-- Minimização: **não** guardamos IP nem user agent do aceite. A fonte exige
-- versão, data e origem; endereço de rede seria coleta sem finalidade.
--
-- As versões vigentes de cada documento ficam no código
-- (`services/auth-service/src/consents.js`, espelhado em
-- `src/lib/app/privacy.ts`), não no banco: o texto é do repositório e a
-- versão é dele.
--
-- `users.anonymized_at` marca a conta anonimizada a pedido do titular (T24,
-- eliminação): a linha **não** é excluída, porque é a chave estrangeira de
-- toda a trilha imutável do portal (demandas, apoios, prestação de contas,
-- denúncias). A FK `RESTRICT` de `user_consents` reforça isso.
--
-- Idempotente: o deploy reaplica o manifesto inteiro.

CREATE TABLE IF NOT EXISTS user_consents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  document      VARCHAR(40) NOT NULL,
  version       VARCHAR(20) NOT NULL,
  document_date DATE        NOT NULL,
  origin        VARCHAR(30) NOT NULL,
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_consents_document CHECK (document IN ('termos_de_uso', 'politica_de_privacidade')),
  CONSTRAINT user_consents_origin   CHECK (origin IN ('cadastro', 'nova_versao', 'reaceite'))
);

-- Um aceite por titular × documento × versão (reaceitar a mesma versão não
-- gera linha nova; o INSERT usa ON CONFLICT DO NOTHING).
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_consents_unique
  ON user_consents (user_id, document, version);
CREATE INDEX IF NOT EXISTS idx_user_consents_user
  ON user_consents (user_id, document, accepted_at DESC);

CREATE OR REPLACE FUNCTION user_consents_guard() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'user_consents: % não é permitido (a trilha do consentimento é imutável)', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_consents_guard ON user_consents;
CREATE TRIGGER user_consents_guard
  BEFORE UPDATE OR DELETE ON user_consents
  FOR EACH ROW EXECUTE FUNCTION user_consents_guard();

DROP TRIGGER IF EXISTS user_consents_block_truncate ON user_consents;
CREATE TRIGGER user_consents_block_truncate
  BEFORE TRUNCATE ON user_consents
  FOR EACH STATEMENT EXECUTE FUNCTION user_consents_guard();

ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
