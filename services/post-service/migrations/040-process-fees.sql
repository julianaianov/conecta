-- Migração 040: 4% + 6% por Processo de Conexão, nunca para o Poder Público (T-05-06).
--
-- Fonte: dm-docs/fonte-da-verdade/ (Modelo de Conexão) §04 Obs. "Este valor
-- (%) será aplicado exclusivamente às conexões realizadas com Parceiros,
-- Investidores e Empresas. Não se aplica às conexões com o Poder Público."
-- Decisão 14 de decisoes-de-implementacao.md.
--
-- - As taxas incidem sobre a contribuição financeira de cada processo
--   (`contribution_amount_cents`, só em apoio financeiro/patrocínio) cuja parte
--   não é o Poder Público (`fee_applies`, migração 026): 4% do Agente e 6% da
--   plataforma, cada uma arredondada meio para cima ao centavo, como em
--   src/demand/finance.js e no CHECK `demands_financial_composition` (007).
--   R$ 10.000,00 → R$ 400,00 + R$ 600,00 → R$ 11.000,00.
-- - Processo com o Poder Público: taxas 0 e total = contribuição.
-- - Sem contribuição financeira: taxas e total NULL (não há o que compor).
-- - Colunas geradas: ninguém grava, o valor acompanha a contribuição (a troca
--   por `PUT /processes/:ref/contribution` recalcula). Uma coluna gerada não lê
--   outra, então a condição de `fee_applies` é repetida aqui.
-- - A composição por demanda (007) continua gravada como projeção "se apoiada
--   por Parceiros/Empresas"; nada é removido.
-- - A gestão lê pelo grant de tabela já existente (dm-infra
--   db/migrations/gestao/025-gestao-app-post-processes.sql).
-- - Não há pagamento na plataforma (decisão 5).
--
-- Idempotente (ADD COLUMN IF NOT EXISTS).

ALTER TABLE connection_processes
  ADD COLUMN IF NOT EXISTS agent_fee_cents BIGINT GENERATED ALWAYS AS (
    CASE
      WHEN contribution_amount_cents IS NULL THEN NULL
      WHEN party_kind = 'poder_publico' THEN 0
      ELSE round(contribution_amount_cents::numeric * 400 / 10000)::bigint
    END) STORED;

ALTER TABLE connection_processes
  ADD COLUMN IF NOT EXISTS platform_fee_cents BIGINT GENERATED ALWAYS AS (
    CASE
      WHEN contribution_amount_cents IS NULL THEN NULL
      WHEN party_kind = 'poder_publico' THEN 0
      ELSE round(contribution_amount_cents::numeric * 600 / 10000)::bigint
    END) STORED;

ALTER TABLE connection_processes
  ADD COLUMN IF NOT EXISTS total_with_fees_cents BIGINT GENERATED ALWAYS AS (
    CASE
      WHEN contribution_amount_cents IS NULL THEN NULL
      WHEN party_kind = 'poder_publico' THEN contribution_amount_cents
      ELSE contribution_amount_cents
        + round(contribution_amount_cents::numeric * 400 / 10000)::bigint
        + round(contribution_amount_cents::numeric * 600 / 10000)::bigint
    END) STORED;

COMMENT ON COLUMN connection_processes.agent_fee_cents IS
  '4% do Agente sobre a contribuição financeira; 0 com o Poder Público (Modelo §04 Obs., decisão 14)';
COMMENT ON COLUMN connection_processes.platform_fee_cents IS
  '6% da plataforma sobre a contribuição financeira; 0 com o Poder Público (Modelo §04 Obs., decisão 14)';
COMMENT ON COLUMN connection_processes.total_with_fees_cents IS
  'Contribuição + 4% + 6% quando fee_applies; a própria contribuição com o Poder Público';
