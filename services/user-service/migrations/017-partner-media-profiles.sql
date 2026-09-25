-- Migração 017: perfil empresarial do Parceiro e perfil profissional ou
-- institucional da Comunicação (T-04-03).
--
-- Fonte da verdade: Arquitetura de Perfis §3.3 ("Criar perfil empresarial") e
-- §3.5 ("Criar perfil profissional/institucional"); §2 (Parceiros: Empresa,
-- Patrocinador, Comércio Local, Marca; Comunicação: Imprensa, Veículos de
-- Comunicação, Jornalistas). Decisão 18: dados **declarados** pela própria
-- conta e exibidos sem validação da gestão e sem selo, com o aviso "informado
-- pela própria conta". A gestão só valida quem publica ou articula (decisão 2).
--
-- - `business_profiles` (Parceiro): razão social ou nome da empresa, CNPJ
--   opcional (14 posições normalizadas; o user-service confere os dígitos),
--   segmento, descrição e site.
-- - `media_profiles` (Comunicação): veículo ou instituição, registro
--   profissional (privado: conta e gestão), área de cobertura, descrição e site.
--
-- Uma linha por conta. Públicos: nome, CNPJ (formatado), segmento/área de
-- cobertura, descrição e site; nunca contato nem o registro profissional.
-- A eliminação LGPD apaga as duas linhas (preferência declarada, sem valor de
-- prova). A gestão só lê (SELECT padrão do gestao_app e grant explícito do
-- dm-infra `db/migrations/gestao/033-gestao-app-user-profiles.sql`).
--
-- Idempotente: o deploy reaplica o manifesto inteiro.

CREATE TABLE IF NOT EXISTS business_profiles (
  user_id       UUID PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  company_name  VARCHAR(255) NOT NULL CHECK (btrim(company_name) <> ''),
  cnpj          VARCHAR(14) CHECK (cnpj IS NULL OR cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  segment       VARCHAR(120),
  description   TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  website       VARCHAR(500) CHECK (website IS NULL OR website ~ '^https?://'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_profiles (
  user_id                UUID PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  outlet_name            VARCHAR(255) NOT NULL CHECK (btrim(outlet_name) <> ''),
  professional_registry  VARCHAR(60),
  coverage_area          VARCHAR(255),
  description            TEXT CHECK (description IS NULL OR char_length(description) <= 2000),
  website                VARCHAR(500) CHECK (website IS NULL OR website ~ '^https?://'),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
