-- Migração 006: campos que o Sistema de Gestão (dm-gestao) mantém ao validar
-- uma organização. Veio de dmconecta-infra/db/migrations/user/ (defeito D6):
-- o dm-api passou a ser a fonte única do schema. Nenhuma linha é inserida.
--
-- Idempotente: pode rodar de novo.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS verified_by VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_organizations_verified_at
  ON organizations(verified_at);
