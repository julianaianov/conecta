-- Migração: 4 categorias → 5 categorias do ecossistema (docs/perfis-e-permissoes.md).
--
--   community     → agent       (Agentes de Transformação)
--   citizen       → member      (Membros da Comunidade)
--   partner       → partner     (Parceiros)
--   institutional → government  (Poder Público) ou media (Comunicação, subperfil imprensa)
--
-- Idempotente: pode rodar de novo. Roda depois da 001.
--
--   docker compose exec -T user-db psql -U postgres -d user_db \
--     < services/user-service/migrations/002-perfis-5-categorias.sql

BEGIN;

UPDATE profiles SET role = 'media'      WHERE role = 'institutional' AND profile_type = 'imprensa';
UPDATE profiles SET role = 'government' WHERE role = 'institutional';
UPDATE profiles SET role = 'agent'      WHERE role = 'community';
UPDATE profiles SET role = 'member'     WHERE role = 'citizen';

ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'member';

COMMIT;
