-- Migração 005: o Poder Público publica `message` (roles.js), mas o enum
-- `post_type` não tinha esse valor e toda publicação do governo terminava em
-- 500 (defeito D2).
--
-- Idempotente: pode rodar de novo (ADD VALUE IF NOT EXISTS fora de transação).

ALTER TYPE post_type ADD VALUE IF NOT EXISTS 'message';
