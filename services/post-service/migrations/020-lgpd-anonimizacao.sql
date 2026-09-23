-- T24 — Registro das contas anonimizadas a pedido do titular (LGPD, art. 18,
-- IV: anonimização, bloqueio ou eliminação de dados desnecessários).
--
-- Fonte: Apresentação Institucional, slide 25 (LGPD em toda a coleta, uso e
-- compartilhamento).
--
-- O `post_db` guarda o que a plataforma **precisa reter**: demanda publicada,
-- dossiê, cronograma, evidências do antes/depois, prestação de contas, apoios
-- e a linha do tempo — tudo append-only, de interesse público e com valor de
-- prestação de contas (LGPD art. 16, I e II; art. 7º, VI). A eliminação pedida
-- pelo titular **não apaga e não reescreve** essa trilha.
--
-- O que a anonimização faz aqui:
--   1. grava a conta em `anonymized_users` (registro append-only do pedido);
--   2. substitui o **retrato de identidade** das publicações e comentários do
--      feed (`posts.author_name`/`author_avatar`, `comments.author_name`) pelo
--      rótulo anônimo — o conteúdo fica, a pessoa some;
--   3. revoga os consentimentos opcionais de exibição do nome
--      (`ranking_consents.consent` e `supports.display_consent`), que são
--      escritas já previstas e reversíveis pelo titular (T16/T21). Sem
--      consentimento, a linha continua contando nos números — eles seguem
--      honestos — mas aparece sem nome e sem avatar.
--
-- O que **não** muda: `demands` e tudo que pende delas (a autoria institucional
-- do Agente é parte do registro público e do dossiê), `demand_events`,
-- `demand_interests`, `content_shares`, `content_reports`, evidências,
-- andamento e prestação de contas. As identidades gravadas nessas trilhas não
-- são exibidas com nome em rota pública (o `payload->'public'` já omite) e a
-- gestão as vê pseudonimizadas (dm-docs/docs/gestao/05-lgpd.md §5).
--
-- A regra completa por tipo de dado está em dm-docs/docs/gestao/05-lgpd.md §7.
--
-- A gestão (`gestao_app`) só lê (grant no dm-infra,
-- db/migrations/gestao/018-gestao-app-user-lgpd.sql).
--
-- Idempotente: o deploy reaplica o manifesto inteiro.

CREATE TABLE IF NOT EXISTS anonymized_users (
  user_id       UUID PRIMARY KEY,
  protocol      VARCHAR(32),
  summary       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  anonymized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anonymized_users_date
  ON anonymized_users (anonymized_at DESC);

CREATE OR REPLACE FUNCTION anonymized_users_guard() RETURNS TRIGGER AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê o registro de anonimização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'anonymized_users: % não é permitido (registro imutável)', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS anonymized_users_guard ON anonymized_users;
CREATE TRIGGER anonymized_users_guard
  BEFORE INSERT OR UPDATE OR DELETE ON anonymized_users
  FOR EACH ROW EXECUTE FUNCTION anonymized_users_guard();

DROP TRIGGER IF EXISTS anonymized_users_block_truncate ON anonymized_users;
CREATE TRIGGER anonymized_users_block_truncate
  BEFORE TRUNCATE ON anonymized_users
  FOR EACH STATEMENT EXECUTE FUNCTION anonymized_users_guard();
