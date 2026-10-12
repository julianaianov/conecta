-- Seed oficial de perfis, comunidades, organizações e conexões — Recreio dos Bandeirantes, RJ
-- DM Conecta: perfis canônicos das 5 categorias do ecossistema.

-- ── 1. Perfis (profiles) ──────────────────────────────────────────────────────────
INSERT INTO profiles (
  user_id, name, bio, avatar_url, cover_url, status,
  neighborhood, member_since, friend_count, phone, website, city, state, role, profile_type, created_at, updated_at
) VALUES
  -- Agentes
  ('11111111-0001-4000-8000-000000000001', 'Associação Recreio Verde',
   'Organização comunitária sem fins lucrativos dedicada à sustentabilidade, preservação das praias, recuperação da restinga e hortas agroecológicas no Recreio dos Bandeirantes.',
   '/images/stock/avatar-lider.jpg', NULL, 'Mobilizando a orla do Recreio por praias mais limpas!',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '180 days', 142, '(21) 98765-4321', 'https://recreioverde.org.br',
   'Rio de Janeiro', 'RJ', 'agent', 'associacao', NOW() - INTERVAL '180 days', NOW()),

  ('11111111-0001-4000-8000-000000000002', 'Coletivo Cultural Recreio',
   'Articulação comunitária de artistas, músicos e jovens promovendo cultura, rodas de rima e oficinas formativas no Recreio e adjacências.',
   '/images/stock/avatar-lider.jpg', NULL, 'Cultura viva e ocupação criativa nos espaços públicos.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '150 days', 89, '(21) 98765-1122', 'https://recreiocultural.org.br',
   'Rio de Janeiro', 'RJ', 'agent', 'coletivo', NOW() - INTERVAL '150 days', NOW()),

  ('11111111-0001-4000-8000-000000000003', 'Instituto Criança Feliz Recreio',
   'Projeto socioeducativo focado no desenvolvimento integral de crianças e adolescentes, com reforço escolar, esporte e apoio familiar.',
   '/images/stock/avatar-lider.jpg', NULL, 'Educação transformadora construindo futuros melhores.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '120 days', 115, '(21) 98765-3344', 'https://criancafelizrecreio.org.br',
   'Rio de Janeiro', 'RJ', 'agent', 'instituto', NOW() - INTERVAL '120 days', NOW()),

  ('11111111-0001-4000-8000-000000000004', 'Associação de Moradores do Terreirão',
   'Representação comunitária dos moradores do Terreirão e entorno, articulando demandas urbanas, zeladoria e cidadania.',
   '/images/stock/avatar-lider.jpg', NULL, 'Trabalhando pelo desenvolvimento e infraestrutura do Terreirão.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '210 days', 230, '(21) 98765-5566', NULL,
   'Rio de Janeiro', 'RJ', 'agent', 'associacao', NOW() - INTERVAL '210 days', NOW()),

  ('11111111-0001-4000-8000-000000000005', 'Projeto Onda Limpa Recreio',
   'Escolinha comunitária de surf e educação ambiental para crianças e jovens do Recreio, unindo esporte e consciência oceânica.',
   '/images/stock/avatar-lider.jpg', NULL, 'Surf, inclusão social e preservação das nossas praias.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '90 days', 98, '(21) 98765-7788', 'https://recreiosurf.org.br',
   'Rio de Janeiro', 'RJ', 'agent', 'projeto_social', NOW() - INTERVAL '90 days', NOW()),

  -- Membros da Comunidade
  ('22222222-0001-4000-8000-000000000001', 'Maria Silva',
   'Moradora do Recreio dos Bandeirantes há mais de 15 anos. Atuante na fiscalização de serviços públicos, zeladoria urbana e melhorias do bairro.',
   '/images/stock/avatar-moradora.jpg', NULL, 'Por um Recreio mais acessível, limpo e seguro para todos.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '300 days', 76, '(21) 98888-1111', NULL,
   'Rio de Janeiro', 'RJ', 'member', 'morador', NOW() - INTERVAL '300 days', NOW()),

  ('22222222-0001-4000-8000-000000000002', 'João Pereira',
   'Voluntário dedicado em mutirões de limpeza na orla, projetos de compostagem e ações comunitárias no Recreio.',
   NULL, NULL, 'Cuidando da nossa praia e do nosso verde!',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '160 days', 54, '(21) 98888-2222', NULL,
   'Rio de Janeiro', 'RJ', 'member', 'voluntario', NOW() - INTERVAL '160 days', NOW()),

  ('22222222-0001-4000-8000-000000000003', 'Carlos Mendes',
   'Morador e ciclista diário da Av. Lúcio Costa e Av. das Américas. Incentivador da micromobilidade e segurança viária.',
   NULL, NULL, 'Mais ciclofaixas seguras e respeito ao pedestre.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '140 days', 41, '(21) 98888-3333', NULL,
   'Rio de Janeiro', 'RJ', 'member', 'morador', NOW() - INTERVAL '140 days', NOW()),

  ('22222222-0001-4000-8000-000000000004', 'Fernanda Lima',
   'Estudante universitária de Ciências Biológicas e ativista na conservação da restinga da Praia da Macumba e Parque Chico Mendes.',
   NULL, NULL, 'Preservar a fauna e flora costeira do Rio.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '110 days', 63, '(21) 98888-4444', NULL,
   'Rio de Janeiro', 'RJ', 'member', 'jovem', NOW() - INTERVAL '110 days', NOW()),

  ('22222222-0001-4000-8000-000000000005', 'Ana Beatriz Souza',
   'Professora voluntária no reforço escolar comunitário no Terreirão e entusiasta de feiras de livros no bairro.',
   NULL, NULL, 'Educação comunitária transforma vidas.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '80 days', 49, '(21) 98888-5555', NULL,
   'Rio de Janeiro', 'RJ', 'member', 'voluntario', NOW() - INTERVAL '80 days', NOW()),

  -- Parceiros
  ('33333333-0001-4000-8000-000000000001', 'Construtora Recreio Novo Ltda',
   'Empresa de engenharia e construção civil com forte compromisso em investimentos socioambientais e melhorias de infraestrutura no Recreio.',
   '/images/stock/avatar-empresa.jpg', NULL, 'Construindo um bairro sustentável em parceria com a comunidade.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '240 days', 180, '(21) 3456-7890', 'https://recreionovoconstrutora.com.br',
   'Rio de Janeiro', 'RJ', 'partner', 'empresa', NOW() - INTERVAL '240 days', NOW()),

  ('33333333-0001-4000-8000-000000000002', 'Padaria Pão Quente do Recreio',
   'Comércio tradicional do bairro apoiando café comunitário em mutirões de limpeza e doações de alimentos para ações solidárias.',
   NULL, NULL, 'Alimentando boas iniciativas no Recreio!',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '200 days', 92, '(21) 3456-1122', 'https://paoquenterecreio.com.br',
   'Rio de Janeiro', 'RJ', 'partner', 'comercio_local', NOW() - INTERVAL '200 days', NOW()),

  ('33333333-0001-4000-8000-000000000003', 'Supermercado Bom Preço Recreio',
   'Rede varejista local parceira de campanhas de arrecadação de cestas básicas e apoio a projetos sociais no território.',
   NULL, NULL, 'Compromisso com as famílias do Recreio e região.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '170 days', 104, '(21) 3456-3344', 'https://superbomprecorecreio.com.br',
   'Rio de Janeiro', 'RJ', 'partner', 'comercio_local', NOW() - INTERVAL '170 days', NOW()),

  ('33333333-0001-4000-8000-000000000004', 'Studio Fitness Recreio',
   'Academia e centro de treinamento patrocinador de projetos esportivos para jovens e eventos comunitários na orla.',
   NULL, NULL, 'Saúde, esporte e inclusão para o nosso bairro.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '130 days', 78, '(21) 3456-5566', 'https://studiofitnessrecreio.com.br',
   'Rio de Janeiro', 'RJ', 'partner', 'patrocinador', NOW() - INTERVAL '130 days', NOW()),

  ('33333333-0001-4000-8000-000000000005', 'Quiosque Pontal da Praia',
   'Ponto de apoio na orla do Recreio (Posto 12) parceiro oficial de mutirões de limpeza, fornecendo água e suporte aos voluntários.',
   NULL, NULL, 'Praia limpa é a nossa praia.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '95 days', 65, '(21) 3456-7788', NULL,
   'Rio de Janeiro', 'RJ', 'partner', 'comercio_local', NOW() - INTERVAL '95 days', NOW()),

  -- Poder Público
  ('44444444-0001-4000-8000-000000000001', 'Subprefeitura da Barra, Recreio e Vargens',
   'Órgão municipal da Prefeitura do Rio responsável pela coordenação administrativa, fiscalização e articulação de serviços públicos na região.',
   '/images/stock/avatar-governo.jpg', NULL, 'Canal oficial de articulação com as demandas da região do Recreio.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '365 days', 350, '(21) 2976-1000', 'https://prefeitura.rio/subprefeituras',
   'Rio de Janeiro', 'RJ', 'government', 'prefeitura', NOW() - INTERVAL '365 days', NOW()),

  ('44444444-0001-4000-8000-000000000002', 'Secretaria Municipal de Meio Ambiente e Clima - RJ',
   'Órgão gestor de políticas ambientais, parques naturais municipais (Chico Mendes e Prainha) e conservação dos ecossistemas costeiros.',
   '/images/stock/avatar-governo.jpg', NULL, 'Preservando as unidades de conservação e restingas cariocas.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '320 days', 210, '(21) 2976-2000', 'https://climaemeioambiente.prefeitura.rio',
   'Rio de Janeiro', 'RJ', 'government', 'secretaria', NOW() - INTERVAL '320 days', NOW()),

  ('44444444-0001-4000-8000-000000000003', 'Comlurb - Gerência Regional Recreio',
   'Companhia Municipal de Limpeza Urbana do Rio de Janeiro — gerência operacional do Recreio dos Bandeirantes, orla e canais.',
   '/images/stock/avatar-governo.jpg', NULL, 'Zelando pela limpeza das vias, praias e descarte regular.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '280 days', 190, '(21) 2204-9999', 'https://comlurb.prefeitura.rio',
   'Rio de Janeiro', 'RJ', 'government', 'orgao_publico', NOW() - INTERVAL '280 days', NOW()),

  -- Comunicação
  ('55555555-0001-4000-8000-000000000001', 'Jornal do Recreio',
   'Veículo jornalístico regional cobrindo o dia a dia, obras, eventos culturais e demandas sociais dos bairros do Recreio e Barra da Tijuca.',
   NULL, NULL, 'Informação de credibilidade conectando o Recreio dos Bandeirantes.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '250 days', 290, '(21) 2490-1234', 'https://jornaldorecreio.com.br',
   'Rio de Janeiro', 'RJ', 'media', 'imprensa', NOW() - INTERVAL '250 days', NOW()),

  ('55555555-0001-4000-8000-000000000002', 'Voz do Recreio & Vargens',
   'Canal comunitário independente de comunicação e mobilização de moradores, divulgando projetos e soluções de impacto no território.',
   NULL, NULL, 'Dando visibilidade aos projetos e histórias do Recreio.',
   'Recreio dos Bandeirantes', NOW() - INTERVAL '210 days', 175, '(21) 98765-9900', 'https://vozdorecreio.com.br',
   'Rio de Janeiro', 'RJ', 'media', 'midia_comunitaria', NOW() - INTERVAL '210 days', NOW())
ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  status = EXCLUDED.status,
  neighborhood = EXCLUDED.neighborhood,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  role = EXCLUDED.role,
  profile_type = EXCLUDED.profile_type,
  updated_at = NOW();

-- ── 2. Comunidades (communities) ──────────────────────────────────────────────────
INSERT INTO communities (id, name, description, category, member_count, image_url, created_at, updated_at) VALUES
  ('moradores-recreio', 'Moradores do Recreio dos Bandeirantes',
   'Espaço de encontro, troca e cidadania de quem mora no Recreio. Zeladoria, avisos de trânsito e discussões de melhorias para o bairro.',
   'bairro', 480, '/images/comunidade.jpeg', NOW() - INTERVAL '250 days', NOW()),

  ('preservacao-praia-recreio', 'Amigos da Praia do Recreio e Macumba',
   'Grupo dedicado a mutirões de limpeza, educação ambiental, proteção dos oceanos e conservação das dunas e restingas.',
   'meio_ambiente', 320, '/images/uploads/mutirao-praia.jpg', NOW() - INTERVAL '200 days', NOW()),

  ('ciclistas-recreio', 'Ciclistas e Mobilidade Recreio',
   'Comunidade de quem pedala pela orla, ciclovias e vias do Recreio. Defendemos mobilidade segura, lazer e infraestrutura cicloviária.',
   'mobilidade', 195, '/images/ciclistas.jpeg', NOW() - INTERVAL '180 days', NOW()),

  ('horta-sustentabilidade-recreio', 'Horta Comunitária & Sustentabilidade',
   'Voluntários e moradores cuidando de hortas comunitárias, compostagem e agricultura urbana no Recreio dos Bandeirantes.',
   'sustentabilidade', 140, '/images/horta.jpeg', NOW() - INTERVAL '150 days', NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  member_count = EXCLUDED.member_count,
  image_url = EXCLUDED.image_url,
  updated_at = NOW();

-- ── 3. Organizações Institucionais (organizations) ───────────────────────────────
INSERT INTO organizations (
  id, profile_id, org_name, category, description, address, latitude, longitude,
  verified, verified_at, verified_by, institution_kind, cnpj, legal_name, trade_name,
  cnae_primary, cnae_primary_description, government_sphere, department, competence_areas,
  territory, cep, street, address_number, district, municipality, uf,
  institutional_email, institutional_phone, website, validation_status, validation_reviewed_by,
  validation_reviewed_at, submitted_at, created_at, updated_at
) VALUES
  -- Associação Recreio Verde (Validada)
  ('aaaaaaaa-0001-4000-8000-000000000001',
   (SELECT id FROM profiles WHERE user_id = '11111111-0001-4000-8000-000000000001'),
   'Associação Recreio Verde', 'Meio Ambiente',
   'Associação comunitária ambiental sem fins lucrativos focada na preservação da orla e sustentabilidade.',
   'Av. Lúcio Costa, 16000, Recreio dos Bandeirantes, Rio de Janeiro - RJ', -23.0290, -43.4650,
   true, NOW() - INTERVAL '170 days', 'Equipe DM Conecta',
   'agente_transformacao', '18234567000189',
   'Associação de Preservação e Meio Ambiente Recreio Verde', 'Recreio Verde',
   '9499500', 'Atividades associativas ligadas à cultura e meio ambiente',
   NULL, NULL, ARRAY['Meio ambiente', 'Sustentabilidade', 'Educação ambiental', 'Preservação marinha'],
   'Recreio dos Bandeirantes', '22795008', 'Avenida Lúcio Costa', '16000', 'Recreio', 'Rio de Janeiro', 'RJ',
   'contato@recreioverde.org.br', '21987654321', 'https://recreioverde.org.br',
   'validada', 'Ricardo R. Sierra (Gestão)', NOW() - INTERVAL '170 days', NOW() - INTERVAL '175 days',
   NOW() - INTERVAL '180 days', NOW() - INTERVAL '170 days'),

  -- Coletivo Cultural Recreio (Validada)
  ('aaaaaaaa-0001-4000-8000-000000000002',
   (SELECT id FROM profiles WHERE user_id = '11111111-0001-4000-8000-000000000002'),
   'Coletivo Cultural Recreio', 'Cultura',
   'Coletivo de jovens, artistas e educadores culturais no Recreio.',
   'Praça do Recreio, s/n, Recreio dos Bandeirantes, Rio de Janeiro - RJ', -23.0200, -43.4680,
   true, NOW() - INTERVAL '140 days', 'Equipe DM Conecta',
   'agente_transformacao', '24567890000112',
   'Coletivo Cultural e Artístico Recreio dos Bandeirantes', 'Coletivo Cultural Recreio',
   '9001901', 'Produção e promoção de eventos culturais e artísticos',
   NULL, NULL, ARRAY['Cultura', 'Arte urbana', 'Música', 'Juventude'],
   'Recreio dos Bandeirantes', '22790000', 'Avenida das Américas', '16000', 'Recreio', 'Rio de Janeiro', 'RJ',
   'coletivo@recreiocultural.org.br', '21987651122', 'https://recreiocultural.org.br',
   'validada', 'Juliana Ianov (Gestão)', NOW() - INTERVAL '140 days', NOW() - INTERVAL '145 days',
   NOW() - INTERVAL '150 days', NOW() - INTERVAL '140 days'),

  -- Instituto Criança Feliz (Validada)
  ('aaaaaaaa-0001-4000-8000-000000000003',
   (SELECT id FROM profiles WHERE user_id = '11111111-0001-4000-8000-000000000003'),
   'Instituto Criança Feliz Recreio', 'Social',
   'Organização de apoio escolar, esporte e inclusão infantil.',
   'Rua do Canal, 120, Recreio dos Bandeirantes, Rio de Janeiro - RJ', -23.0230, -43.4750,
   true, NOW() - INTERVAL '115 days', 'Equipe DM Conecta',
   'agente_transformacao', '29345678000190',
   'Instituto Social Criança Feliz - Polo Recreio', 'Instituto Criança Feliz',
   '8800600', 'Serviços de assistência social sem alojamento',
   NULL, NULL, ARRAY['Educação', 'Infância', 'Esporte comunitário', 'Assistência social'],
   'Recreio dos Bandeirantes', '22795320', 'Rua do Canal', '120', 'Recreio', 'Rio de Janeiro', 'RJ',
   'contato@criancafelizrecreio.org.br', '21987653344', 'https://criancafelizrecreio.org.br',
   'validada', 'Pâmela (Gestão)', NOW() - INTERVAL '115 days', NOW() - INTERVAL '118 days',
   NOW() - INTERVAL '120 days', NOW() - INTERVAL '115 days'),

  -- Associação de Moradores do Terreirão (Validada)
  ('aaaaaaaa-0001-4000-8000-000000000004',
   (SELECT id FROM profiles WHERE user_id = '11111111-0001-4000-8000-000000000004'),
   'Associação de Moradores do Terreirão', 'Comunidade',
   'Representação comunitária e zeladoria territorial do Terreirão.',
   'Rua DW, 10, Terreirão, Recreio dos Bandeirantes, Rio de Janeiro - RJ', -23.0225, -43.4745,
   true, NOW() - INTERVAL '200 days', 'Equipe DM Conecta',
   'agente_transformacao', '34567890000112',
   'Associação de Moradores e Amigos do Terreirão', 'AMOR Terreirão',
   '9499500', 'Atividades associativas locais',
   NULL, NULL, ARRAY['Zeladoria urbana', 'Saneamento', 'Infraestrutura', 'Comunidade'],
   'Recreio dos Bandeirantes', '22795310', 'Rua DW', '10', 'Recreio', 'Rio de Janeiro', 'RJ',
   'amorterreirao@gmail.com', '21987655566', NULL,
   'validada', 'Ricardo R. Sierra (Gestão)', NOW() - INTERVAL '200 days', NOW() - INTERVAL '205 days',
   NOW() - INTERVAL '210 days', NOW() - INTERVAL '200 days'),

  -- Projeto Onda Limpa Recreio (Em análise - para teste da esteira da gestão!)
  ('aaaaaaaa-0001-4000-8000-000000000005',
   (SELECT id FROM profiles WHERE user_id = '11111111-0001-4000-8000-000000000005'),
   'Projeto Onda Limpa Recreio', 'Esporte e Meio Ambiente',
   'Iniciativa esportiva e ambiental para crianças do Recreio.',
   'Av. Lúcio Costa, Posto 12, Recreio dos Bandeirantes, Rio de Janeiro - RJ', -23.0312, -43.4735,
   false, NULL, NULL,
   'agente_transformacao', '38901234000155',
   'Projeto Onda Limpa de Esporte e Cidadania', 'Onda Limpa Recreio',
   '9319101', 'Produção e promoção de eventos esportivos',
   NULL, NULL, ARRAY['Surf', 'Esporte', 'Preservação marinha', 'Cidadania'],
   'Recreio dos Bandeirantes', '22795008', 'Avenida Lúcio Costa', 'Posto 12', 'Recreio', 'Rio de Janeiro', 'RJ',
   'ondalimpa@recreiosurf.org.br', '21987657788', 'https://recreiosurf.org.br',
   'em_analise', NULL, NULL, NOW() - INTERVAL '5 days',
   NOW() - INTERVAL '90 days', NOW() - INTERVAL '5 days'),

  -- Subprefeitura da Barra, Recreio e Vargens (Poder Público - Validada)
  ('cccccccc-0001-4000-8000-000000000001',
   (SELECT id FROM profiles WHERE user_id = '44444444-0001-4000-8000-000000000001'),
   'Subprefeitura da Barra, Recreio e Vargens', 'Governo Municipal',
   'Coordenação regional de serviços públicos e zeladoria da Prefeitura do Rio.',
   'Av. Ayrton Senna, 2001, Barra da Tijuca, Rio de Janeiro - RJ', -23.0030, -43.3640,
   true, NOW() - INTERVAL '360 days', 'Equipe DM Conecta',
   'poder_publico', '42498600000171',
   'Prefeitura da Cidade do Rio de Janeiro', 'Subprefeitura da Barra, Recreio e Vargens',
   '8411600', 'Administração pública em geral', 'municipal', 'Subprefeitura Regional',
   ARRAY['Infraestrutura urbana', 'Zeladoria', 'Drenagem', 'Iluminação', 'Trânsito', 'Ordem pública'],
   'Recreio dos Bandeirantes', '22775002', 'Avenida Ayrton Senna', '2001', 'Barra da Tijuca', 'Rio de Janeiro', 'RJ',
   'subprefeitura.recreio@rio.rj.gov.br', '2129761000', 'https://prefeitura.rio/subprefeituras',
   'validada', 'Ricardo R. Sierra (Gestão)', NOW() - INTERVAL '360 days', NOW() - INTERVAL '364 days',
   NOW() - INTERVAL '365 days', NOW() - INTERVAL '360 days'),

  -- Construtora Recreio Novo (Parceiro Empresa)
  ('bbbbbbbb-0001-4000-8000-000000000001',
   (SELECT id FROM profiles WHERE user_id = '33333333-0001-4000-8000-000000000001'),
   'Construtora Recreio Novo Ltda', 'Empresa / Construção Civil',
   'Engenharia e soluções urbanas sustentáveis.',
   'Av. das Américas, 15000, Recreio dos Bandeirantes, Rio de Janeiro - RJ', -23.0185, -43.4695,
   true, NOW() - INTERVAL '230 days', 'Equipe DM Conecta',
   NULL, '12345678000199',
   'Construtora Recreio Novo de Obras e Engenharia Ltda', 'Construtora Recreio Novo',
   '4120400', 'Construção de edifícios e obras de urbanização',
   NULL, NULL, ARRAY['Construção civil', 'Infraestrutura', 'Revitalização urbana'],
   'Recreio dos Bandeirantes', '22790701', 'Avenida das Américas', '15000', 'Recreio', 'Rio de Janeiro', 'RJ',
   'contato@recreionovoconstrutora.com.br', '2134567890', 'https://recreionovoconstrutora.com.br',
   NULL, NULL, NULL, NULL, NOW() - INTERVAL '240 days', NOW() - INTERVAL '230 days')
ON CONFLICT (id) DO NOTHING;

-- ── 4. Perfil de Apoio do Parceiro (partner_profiles) ────────────────────────────
INSERT INTO partner_profiles (
  user_id, nationwide, ufs, municipalities, territories, interest_categories, offered_resources, created_at, updated_at
) VALUES
  ('33333333-0001-4000-8000-000000000001', false, ARRAY['RJ'], ARRAY['Rio de Janeiro/RJ'],
   ARRAY['Recreio dos Bandeirantes'],
   ARRAY['problema_urbano', 'problema_urgente', 'projeto_ambiental'],
   ARRAY['recursos_financeiros', 'materiais', 'mao_de_obra', 'equipamentos'],
   NOW() - INTERVAL '230 days', NOW()),

  ('33333333-0001-4000-8000-000000000002', false, ARRAY['RJ'], ARRAY['Rio de Janeiro/RJ'],
   ARRAY['Recreio dos Bandeirantes'],
   ARRAY['projeto_social', 'projeto_ambiental'],
   ARRAY['servicos', 'recursos_financeiros'],
   NOW() - INTERVAL '190 days', NOW()),

  ('33333333-0001-4000-8000-000000000004', false, ARRAY['RJ'], ARRAY['Rio de Janeiro/RJ'],
   ARRAY['Recreio dos Bandeirantes'],
   ARRAY['projeto_social', 'necessidade_de_patrocinio'],
   ARRAY['recursos_financeiros', 'equipamentos', 'estrutura'],
   NOW() - INTERVAL '120 days', NOW())
ON CONFLICT (user_id) DO UPDATE SET
  territories = EXCLUDED.territories,
  interest_categories = EXCLUDED.interest_categories,
  offered_resources = EXCLUDED.offered_resources,
  updated_at = NOW();

-- ── 5. Conexões entre usuários (connections) ─────────────────────────────────────
INSERT INTO connections (type, status, from_user_id, to_user_id, message, created_at, updated_at) VALUES
  ('apoio', 'accepted', '22222222-0001-4000-8000-000000000001', '11111111-0001-4000-8000-000000000001',
   'Olá Associação Recreio Verde, acompanho o trabalho de vocês na praia e quero ajudar como voluntária!',
   NOW() - INTERVAL '100 days', NOW()),

  ('parceria', 'accepted', '33333333-0001-4000-8000-000000000001', '11111111-0001-4000-8000-000000000001',
   'Temos interesse em apoiar com maquinário e materiais os projetos de recuperação da orla.',
   NOW() - INTERVAL '80 days', NOW()),

  ('apoio', 'accepted', '22222222-0001-4000-8000-000000000002', '11111111-0001-4000-8000-000000000001',
   'Disponível para todos os sábados de mutirão na praia!',
   NOW() - INTERVAL '60 days', NOW()),

  ('institucional', 'accepted', '44444444-0001-4000-8000-000000000001', '11111111-0001-4000-8000-000000000004',
   'Subprefeitura em diálogo constante para encaminhamentos de drenagem e iluminação no Terreirão.',
   NOW() - INTERVAL '50 days', NOW())
ON CONFLICT DO NOTHING;
