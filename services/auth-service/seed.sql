-- Usuários demo — Recreio dos Bandeirantes, Rio de Janeiro
-- Senha de todos: demo123
INSERT INTO users (id, email, password_hash, name, role, profile_type) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'maria@recreio.conecta',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Maria Silva', 'citizen', 'morador'),
  ('22222222-2222-2222-2222-222222222222',
   'ong@recreio.conecta',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Associação Recreio Verde', 'community', 'associacao'),
  ('33333333-3333-3333-3333-333333333333',
   'prefeitura@recreio.conecta',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Subprefeitura do Recreio', 'institutional', 'prefeitura'),
  ('44444444-4444-4444-4444-444444444444',
   'empresa@recreio.conecta',
   '$2a$10$KlaU0b9nE/gCqmZ8LxfQhOwKgx2VSaodaaIOB2F./WLP11bGthT16',
   'Recreio Construções Ltda', 'partner', 'empresa')
ON CONFLICT (email) DO NOTHING;
