-- Perfis demo — Recreio dos Bandeirantes, Rio de Janeiro
INSERT INTO profiles (user_id, name, bio, city, state, role) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'Maria Silva',
   'Moradora do Recreio há 15 anos. Ativa na comunidade local.',
   'Rio de Janeiro', 'RJ', 'citizen'),
  ('22222222-2222-2222-2222-222222222222',
   'Associação Recreio Verde',
   'Associação de moradores do Recreio. Mutirões de limpeza e hortas comunitárias.',
   'Rio de Janeiro', 'RJ', 'association'),
  ('33333333-3333-3333-3333-333333333333',
   'Subprefeitura do Recreio',
   'Órgão municipal responsável pelas demandas do bairro.',
   'Rio de Janeiro', 'RJ', 'government'),
  ('44444444-4444-4444-4444-444444444444',
   'Recreio Construções Ltda',
   'Empresa local apoiadora de projetos comunitários no Recreio.',
   'Rio de Janeiro', 'RJ', 'business')
ON CONFLICT (user_id) DO NOTHING;
