-- Migração 013: vínculo de usuários a organizações com níveis de permissão (T29).
--
-- Fonte: dm-docs/fonte-da-verdade/DM_Conecta_Arquitetura_de_Perfis_e_Fluxo_do_Ecossistema.html,
-- §4 ("Membros da Comunidade não publicam demandas ou projetos em nome de uma
-- organização ou comunidade sem vínculo/autorização. No futuro, o sistema pode
-- permitir vínculo de usuários a organizações com diferentes níveis de
-- permissão") e §5 ("Usuários individuais poderão futuramente estar vinculados
-- a organizações e receber permissões delegadas"); Modelo de Conexão §32
-- (vários usuários por instituição). O vínculo existe desde já, com três
-- níveis; o que muda para o resto do produto é a **delegação**: a conta
-- vinculada age em nome da instituição validada (GET /me/institution/status
-- devolve `delegation`).
--
-- Decisões:
-- - `organization_members`: uma linha por (instituição, conta) e ciclo
--   `convidado` → `ativo` | `recusado`; `ativo` → `removido` | `saiu`. Estados
--   finais não voltam: um convite novo é linha nova.
-- - Só instituição com cadastro institucional (`institution_kind` não nulo).
-- - **Um vínculo ativo por conta** (índice parcial): uma pessoa atua em nome
--   de uma instituição por vez. Um convite em aberto por (instituição, conta).
-- - Níveis (`src/organization-members.js`): `gestor` (gere vínculos e tudo o
--   que o publicador faz), `publicador` (publica demandas e eventos, atua
--   institucionalmente, atualiza resultados, vê documentos), `colaborador`
--   (vê documentos). O nível só muda com o vínculo em `convidado` ou `ativo`.
-- - Quem convida, muda nível e remove: o titular (conta do perfil dono da
--   organização) ou membro ativo `gestor` — regra na rota; o banco guarda quem
--   convidou. A gestão só lê (grant SELECT herdado do dm-infra 003).
-- - Nada é excluído; LGPD: a eliminação da conta encerra o vínculo (`saiu`) e
--   recusa convites abertos (src/privacy/store.js).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

CREATE TABLE IF NOT EXISTS organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  level           VARCHAR(20) NOT NULL CHECK (level IN ('gestor', 'publicador', 'colaborador')),
  status          VARCHAR(20) NOT NULL DEFAULT 'convidado'
                    CHECK (status IN ('convidado', 'ativo', 'recusado', 'removido', 'saiu')),
  invited_by      UUID NOT NULL,
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uma conta atua em nome de uma instituição por vez; um convite em aberto por par.
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_members_active_user
  ON organization_members(user_id) WHERE status = 'ativo';
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_members_open_invite
  ON organization_members(organization_id, user_id) WHERE status = 'convidado';
CREATE INDEX IF NOT EXISTS idx_organization_members_org
  ON organization_members(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organization_members_user
  ON organization_members(user_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION organization_member_transition_allowed(from_status TEXT, to_status TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT (from_status = 'convidado' AND to_status IN ('ativo', 'recusado'))
      OR (from_status = 'ativo' AND to_status IN ('removido', 'saiu'));
$$;

CREATE OR REPLACE FUNCTION organization_members_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  is_gestao BOOLEAN := session_user = 'gestao_app';
BEGIN
  IF is_gestao THEN
    RAISE EXCEPTION 'a gestão só lê os vínculos da instituição' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'vínculo não é excluído' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'convidado' THEN
      RAISE EXCEPTION 'o vínculo nasce como convite' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = NEW.organization_id AND institution_kind IS NOT NULL) THEN
      RAISE EXCEPTION 'só instituição com cadastro institucional tem vínculos' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.user_id <> OLD.user_id
     OR NEW.invited_by <> OLD.invited_by OR NEW.invited_at <> OLD.invited_at OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'instituição, conta e convite do vínculo são imutáveis' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status <> OLD.status THEN
    IF NOT organization_member_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'transição de vínculo não permitida: % → %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('ativo', 'recusado') THEN NEW.responded_at := COALESCE(NEW.responded_at, NOW()); END IF;
    IF NEW.status IN ('removido', 'saiu') THEN NEW.ended_at := COALESCE(NEW.ended_at, NOW()); END IF;
  END IF;
  IF NEW.level <> OLD.level AND OLD.status NOT IN ('convidado', 'ativo') THEN
    RAISE EXCEPTION 'nível só muda com o vínculo em convite ou ativo' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS organization_members_guard ON organization_members;
CREATE TRIGGER organization_members_guard
  BEFORE INSERT OR UPDATE OR DELETE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION organization_members_guard();

CREATE OR REPLACE FUNCTION organization_members_block_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'vínculos não são truncados' USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS organization_members_block_truncate ON organization_members;
CREATE TRIGGER organization_members_block_truncate
  BEFORE TRUNCATE ON organization_members
  FOR EACH STATEMENT EXECUTE FUNCTION organization_members_block_truncate();
