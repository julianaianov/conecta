-- Migração 007: cria a linha em `profiles` para toda conta de auth_db.users
-- que ainda não tem perfil (defeito D1 / tarefa T01).
--
-- auth_db e user_db são bancos separados, então a migração lê as contas pela
-- entrada padrão do psql (`pstdin`) em CSV, exportadas do auth_db. Só são
-- copiados os campos que o perfil precisa: id, nome, avatar, categoria,
-- subperfil e data de criação. E-mail e hash de senha nunca saem do auth_db.
--
-- Idempotente: `ON CONFLICT (user_id) DO NOTHING` preserva perfis existentes.
--
-- No host (um PostgreSQL com os três bancos), por SSM:
--
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d auth_db -At \
--     -c "\copy (SELECT id, name, avatar_url, role, profile_type, created_at FROM users) TO STDOUT WITH (FORMAT csv)" \
--   | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d user_db \
--     --set ON_ERROR_STOP=1 -f /opt/conecta/services/user-service/migrations/007-profiles-backfill.sql
--
-- Local (um container por banco):
--
--   docker compose cp services/user-service/migrations/007-profiles-backfill.sql user-db:/tmp/007.sql
--   docker compose exec -T auth-db psql -U postgres -d auth_db -At \
--     -c "\copy (SELECT id, name, avatar_url, role, profile_type, created_at FROM users) TO STDOUT WITH (FORMAT csv)" \
--   | docker compose exec -T user-db psql -U postgres -d user_db --set ON_ERROR_STOP=1 -f /tmp/007.sql

BEGIN;

CREATE TEMP TABLE auth_users_backfill (
  id           UUID PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  avatar_url   VARCHAR(500),
  role         VARCHAR(50)  NOT NULL,
  profile_type VARCHAR(50),
  created_at   TIMESTAMPTZ
) ON COMMIT DROP;

\copy auth_users_backfill (id, name, avatar_url, role, profile_type, created_at) FROM pstdin WITH (FORMAT csv)

INSERT INTO profiles (user_id, name, avatar_url, role, profile_type, member_since, created_at, updated_at)
SELECT id, name, avatar_url, role, profile_type, COALESCE(created_at, NOW()), NOW(), NOW()
  FROM auth_users_backfill
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
