-- Migração: 5 papéis → 4 categorias de perfil + subperfil.
--
-- Os init.sql só rodam em volume novo (docker-entrypoint-initdb.d), então
-- bancos já existentes precisam desta migração. Idempotente: pode rodar de novo.
--
--   docker compose exec -T auth-db psql -U postgres -d auth_db \
--     < services/auth-service/migrations/001-perfis-4-categorias.sql

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_type VARCHAR(50);

-- Papéis antigos → categoria nova. O subperfil recebe o equivalente mais
-- próximo do papel antigo; quem era 'organization' vira ONG, 'association'
-- vira Associação — ambos agora dentro de "Comunidade".
UPDATE users SET profile_type = 'ong'         WHERE role = 'organization' AND profile_type IS NULL;
UPDATE users SET profile_type = 'associacao'  WHERE role = 'association'  AND profile_type IS NULL;
UPDATE users SET profile_type = 'empresa'     WHERE role = 'business'     AND profile_type IS NULL;
UPDATE users SET profile_type = 'prefeitura'  WHERE role = 'government'   AND profile_type IS NULL;
UPDATE users SET profile_type = 'morador'     WHERE role = 'citizen'      AND profile_type IS NULL;

UPDATE users SET role = 'community'     WHERE role IN ('organization', 'association');
UPDATE users SET role = 'partner'       WHERE role = 'business';
UPDATE users SET role = 'institutional' WHERE role = 'government';
-- 'citizen' permanece 'citizen'.

COMMIT;
