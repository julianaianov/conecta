-- Publicações demo do catálogo oficial — Bairros do Brasil

INSERT INTO posts (
  id, author_id, author_name, author_avatar, type, title, description, status,
  latitude, longitude, neighborhood, city, images, videos, tags,
  reactions_count, comments_count, views_count, created_at
) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Maria Silva', '/images/stock/avatar-moradora.jpg',
   'problem', 'Buraco na Av. das Américas',
   'Buraco grande na altura do shopping do bairro já causou acidentes com motos. Precisa de reparo urgente antes que alguém se machuque de verdade.',
   'active', -23.0245, -43.4580, 'Jardim América', 'Rio de Janeiro',
   ARRAY['/images/buraco.jpeg'], '{}',
   ARRAY['infraestrutura', 'urgente', 'vias'],
   12, 2, 87,
   NOW() - INTERVAL '1 day 8 hours'),

  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '33333333-3333-3333-3333-333333333333', 'Subprefeitura Regional', '/images/stock/avatar-governo.jpg',
   'need', 'Doação de cestas básicas — famílias afetadas',
   '40 famílias da região foram afetadas pelas chuvas. Precisamos de cestas básicas, água potável e itens de higiene. Pontos de coleta na subprefeitura.',
   'active', -23.0230, -43.4510, 'Vila Nova', 'Rio de Janeiro',
   ARRAY['/images/uploads/cestas-basicas.jpg'], '{}',
   ARRAY['assistência', 'doação', 'emergência'],
   41, 1, 178,
   NOW() - INTERVAL '2 days 14 hours'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222', 'Associação Bairro Verde', '/images/stock/avatar-lider.jpg',
   'project', 'Mutirão de limpeza da praia',
   'Todo sábado de manhã nos reunimos para limpar a faixa de areia e a orla. Traga luvas, água e disposição. Já recolhemos mais de 2 toneladas de resíduos!',
   'active', -23.0290, -43.4650, 'Vila do Mar', 'Rio de Janeiro',
   ARRAY['/images/uploads/mutirao-praia.jpg'], ARRAY['/videos/mutirao-praia.webm'],
   ARRAY['meio-ambiente', 'voluntariado', 'orla'],
   28, 3, 142,
   NOW() - INTERVAL '2 days 10 hours'),

  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '11111111-1111-1111-1111-111111111111', 'Maria Silva', '/images/stock/avatar-moradora.jpg',
   'problem', 'Iluminação precária na Av. Gen. Barreto',
   'Vários postes apagados há semanas deixam a avenida perigosa à noite. Moradores evitam caminhar no trecho. Pedimos atenção da subprefeitura.',
   'active', -23.0260, -43.4610, 'Centro', 'Rio de Janeiro',
   ARRAY['/images/iluminacao.jpeg'], '{}',
   ARRAY['segurança', 'iluminação'],
   19, 1, 96,
   NOW() - INTERVAL '3 days 19 hours'),

  ('30303030-3030-3030-3030-303030303030',
   '44444444-4444-4444-4444-444444444444', 'Construtora Nova Ltda', '/images/stock/avatar-empresa.jpg',
   'event', 'Campeonato de futebol comunitário',
   'Inscrições abertas para o campeonato de várzea do bairro. Times de até 12 jogadores. Premiação para os três primeiros. Patrocínio Construtora Nova.',
   'active', -23.0220, -43.4530, 'São José', 'Rio de Janeiro',
   ARRAY['/images/uploads/futebol-comunitario.jpg'], '{}',
   ARRAY['esporte', 'evento', 'juventude'],
   26, 0, 119,
   NOW() - INTERVAL '3 days 18 hours'),

  ('40404040-4040-4040-4040-404040404040',
   '33333333-3333-3333-3333-333333333333', 'Subprefeitura Regional', '/images/stock/avatar-governo.jpg',
   'need', 'Voluntários para reforço escolar',
   'Buscamos voluntários para aulas de reforço de matemática e português para crianças do ensino fundamental. 2h por semana fazem toda a diferença.',
   'active', -23.0235, -43.4555, 'Nova Aliança', 'Rio de Janeiro',
   ARRAY['/images/voluntario-refoco-escolar.jpeg'], '{}',
   ARRAY['educação', 'voluntariado', 'crianças'],
   23, 0, 101,
   NOW() - INTERVAL '4 days 15 hours'),

  ('ffffffff-ffff-ffff-ffff-ffffffffffff',
   '44444444-4444-4444-4444-444444444444', 'Construtora Nova Ltda', '/images/stock/avatar-empresa.jpg',
   'event', 'Feira de Sustentabilidade do bairro',
   'Dia 15, no shopping do bairro: feira com produtores locais, oficinas de compostagem, troca de mudas e food trucks. Entrada gratuita. Venha participar!',
   'active', -23.0240, -43.4575, 'Parque das Árvores', 'Rio de Janeiro',
   ARRAY['/images/uploads/feira-sustentabilidade.jpg'], '{}',
   ARRAY['evento', 'sustentabilidade', 'cultura'],
   22, 0, 134,
   NOW() - INTERVAL '4 days 11 hours'),

  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222', 'Associação Bairro Verde', '/images/stock/avatar-lider.jpg',
   'project', 'Horta comunitária do bairro',
   'Estamos transformando um terreno ocioso em horta comunitária. Já temos canteiros de temperos e hortaliças. Buscamos doação de mudas, terra adubada e ferramentas.',
   'in_progress', -23.0255, -43.4540, 'Boa Vista', 'Rio de Janeiro',
   ARRAY['/images/horta.jpeg'], ARRAY['/videos/horta-comunitaria.webm'],
   ARRAY['sustentabilidade', 'alimentação', 'conexão'],
   35, 2, 210,
   NOW() - INTERVAL '5 days 9 hours'),

  ('10101010-1010-1010-1010-101010101010',
   '22222222-2222-2222-2222-222222222222', 'Associação Bairro Verde', '/images/stock/avatar-lider.jpg',
   'action', 'Plantio de mudas nativas na orla',
   'Ação de reflorestamento da restinga com espécies nativas. Plantamos 120 mudas no último encontro. Próxima ação no domingo às 8h.',
   'active', -23.0285, -43.4640, 'Vila do Mar', 'Rio de Janeiro',
   ARRAY['/images/stock/feira-verde.jpg'], '{}',
   ARRAY['meio-ambiente', 'reflorestamento'],
   17, 0, 88,
   NOW() - INTERVAL '6 days 8 hours'),

  ('20202020-2020-2020-2020-202020202020',
   '11111111-1111-1111-1111-111111111111', 'Maria Silva', '/images/stock/avatar-moradora.jpg',
   'problem', 'Alagamento na Rua Guignard',
   'A rua alagava a cada chuva forte. Após mobilização dos moradores, a subprefeitura desobstruiu os bueiros e o problema foi resolvido. Obrigada a todos!',
   'resolved', -23.0265, -43.4605, 'Jardim das Flores', 'Rio de Janeiro',
   ARRAY['/images/alagamento.jpeg'], '{}',
   ARRAY['infraestrutura', 'drenagem', 'resolvido'],
   31, 0, 156,
   NOW() - INTERVAL '9 days 16 hours')
ON CONFLICT (id) DO UPDATE SET
  author_id = EXCLUDED.author_id,
  author_name = EXCLUDED.author_name,
  author_avatar = EXCLUDED.author_avatar,
  type = EXCLUDED.type,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  neighborhood = EXCLUDED.neighborhood,
  city = EXCLUDED.city,
  images = EXCLUDED.images,
  videos = EXCLUDED.videos,
  tags = EXCLUDED.tags,
  reactions_count = EXCLUDED.reactions_count,
  comments_count = EXCLUDED.comments_count,
  views_count = EXCLUDED.views_count,
  created_at = EXCLUDED.created_at,
  updated_at = NOW();

-- Comentários demo
INSERT INTO comments (id, post_id, author_id, author_name, content, created_at) VALUES
  ('c0000001-0000-0000-0000-000000000001',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '22222222-2222-2222-2222-222222222222', 'Associação Bairro Verde',
   'Já registramos um chamado na subprefeitura. Vamos acompanhar de perto!',
   NOW() - INTERVAL '1 day 6 hours'),

  ('c0000002-0000-0000-0000-000000000002',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333', 'Subprefeitura Regional',
   'Equipe de manutenção agendada para esta semana. Obrigado pelo registro.',
   NOW() - INTERVAL '11 hours'),

  ('c0000003-0000-0000-0000-000000000003',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111', 'Maria Silva',
   'Vou levar a família no próximo sábado!',
   NOW() - INTERVAL '2 days 6 hours'),

  ('c0000004-0000-0000-0000-000000000004',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '44444444-4444-4444-4444-444444444444', 'Construtora Nova Ltda',
   'Podemos doar luvas e sacos de lixo para o mutirão.',
   NOW() - INTERVAL '1 day 9 hours'),

  ('c0000005-0000-0000-0000-000000000005',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '33333333-3333-3333-3333-333333333333', 'Subprefeitura Regional',
   'A coleta especial passa às 12h no ponto combinado.',
   NOW() - INTERVAL '1 day 5 hours'),

  ('c0000006-0000-0000-0000-000000000006',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   '33333333-3333-3333-3333-333333333333', 'Subprefeitura Regional',
   'Ordem de serviço aberta para a concessionária de energia.',
   NOW() - INTERVAL '2 days 17 hours'),

  ('c0000007-0000-0000-0000-000000000007',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '11111111-1111-1111-1111-111111111111', 'Maria Silva',
   'Tenho mudas de manjericão e alecrim para doar!',
   NOW() - INTERVAL '4 days 10 hours'),

  ('c0000008-0000-0000-0000-000000000008',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '44444444-4444-4444-4444-444444444444', 'Construtora Nova Ltda',
   'Conseguimos doar 10 sacos de terra adubada.',
   NOW() - INTERVAL '3 days 14 hours'),

  ('c0000009-0000-0000-0000-000000000009',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '11111111-1111-1111-1111-111111111111', 'Maria Silva',
   'Já separei alimentos não perecíveis e cobertores para entregar.',
   NOW() - INTERVAL '1 day 2 hours')
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  author_name = EXCLUDED.author_name;

-- Apoios demo (27 apoios determinísticos correspondentes ao catálogo)
INSERT INTO supports (
  id, post_id, user_id, user_name, type, message, amount, payment_method, details, status, created_at
) VALUES
  ('s0000001-0000-0000-0000-000000000001',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Maria Silva',
   'volunteering', 'Posso ajudar nos sábados de manhã.', NULL, NULL,
   '{"Horas/semana": "4h", "Disponibilidade": "Sábados, manhã"}'::jsonb, 'confirmed', NOW() - INTERVAL '2 days'),

  ('s0000002-0000-0000-0000-000000000002',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'Construtora Nova Ltda',
   'materials', 'Luvas e sacos de lixo para o mutirão.', NULL, NULL,
   '{"Materiais": "60 pares de luvas, 200 sacos", "Entrega": "sexta-feira"}'::jsonb, 'confirmed', NOW() - INTERVAL '1 day'),

  ('s0000003-0000-0000-0000-000000000003',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a0000001-0000-0000-0000-000000000001', 'João Pereira',
   'volunteering', NULL, NULL, NULL, '{}'::jsonb, 'confirmed', NOW() - INTERVAL '3 days'),

  ('s0000004-0000-0000-0000-000000000004',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a0000002-0000-0000-0000-000000000002', 'Supermercado Bom Preço',
   'food', 'Água e lanche para a equipe.', NULL, NULL,
   '{"Alimentos": "Água mineral e frutas", "Porções": "80"}'::jsonb, 'confirmed', NOW() - INTERVAL '2 days'),

  ('s0000005-0000-0000-0000-000000000005',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a0000003-0000-0000-0000-000000000003', 'ONG Mar Limpo',
   'transport', NULL, NULL, NULL,
   '{"Veículo": "Caminhonete", "Capacidade": "800 kg"}'::jsonb, 'confirmed', NOW() - INTERVAL '4 days'),

  ('s0000006-0000-0000-0000-000000000006',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Maria Silva',
   'financial', 'Contribuição para sinalização provisória.', 50.00, 'pix', '{}'::jsonb, 'confirmed', NOW() - INTERVAL '1 day'),

  ('s0000007-0000-0000-0000-000000000007',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000004-0000-0000-0000-000000000004', 'Auto Peças RJ',
   'materials', NULL, NULL, NULL,
   '{"Materiais": "Cones e fita zebrada", "Quantidade": "12 cones"}'::jsonb, 'confirmed', NOW() - INTERVAL '1 day'),

  ('s0000008-0000-0000-0000-000000000008',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 'Construtora Nova Ltda',
   'financial', 'Patrocínio da primeira fase da horta.', 1200.00, 'credit', '{}'::jsonb, 'confirmed', NOW() - INTERVAL '3 days'),

  ('s0000009-0000-0000-0000-000000000009',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'a0000005-0000-0000-0000-000000000005', 'Padaria Pão Quente',
   'financial', NULL, 200.00, 'pix', '{}'::jsonb, 'confirmed', NOW() - INTERVAL '5 days'),

  ('s0000010-0000-0000-0000-000000000010',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'a0000006-0000-0000-0000-000000000006', 'Ana Beatriz',
   'volunteering', NULL, NULL, NULL,
   '{"Horas/semana": "6h", "Disponibilidade": "Quartas e sábados"}'::jsonb, 'confirmed', NOW() - INTERVAL '4 days'),

  ('s0000011-0000-0000-0000-000000000011',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'a0000007-0000-0000-0000-000000000007', 'Fernanda Lima',
   'knowledge', 'Sou agrônoma, posso dar a oficina de compostagem.', NULL, NULL,
   '{"Área": "Agronomia", "Formato": "Oficina prática"}'::jsonb, 'confirmed', NOW() - INTERVAL '6 days'),

  ('s0000012-0000-0000-0000-000000000012',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'a0000008-0000-0000-0000-000000000008', 'Farmácia Saúde+',
   'equipment', NULL, NULL, NULL,
   '{"Equipamento": "Caixa d''água 500L", "Modalidade": "doação"}'::jsonb, 'confirmed', NOW() - INTERVAL '7 days'),

  ('s0000013-0000-0000-0000-000000000013',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a0000002-0000-0000-0000-000000000002', 'Supermercado Bom Preço',
   'food', '40 cestas básicas montadas.', NULL, NULL,
   '{"Alimentos": "Cestas básicas", "Porções": "40 cestas"}'::jsonb, 'confirmed', NOW() - INTERVAL '2 days'),

  ('s0000014-0000-0000-0000-000000000014',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', 'Associação Bairro Verde',
   'labor', NULL, NULL, NULL,
   '{"Habilidade": "Triagem e entrega", "Horas": "12h"}'::jsonb, 'confirmed', NOW() - INTERVAL '2 days'),

  ('s0000015-0000-0000-0000-000000000015',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a0000009-0000-0000-0000-000000000009', 'Carlos Mendes',
   'financial', NULL, 80.00, 'pix', '{}'::jsonb, 'confirmed', NOW() - INTERVAL '1 day'),

  ('s0000016-0000-0000-0000-000000000016',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a0000010-0000-0000-0000-000000000010', 'Studio Fitness Vida',
   'financial', NULL, 300.00, 'debit', '{}'::jsonb, 'confirmed', NOW() - INTERVAL '3 days'),

  ('s0000017-0000-0000-0000-000000000017',
   '40404040-4040-4040-4040-404040404040', 'a0000006-0000-0000-0000-000000000006', 'Ana Beatriz',
   'volunteering', NULL, NULL, NULL,
   '{"Ajuda": "Aulas de matemática", "Horas/semana": "2h"}'::jsonb, 'confirmed', NOW() - INTERVAL '4 days'),

  ('s0000018-0000-0000-0000-000000000018',
   '40404040-4040-4040-4040-404040404040', 'a0000011-0000-0000-0000-000000000011', 'Coletivo Cultural Recreio',
   'space', NULL, NULL, NULL,
   '{"Espaço": "Sala de oficinas", "Capacidade": "25 pessoas"}'::jsonb, 'confirmed', NOW() - INTERVAL '5 days'),

  ('s0000019-0000-0000-0000-000000000019',
   '10101010-1010-1010-1010-101010101010', 'a0000005-0000-0000-0000-000000000005', 'Padaria Pão Quente',
   'food', NULL, NULL, NULL, '{}'::jsonb, 'confirmed', NOW() - INTERVAL '6 days'),

  ('s0000020-0000-0000-0000-000000000020',
   '10101010-1010-1010-1010-101010101010', 'a0000001-0000-0000-0000-000000000001', 'João Pereira',
   'volunteering', NULL, NULL, NULL, '{}'::jsonb, 'confirmed', NOW() - INTERVAL '6 days'),

  ('s0000021-0000-0000-0000-000000000021',
   'ffffffff-ffff-ffff-ffff-ffffffffffff', 'a0000008-0000-0000-0000-000000000008', 'Farmácia Saúde+',
   'financial', 'Patrocínio do palco das oficinas.', 600.00, 'credit', '{}'::jsonb, 'confirmed', NOW() - INTERVAL '4 days'),

  ('s0000022-0000-0000-0000-000000000022',
   'ffffffff-ffff-ffff-ffff-ffffffffffff', 'a0000012-0000-0000-0000-000000000012', 'Projeto Semear',
   'sharing', NULL, NULL, NULL,
   '{"Canais": "Instagram e grupos de bairro", "Alcance": "8 mil pessoas"}'::jsonb, 'confirmed', NOW() - INTERVAL '4 days'),

  ('s0000023-0000-0000-0000-000000000023',
   '30303030-3030-3030-3030-303030303030', '44444444-4444-4444-4444-444444444444', 'Construtora Nova Ltda',
   'financial', 'Premiação e uniformes do campeonato.', 1500.00, 'credit', '{}'::jsonb, 'confirmed', NOW() - INTERVAL '3 days'),

  ('s0000024-0000-0000-0000-000000000024',
   '30303030-3030-3030-3030-303030303030', 'a0000010-0000-0000-0000-000000000010', 'Studio Fitness Vida',
   'equipment', NULL, NULL, NULL,
   '{"Equipamento": "Bolas e coletes", "Modalidade": "doação"}'::jsonb, 'confirmed', NOW() - INTERVAL '2 days'),

  ('s0000025-0000-0000-0000-000000000025',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'Subprefeitura Regional',
   'labor', 'Equipe da concessionária acionada.', NULL, NULL,
   '{"Habilidade": "Manutenção elétrica", "Horas": "16h"}'::jsonb, 'confirmed', NOW() - INTERVAL '2 days'),

  ('s0000026-0000-0000-0000-000000000026',
   '20202020-2020-2020-2020-202020202020', '33333333-3333-3333-3333-333333333333', 'Subprefeitura Regional',
   'labor', 'Desobstrução dos bueiros concluída.', NULL, NULL,
   '{"Habilidade": "Drenagem urbana", "Horas": "24h"}'::jsonb, 'confirmed', NOW() - INTERVAL '8 days'),

  ('s0000027-0000-0000-0000-000000000027',
   '20202020-2020-2020-2020-202020202020', 'a0000009-0000-0000-0000-000000000009', 'Carlos Mendes',
   'volunteering', NULL, NULL, NULL, '{}'::jsonb, 'confirmed', NOW() - INTERVAL '9 days')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  message = EXCLUDED.message;

-- Reações demo
INSERT INTO reactions (post_id, user_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (post_id, user_id) DO NOTHING;
