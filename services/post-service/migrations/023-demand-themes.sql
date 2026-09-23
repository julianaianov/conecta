-- Migração 023: eixos temáticos da demanda e inteligência territorial (T26).
--
-- Fonte: dm-docs/fonte-da-verdade/01-apresentacao-institucional.html,
-- slide 26 ("Dados e inteligência territorial como ativo"): "a plataforma
-- constrói um mapa contínuo das demandas e necessidades dos territórios" e
-- "essas informações permitem identificar padrões, prioridades e oportunidades
-- de atuação por território", com os nove eixos exibidos no slide — Iluminação,
-- Segurança, Saneamento, Limpeza, Esporte, Educação, Mobilidade, Cultura e
-- Meio Ambiente.
--
-- Decisões desta migração (a fonte lista os eixos, mas não diz como coletá-los):
--
-- - **Tabela de vínculo, não coluna.** Um problema de território costuma cruzar
--   mais de um eixo (uma praça abandonada é Limpeza + Segurança + Esporte). O
--   slide mostra os eixos como leitura do território, não como classificação
--   única — então a demanda tem *um ou mais* eixos, em `demand_themes`.
--   A categoria (as 5 da fonte) continua sendo a classificação única e
--   obrigatória; o eixo é o recorte temático que ela não dá.
-- - **Opcional.** A lista de campos obrigatórios da demanda está escrita no
--   Fluxo 2 (fotografia, localização com CEP, orçamento, cronograma, território,
--   descrição, objetivo, justificativa, público beneficiado e prioridade) e o
--   eixo não está nela. Tornar o eixo obrigatório seria inventar regra de
--   negócio que a fonte não tem e bloquear o envio de demandas já em rascunho.
--   Por isso `demand_themes` pode ficar vazia: a interface incentiva o
--   preenchimento e a IA da T23 sugere (sugestão revisável, nunca aplicada
--   sozinha), mas `demand_assert_submittable` não exige.
-- - **Índice para agregação.** A inteligência territorial lê eixo × território;
--   `idx_demand_themes_theme` serve a agregação por eixo e a chave primária
--   (demanda, eixo) serve a leitura por demanda.
--
-- Contrato com o dm-gestao: dm-docs/gestao/04-modelagem-de-dados.md §3.19
-- (somente leitura; grant em dmconecta-infra/db/migrations/gestao/023).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- Os nove eixos do slide 26, na ordem em que aparecem lá.
DO $$ BEGIN
  CREATE TYPE demand_theme AS ENUM (
    'iluminacao', 'seguranca', 'saneamento', 'limpeza', 'esporte',
    'educacao', 'mobilidade', 'cultura', 'meio_ambiente'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS demand_themes (
  demand_id   UUID NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  theme       demand_theme NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (demand_id, theme)
);

-- Agregação por eixo (eixo × território do painel de governo, da gestão e da
-- página pública): o eixo vem primeiro porque é sempre o recorte; a demanda
-- completa o índice para a junção com `demands`.
CREATE INDEX IF NOT EXISTS idx_demand_themes_theme ON demand_themes(theme, demand_id);

-- Os eixos acompanham o conteúdo da demanda: só mudam enquanto ela está em
-- rascunho ou devolvida, como os demais itens (demand_items_guard da migração
-- 007), e a gestão nunca escreve.
CREATE OR REPLACE FUNCTION demand_themes_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  st     demand_status;
  rs     demand_review_state;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os eixos temáticos da demanda' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'o eixo temático não é alterado: remova e inclua' USING ERRCODE = 'check_violation';
  END IF;
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD.demand_id ELSE NEW.demand_id END;
  SELECT status, review_state INTO st, rs FROM demands WHERE id = target;
  IF FOUND AND NOT (st = 'em_analise' AND rs IN ('rascunho', 'devolvida')) THEN
    RAISE EXCEPTION 'demand_themes só muda com a demanda em rascunho ou devolvida (estado: %/%)', st, rs
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  NEW.created_at := NOW();
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION demand_themes_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS demand_themes_guard ON demand_themes;
CREATE TRIGGER demand_themes_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_themes
  FOR EACH ROW EXECUTE FUNCTION demand_themes_guard();
