-- Migração: 5 papéis → 4 categorias de perfil + subperfil (tabela profiles).
-- Espelha services/auth-service/migrations/001-perfis-4-categorias.sql.
--
--   docker compose exec -T user-db psql -U postgres -d user_db \
--     < services/user-service/migrations/001-perfis-4-categorias.sql

BEGIN;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_type VARCHAR(50);

UPDATE profiles SET profile_type = 'ong'        WHERE role = 'organization' AND profile_type IS NULL;
UPDATE profiles SET profile_type = 'associacao' WHERE role = 'association'  AND profile_type IS NULL;
UPDATE profiles SET profile_type = 'empresa'    WHERE role = 'business'     AND profile_type IS NULL;
UPDATE profiles SET profile_type = 'prefeitura' WHERE role = 'government'   AND profile_type IS NULL;
UPDATE profiles SET profile_type = 'morador'    WHERE role = 'citizen'      AND profile_type IS NULL;

UPDATE profiles SET role = 'community'     WHERE role IN ('organization', 'association');
UPDATE profiles SET role = 'partner'       WHERE role = 'business';
UPDATE profiles SET role = 'institutional' WHERE role = 'government';

COMMIT;
