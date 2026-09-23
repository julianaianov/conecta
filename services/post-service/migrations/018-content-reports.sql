-- Migração 018: denúncia de conteúdo e de perfil pelo portal (T6.3).
--
-- Fonte: dm-docs/fonte-da-verdade/01-apresentacao-institucional.html,
-- slide 26 (Governança: LGPD, neutralidade político-partidária e publicação
-- apenas de dados verificáveis) — a moderação da plataforma precisa de uma
-- entrada de denúncia feita por quem usa o portal. Contrato com o dm-gestao:
-- dm-docs/gestao/04-modelagem-de-dados.md §3.14.
--
-- Até aqui a fila de moderação do dm-gestao lia `reports` do `gestao_db`, uma
-- tabela que nenhum serviço do portal escrevia: a fila ficava sempre vazia.
-- A denúncia passa a nascer aqui, em `post_db.content_reports`, e o dm-gestao
-- lê essa tabela e grava só o desfecho.
--
-- - Alvo (`target_kind`): `publicacao` (posts), `comentario` (comments),
--   `demanda` (demands) e `perfil` (a conta em auth_db.users — outra base, sem
--   FK; o portal confere só que não é a própria conta e a gestão resolve a
--   identidade ao abrir a denúncia). Post, comentário e demanda também ficam
--   sem FK: a denúncia é registro de moderação e sobrevive ao alvo, que pode
--   ser ocultado ou arquivado depois.
-- - Motivo (`reason`): os seis da tela — conteúdo impróprio, informação falsa,
--   spam, discurso de ódio, dado pessoal indevido e outro (que exige
--   descrição). A descrição é opcional nos demais.
-- - Retrato do alvo (`target_owner_id`, `target_summary`): gravado no momento
--   da denúncia para a fila da gestão não depender de junção entre bancos nem
--   de o conteúdo continuar existindo.
-- - Append-only: nada é excluído nem editado. Quem denunciou, o alvo, o motivo
--   e a descrição são imutáveis; a gestão grava só o desfecho
--   (`status`, `resolution`, `resolution_note`, `resolved_by`, `resolved_at`).
-- - Uma denúncia em aberto por (denunciante, alvo): índice único parcial. Quem
--   já denunciou e ainda espera desfecho não abre outra; depois do desfecho,
--   pode denunciar de novo se o problema voltar.
-- - O denunciado nunca é avisado: não há evento na linha do tempo, não há rota
--   que liste denúncias por alvo e o autor do conteúdo não vê nada. Quem
--   denunciou também não recebe o resultado (a rota devolve só "em apuração" ou
--   "analisada"), para não virar canal de retaliação.
-- - LGPD: `reporter_id` é a conta que denunciou; na gestão ela aparece
--   pseudonimizada (moderator) e a revelação é auditada e restrita a admin+
--   (dm-docs/gestao/05-lgpd.md).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

DO $$ BEGIN
  CREATE TYPE report_target_kind AS ENUM ('publicacao', 'comentario', 'demanda', 'perfil');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_reason AS ENUM (
    'conteudo_improprio', 'informacao_falsa', 'spam',
    'discurso_de_odio', 'dado_pessoal_indevido', 'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- `pendente` (entrou na fila) → `em_analise` (a gestão assumiu) → desfecho
-- `procedente` | `improcedente`. O desfecho é final.
DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('pendente', 'em_analise', 'procedente', 'improcedente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Providência registrada junto com o desfecho. `ocultar_publicacao` é a
-- moderação por visibilidade que o dm-gestao já tem (decisão 7): a denúncia
-- procedente de publicação pode ser resolvida ocultando o post.
DO $$ BEGIN
  CREATE TYPE report_resolution AS ENUM (
    'ocultar_publicacao', 'advertencia_ao_autor', 'outra_providencia', 'conteudo_mantido'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS content_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind           report_target_kind NOT NULL,
  target_id             UUID NOT NULL,
  -- Retrato do alvo no momento da denúncia (sem FK, ver o cabeçalho).
  target_owner_id       UUID,
  target_summary        VARCHAR(500),
  -- Conta que denunciou (auth_db.users.id) e retrato do perfil dela.
  reporter_id           UUID NOT NULL,
  reporter_category     VARCHAR(20) NOT NULL
                          CHECK (reporter_category IN ('agent', 'member', 'partner', 'government', 'media')),
  reporter_profile_type VARCHAR(50),
  reason                report_reason NOT NULL,
  description           TEXT CHECK (description IS NULL
                                    OR (btrim(description) <> '' AND char_length(description) <= 2000)),
  status                report_status NOT NULL DEFAULT 'pendente',
  resolution            report_resolution,
  resolution_note       TEXT CHECK (resolution_note IS NULL
                                    OR (btrim(resolution_note) <> '' AND char_length(resolution_note) <= 2000)),
  -- Quem despachou, na forma `gestao:<id do admin>` (admins vivem no gestao_db).
  resolved_by           VARCHAR(255),
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- "Outro" só vale com a descrição do que houve.
  CONSTRAINT content_reports_other_reason CHECK (
    reason <> 'outro' OR (description IS NOT NULL AND btrim(description) <> '')),
  -- Ninguém denuncia o próprio perfil.
  CONSTRAINT content_reports_not_self CHECK (
    target_kind <> 'perfil' OR target_id <> reporter_id),
  -- Desfecho completo ou ausente; em aberto, nada de parecer.
  CONSTRAINT content_reports_resolution CHECK (
    CASE
      WHEN status IN ('pendente', 'em_analise')
        THEN resolution IS NULL AND resolution_note IS NULL
             AND resolved_by IS NULL AND resolved_at IS NULL
      ELSE resolution IS NOT NULL AND resolution_note IS NOT NULL
           AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
    END),
  -- A providência combina com o desfecho.
  CONSTRAINT content_reports_resolution_kind CHECK (
    resolution IS NULL
    OR (status = 'improcedente') = (resolution = 'conteudo_mantido')),
  -- Ocultar publicação só resolve denúncia de publicação.
  CONSTRAINT content_reports_hide_target CHECK (
    resolution IS DISTINCT FROM 'ocultar_publicacao' OR target_kind = 'publicacao')
);

-- Uma denúncia em aberto por (denunciante, alvo).
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_reports_open
  ON content_reports(reporter_id, target_kind, target_id)
  WHERE status IN ('pendente', 'em_analise');
-- Fila da gestão (pendentes primeiro, mais antigas no topo).
CREATE INDEX IF NOT EXISTS idx_content_reports_queue
  ON content_reports(status, created_at);
-- Denúncias de um alvo (a análise agrupa por conteúdo).
CREATE INDEX IF NOT EXISTS idx_content_reports_target
  ON content_reports(target_kind, target_id, created_at DESC);
-- Limite de taxa por conta e "minhas denúncias".
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter
  ON content_reports(reporter_id, created_at DESC);

CREATE OR REPLACE FUNCTION content_reports_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'denúncias não são excluídas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF session_user = 'gestao_app' THEN
      RAISE EXCEPTION 'a denúncia nasce no portal; a gestão só despacha' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status <> 'pendente' THEN
      RAISE EXCEPTION 'a denúncia nasce pendente' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.target_owner_id IS NOT NULL AND NEW.target_owner_id = NEW.reporter_id THEN
      RAISE EXCEPTION 'ninguém denuncia o próprio conteúdo' USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.target_kind, NEW.target_id, NEW.target_owner_id, NEW.target_summary,
      NEW.reporter_id, NEW.reporter_category, NEW.reporter_profile_type,
      NEW.reason, NEW.description, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.target_kind, OLD.target_id, OLD.target_owner_id, OLD.target_summary,
      OLD.reporter_id, OLD.reporter_category, OLD.reporter_profile_type,
      OLD.reason, OLD.description, OLD.created_at) THEN
    RAISE EXCEPTION 'quem denunciou, o alvo, o motivo e a descrição não mudam'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status IN ('procedente', 'improcedente') THEN
    RAISE EXCEPTION 'denúncia despachada não muda' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = OLD.status AND (NEW.resolution, NEW.resolution_note, NEW.resolved_by)
     IS NOT DISTINCT FROM (OLD.resolution, OLD.resolution_note, OLD.resolved_by) THEN
    RAISE EXCEPTION 'atualização sem mudança de desfecho' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'pendente' THEN
    RAISE EXCEPTION 'a denúncia não volta para pendente' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('procedente', 'improcedente') THEN
    NEW.resolved_at := NOW();
  ELSE
    NEW.resolved_at := NULL;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION content_reports_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'content_reports não é apagada' USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS content_reports_guard ON content_reports;
CREATE TRIGGER content_reports_guard
  BEFORE INSERT OR UPDATE OR DELETE ON content_reports
  FOR EACH ROW EXECUTE FUNCTION content_reports_guard();

DROP TRIGGER IF EXISTS content_reports_block_truncate ON content_reports;
CREATE TRIGGER content_reports_block_truncate
  BEFORE TRUNCATE ON content_reports
  FOR EACH STATEMENT EXECUTE FUNCTION content_reports_no_truncate();
