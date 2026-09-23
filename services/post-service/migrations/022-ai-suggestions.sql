-- Migração 022: sugestões de inteligência artificial (T23).
--
-- Fonte: dm-docs/fonte-da-verdade/01-apresentacao-institucional.html,
-- slide 23 ("Inteligência artificial": organização automática de demandas,
-- detecção de urgência, sugestão de editais, conexão com patrocinadores ideais
-- e geração de relatórios para governo). Decisão 6
-- (dm-docs/fonte-da-verdade/decisoes-de-implementacao.md): os recursos de
-- IA usam a API do Claude, ficam atrás de uma flag desligada por padrão e
-- **nunca bloqueiam o fluxo** se falharem. GPT não é usado para isso.
--
-- Regra que todo este schema sustenta: **a IA só sugere**. Nada aqui altera
-- demanda, post, apoio, dossiê ou prestação de contas. A sugestão é uma linha
-- própria, marcada como sugestão de IA, que uma pessoa aceita ou ignora; a
-- alteração do dado continua sendo feita pelas rotas normais da demanda, pela
-- pessoa. Por isso `ai_suggestions` não tem nenhuma FK de escrita para as
-- tabelas do fluxo e o dossiê (009) e a prestação de contas (015) não a leem.
--
-- - `ai_suggestions`: uma sugestão gerada pelo modelo. Guarda o tipo (os 5 da
--   fonte), a demanda ou o órgão a que se refere, quem pediu, o modelo usado,
--   **a lista dos campos enviados ao modelo** (`prompt_fields`, para auditoria
--   do que saiu da plataforma), o conteúdo sugerido (`payload`), a
--   justificativa em texto (`rationale`) e os números verificáveis que
--   acompanham a sugestão (`evidence`). Conteúdo imutável: depois de gravada,
--   só o desfecho humano muda (`status` sugerida → aceita | ignorada, com
--   `reviewed_by`/`reviewed_at`/`review_note`). Nada é excluído.
-- - `ai_usage_log`: registro de uso, **append-only** (sem UPDATE, sem DELETE),
--   para auditoria e controle de custo. Uma linha por chamada tentada,
--   inclusive as que não chegaram ao modelo (`desligado`, `sem_chave`,
--   `limite`, `circuito`), com latência e tokens quando houver.
-- - A gestão (`gestao_app`) só lê (grant no dm-infra,
--   db/migrations/gestao/022-gestao-app-post-ai.sql).
--
-- Dado pessoal: nenhuma coluna aqui guarda nome, e-mail, telefone ou endereço
-- fino. `requested_by` é o id da conta que pediu (já é o que as demais tabelas
-- do fluxo guardam) e existe para o limite de custo e para a auditoria.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- Os 5 recursos do slide 23, nesta ordem.
DO $$ BEGIN
  CREATE TYPE ai_suggestion_kind AS ENUM (
    'organizacao_da_demanda', 'deteccao_de_urgencia', 'sugestao_de_editais',
    'conexao_com_patrocinadores', 'relatorio_para_governo'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Desfecho humano. `sugerida` é o estado inicial; aceitar **não** altera a
-- demanda: registra a decisão, e a alteração é feita pela rota da demanda.
DO $$ BEGIN
  CREATE TYPE ai_suggestion_status AS ENUM ('sugerida', 'aceita', 'ignorada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ai_call_outcome AS ENUM (
    'sucesso', 'erro', 'desligado', 'sem_chave', 'limite', 'circuito', 'resposta_invalida'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            ai_suggestion_kind NOT NULL,
  -- Demanda de referência (os 4 recursos do fluxo do Agente) ou órgão (o
  -- relatório para governo). `demands_guard` continua dono da demanda: esta
  -- FK é só de leitura/vínculo, e é RESTRICT porque nada é excluído.
  demand_id       UUID REFERENCES demands(id) ON DELETE RESTRICT,
  organization_id UUID,
  requested_by    UUID NOT NULL,
  requester_role  VARCHAR(20) NOT NULL CHECK (requester_role IN ('agente', 'poder_publico')),
  -- Modelo que respondeu (ex.: claude-opus-5). Fica gravado para auditoria.
  model           VARCHAR(80) NOT NULL CHECK (btrim(model) <> ''),
  -- Campos enviados ao modelo, pelo nome (ex.: 'titulo', 'descricao').
  -- Documentado em services/post-service/src/ai/redaction.js.
  prompt_fields   TEXT[] NOT NULL DEFAULT '{}',
  -- Conteúdo sugerido, no formato do tipo (src/ai/constants.js).
  payload         JSONB NOT NULL DEFAULT '{}',
  -- Justificativa em texto, sempre exibida junto da sugestão.
  rationale       TEXT CHECK (rationale IS NULL OR char_length(rationale) <= 4000),
  -- Números verificáveis que a interface mostra ao lado do texto da IA.
  evidence        JSONB NOT NULL DEFAULT '{}',

  status          ai_suggestion_status NOT NULL DEFAULT 'sugerida',
  reviewed_by     UUID,
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_suggestions_subject CHECK (
    (kind = 'relatorio_para_governo' AND organization_id IS NOT NULL)
    OR (kind <> 'relatorio_para_governo' AND demand_id IS NOT NULL)
  ),
  CONSTRAINT ai_suggestions_review_pair CHECK (
    (status = 'sugerida' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'sugerida' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_demand
  ON ai_suggestions(demand_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_organization
  ON ai_suggestions(organization_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_requester
  ON ai_suggestions(requested_by, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            ai_suggestion_kind NOT NULL,
  demand_id       UUID,
  organization_id UUID,
  requested_by    UUID,
  model           VARCHAR(80),
  outcome         ai_call_outcome NOT NULL,
  -- Código curto do motivo quando `outcome` não é `sucesso`.
  error_code      VARCHAR(60) CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]+$'),
  latency_ms      INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  input_tokens    INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens   INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  suggestion_id   UUID REFERENCES ai_suggestions(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leitura do limite de custo por período: conta as chamadas que chegaram ao
-- modelo numa janela.
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_window ON ai_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_requester ON ai_usage_log(requested_by, created_at DESC);

-- ---------------------------------------------------------------------------
-- Guardas.

CREATE OR REPLACE FUNCTION ai_suggestions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê as sugestões de IA' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sugestão de IA não é excluída' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'sugerida' THEN
      RAISE EXCEPTION 'a sugestão nasce como sugerida, à espera de revisão humana'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := NOW();
    RETURN NEW;
  END IF;

  -- Só o desfecho humano muda. O que o modelo produziu fica como está.
  IF (NEW.id, NEW.kind, NEW.demand_id, NEW.organization_id, NEW.requested_by,
      NEW.requester_role, NEW.model, NEW.prompt_fields, NEW.payload, NEW.rationale,
      NEW.evidence, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.kind, OLD.demand_id, OLD.organization_id, OLD.requested_by,
      OLD.requester_role, OLD.model, OLD.prompt_fields, OLD.payload, OLD.rationale,
      OLD.evidence, OLD.created_at) THEN
    RAISE EXCEPTION 'o conteúdo da sugestão de IA não muda; só o desfecho humano'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'sugerida' THEN
    RAISE EXCEPTION 'a sugestão já foi revisada' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'sugerida' THEN
    RAISE EXCEPTION 'informe o desfecho: aceita ou ignorada' USING ERRCODE = 'check_violation';
  END IF;
  NEW.reviewed_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION ai_usage_log_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê o registro de uso da IA' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := NOW();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'o registro de uso da IA é somente acréscimo' USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE OR REPLACE FUNCTION ai_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% não é apagada', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS ai_suggestions_guard ON ai_suggestions;
CREATE TRIGGER ai_suggestions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION ai_suggestions_guard();

DROP TRIGGER IF EXISTS ai_suggestions_no_truncate ON ai_suggestions;
CREATE TRIGGER ai_suggestions_no_truncate
  BEFORE TRUNCATE ON ai_suggestions
  FOR EACH STATEMENT EXECUTE FUNCTION ai_no_truncate();

DROP TRIGGER IF EXISTS ai_usage_log_guard ON ai_usage_log;
CREATE TRIGGER ai_usage_log_guard
  BEFORE INSERT OR UPDATE OR DELETE ON ai_usage_log
  FOR EACH ROW EXECUTE FUNCTION ai_usage_log_guard();

DROP TRIGGER IF EXISTS ai_usage_log_no_truncate ON ai_usage_log;
CREATE TRIGGER ai_usage_log_no_truncate
  BEFORE TRUNCATE ON ai_usage_log
  FOR EACH STATEMENT EXECUTE FUNCTION ai_no_truncate();
