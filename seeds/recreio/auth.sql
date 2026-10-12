-- Seed oficial de usuários — Recreio dos Bandeirantes, Rio de Janeiro
-- Contas do ecossistema DM Conecta com perfis canônicos.
-- Senha de todos os usuários de demonstração/teste: demo123
-- Hash bcrypt ($2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16)

INSERT INTO users (id, email, password_hash, name, avatar_url, role, profile_type, created_at, updated_at) VALUES
  -- ── 1. Agentes de Transformação (agent) ──────────────────────────────────────────
  ('11111111-0001-4000-8000-000000000001',
   'contato@recreioverde.org.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Associação Recreio Verde',
   '/images/stock/avatar-lider.jpg',
   'agent', 'associacao', NOW() - INTERVAL '180 days', NOW()),

  ('11111111-0001-4000-8000-000000000002',
   'coletivo@recreiocultural.org.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Coletivo Cultural Recreio',
   '/images/stock/avatar-lider.jpg',
   'agent', 'coletivo', NOW() - INTERVAL '150 days', NOW()),

  ('11111111-0001-4000-8000-000000000003',
   'contato@criancafelizrecreio.org.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Instituto Criança Feliz Recreio',
   '/images/stock/avatar-lider.jpg',
   'agent', 'instituto', NOW() - INTERVAL '120 days', NOW()),

  ('11111111-0001-4000-8000-000000000004',
   'amorterreirao@gmail.com',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Associação de Moradores do Terreirão',
   '/images/stock/avatar-lider.jpg',
   'agent', 'associacao', NOW() - INTERVAL '210 days', NOW()),

  ('11111111-0001-4000-8000-000000000005',
   'ondalimpa@recreiosurf.org.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Projeto Onda Limpa Recreio',
   '/images/stock/avatar-lider.jpg',
   'agent', 'projeto_social', NOW() - INTERVAL '90 days', NOW()),

  -- ── 2. Membros da Comunidade (member) ───────────────────────────────────────────
  ('22222222-0001-4000-8000-000000000001',
   'maria.silva@recreio.conecta',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Maria Silva',
   '/images/stock/avatar-moradora.jpg',
   'member', 'morador', NOW() - INTERVAL '300 days', NOW()),

  ('22222222-0001-4000-8000-000000000002',
   'joao.pereira@recreio.conecta',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'João Pereira',
   NULL,
   'member', 'voluntario', NOW() - INTERVAL '160 days', NOW()),

  ('22222222-0001-4000-8000-000000000003',
   'carlos.mendes@recreio.conecta',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Carlos Mendes',
   NULL,
   'member', 'morador', NOW() - INTERVAL '140 days', NOW()),

  ('22222222-0001-4000-8000-000000000004',
   'fernanda.lima@recreio.conecta',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Fernanda Lima',
   NULL,
   'member', 'jovem', NOW() - INTERVAL '110 days', NOW()),

  ('22222222-0001-4000-8000-000000000005',
   'ana.beatriz@recreio.conecta',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Ana Beatriz Souza',
   NULL,
   'member', 'voluntario', NOW() - INTERVAL '80 days', NOW()),

  -- ── 3. Parceiros (partner) ───────────────────────────────────────────────────────
  ('33333333-0001-4000-8000-000000000001',
   'contato@recreionovoconstrutora.com.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Construtora Recreio Novo Ltda',
   '/images/stock/avatar-empresa.jpg',
   'partner', 'empresa', NOW() - INTERVAL '240 days', NOW()),

  ('33333333-0001-4000-8000-000000000002',
   'padaria@paoquenterecreio.com.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Padaria Pão Quente do Recreio',
   NULL,
   'partner', 'comercio_local', NOW() - INTERVAL '200 days', NOW()),

  ('33333333-0001-4000-8000-000000000003',
   'contato@superbomprecorecreio.com.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Supermercado Bom Preço Recreio',
   NULL,
   'partner', 'comercio_local', NOW() - INTERVAL '170 days', NOW()),

  ('33333333-0001-4000-8000-000000000004',
   'financeiro@studiofitnessrecreio.com.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Studio Fitness Recreio',
   NULL,
   'partner', 'patrocinador', NOW() - INTERVAL '130 days', NOW()),

  ('33333333-0001-4000-8000-000000000005',
   'quiosque@pontaldapraia.com.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Quiosque Pontal da Praia',
   NULL,
   'partner', 'comercio_local', NOW() - INTERVAL '95 days', NOW()),

  -- ── 4. Poder Público (government) ────────────────────────────────────────────────
  ('44444444-0001-4000-8000-000000000001',
   'subprefeitura.recreio@rio.rj.gov.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Subprefeitura da Barra, Recreio e Vargens',
   '/images/stock/avatar-governo.jpg',
   'government', 'prefeitura', NOW() - INTERVAL '365 days', NOW()),

  ('44444444-0001-4000-8000-000000000002',
   'meioambiente.recreio@rio.rj.gov.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Secretaria Municipal de Meio Ambiente e Clima - RJ',
   '/images/stock/avatar-governo.jpg',
   'government', 'secretaria', NOW() - INTERVAL '320 days', NOW()),

  ('44444444-0001-4000-8000-000000000003',
   'comlurb.recreio@rio.rj.gov.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Comlurb - Gerência Regional Recreio',
   '/images/stock/avatar-governo.jpg',
   'government', 'orgao_publico', NOW() - INTERVAL '280 days', NOW()),

  -- ── 5. Comunicação (media) ───────────────────────────────────────────────────────
  ('55555555-0001-4000-8000-000000000001',
   'redacao@jornaldorecreio.com.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Jornal do Recreio',
   NULL,
   'media', 'imprensa', NOW() - INTERVAL '250 days', NOW()),

  ('55555555-0001-4000-8000-000000000002',
   'contato@vozdorecreio.com.br',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Voz do Recreio & Vargens',
   NULL,
   'media', 'midia_comunitaria', NOW() - INTERVAL '210 days', NOW())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  avatar_url = EXCLUDED.avatar_url,
  role = EXCLUDED.role,
  profile_type = EXCLUDED.profile_type,
  updated_at = NOW();
