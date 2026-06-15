import '../../features/profile/domain/models/social_models.dart';
import '../theme/app_images.dart';

/// Dados sociais demo estilo Orkut — perfis, amigos, scraps e depoimentos.
class DemoSocial {
  DemoSocial._();

  static const mariaId  = '11111111-1111-1111-1111-111111111111';
  static const ongId    = '22222222-2222-2222-2222-222222222222';
  static const govId    = '33333333-3333-3333-3333-333333333333';
  static const bizId    = '44444444-4444-4444-4444-444444444444';

  static final List<ProfileModel> profiles = [
    ProfileModel(
      userId: mariaId,
      name: 'Maria Silva',
      email: 'maria@recreio.conecta',
      role: 'citizen',
      bio: 'Moradora do Recreio há 15 anos. Apaixonada por praia, ciclismo e transformação do bairro. 🌊',
      status: 'Moradora do Recreio · Solteira',
      city: 'Rio de Janeiro',
      neighborhood: 'Recreio dos Bandeirantes',
      avatarUrl: AppImages.avatarByUser[mariaId],
      coverUrl: AppImages.coverByUser[mariaId],
      memberSince: DateTime(2024, 3, 15),
    ),
    ProfileModel(
      userId: ongId,
      name: 'Associação Recreio Verde',
      email: 'ong@recreio.conecta',
      role: 'association',
      bio: 'Associação de moradores do Recreio. Mutirões de limpeza, hortas comunitárias e educação ambiental.',
      status: 'Associação de bairro',
      city: 'Rio de Janeiro',
      neighborhood: 'Recreio dos Bandeirantes',
      website: 'recreioverde.org.br',
      avatarUrl: AppImages.avatarByUser[ongId],
      coverUrl: AppImages.coverByUser[ongId],
      memberSince: DateTime(2023, 8, 1),
    ),
    ProfileModel(
      userId: govId,
      name: 'Subprefeitura do Recreio',
      email: 'prefeitura@recreio.conecta',
      role: 'government',
      bio: 'Canal oficial da Subprefeitura do Recreio dos Bandeirantes. Ouvimos e respondemos demandas locais.',
      status: 'Órgão público',
      city: 'Rio de Janeiro',
      neighborhood: 'Recreio dos Bandeirantes',
      avatarUrl: AppImages.avatarByUser[govId],
      coverUrl: AppImages.coverByUser[govId],
      memberSince: DateTime(2023, 1, 10),
    ),
    ProfileModel(
      userId: bizId,
      name: 'Recreio Construções Ltda',
      email: 'empresa@recreio.conecta',
      role: 'business',
      bio: 'Construtora local apoiando projetos comunitários do Recreio. Patrocinadora de mutirões e eventos.',
      status: 'Empresa local · Patrocinadora',
      city: 'Rio de Janeiro',
      neighborhood: 'Recreio dos Bandeirantes',
      website: 'recreioconstrucoes.com.br',
      avatarUrl: AppImages.avatarByUser[bizId],
      coverUrl: AppImages.coverByUser[bizId],
      memberSince: DateTime(2024, 1, 20),
    ),
  ];

  static final Map<String, List<String>> _friends = {
    mariaId: [ongId, govId, bizId],
    ongId:   [mariaId, govId, bizId],
    govId:   [mariaId, ongId],
    bizId:   [mariaId, ongId],
  };

  static final List<ScrapModel> _scraps = [
    ScrapModel(
      id: 's1', authorId: ongId, authorName: 'Associação Recreio Verde',
      targetUserId: mariaId,
      content: 'Maria, obrigada por participar do mutirão de sábado! Você arrasou na limpeza da praia! 🏖️',
      createdAt: DateTime.now().subtract(const Duration(hours: 5)),
    ),
    ScrapModel(
      id: 's2', authorId: govId, authorName: 'Subprefeitura do Recreio',
      targetUserId: mariaId,
      content: 'Recebemos sua denúncia sobre a iluminação na Av. Gen. Barreto. Equipe técnica agendada para vistoria.',
      createdAt: DateTime.now().subtract(const Duration(days: 1)),
    ),
    ScrapModel(
      id: 's3', authorId: mariaId, authorName: 'Maria Silva',
      targetUserId: mariaId,
      content: 'Bom dia, Recreio! Hoje é dia de pedalar pela orla e sonhar com um bairro melhor. 🚴‍♀️',
      createdAt: DateTime.now().subtract(const Duration(days: 2)),
    ),
    ScrapModel(
      id: 's4', authorId: bizId, authorName: 'Recreio Construções Ltda',
      targetUserId: mariaId,
      content: 'Parabéns pelo engajamento comunitário, Maria! Conte conosco para os próximos projetos.',
      createdAt: DateTime.now().subtract(const Duration(days: 4)),
    ),
    ScrapModel(
      id: 's5', authorId: mariaId, authorName: 'Maria Silva',
      targetUserId: ongId,
      content: 'Adorei a horta comunitária! Já quero levar minhas mudas de hortelã na próxima visita. 🌱',
      createdAt: DateTime.now().subtract(const Duration(days: 3)),
    ),
    ScrapModel(
      id: 's6', authorId: mariaId, authorName: 'Maria Silva',
      targetUserId: govId,
      content: 'Quando teremos resposta sobre o buraco na Av. das Américas? Muita gente passando por lá todo dia.',
      createdAt: DateTime.now().subtract(const Duration(hours: 12)),
    ),
    ScrapModel(
      id: 's7', authorId: ongId, authorName: 'Associação Recreio Verde',
      targetUserId: ongId,
      content: 'Próximo mutirão: sábado às 8h na Praia do Recreio. Traga luvas e garrafa d\'água!',
      createdAt: DateTime.now().subtract(const Duration(days: 1)),
    ),
  ];

  static final List<TestimonialModel> _testimonials = [
    TestimonialModel(
      id: 't1', authorId: ongId, authorName: 'Associação Recreio Verde',
      targetUserId: mariaId,
      content: 'Maria é uma das moradoras mais engajadas do Recreio. Sempre presente nos mutirões e sempre com ideias boas!',
      createdAt: DateTime(2025, 11, 10),
    ),
    TestimonialModel(
      id: 't2', authorId: govId, authorName: 'Subprefeitura do Recreio',
      targetUserId: mariaId,
      content: 'Cidadã exemplar. Suas denúncias são detalhadas e ajudam muito nosso trabalho de campo.',
      createdAt: DateTime(2025, 10, 5),
    ),
    TestimonialModel(
      id: 't3', authorId: bizId, authorName: 'Recreio Construções Ltda',
      targetUserId: mariaId,
      content: 'Parceira de confiança nos projetos comunitários. Recomendo!',
      createdAt: DateTime(2025, 9, 20),
    ),
    TestimonialModel(
      id: 't4', authorId: mariaId, authorName: 'Maria Silva',
      targetUserId: ongId,
      content: 'A Recreio Verde transformou nossa praça. Projeto lindo e muito bem organizado!',
      createdAt: DateTime(2025, 8, 15),
    ),
  ];

  static final List<CommunityModel> communities = [
    CommunityModel(
      id: 'c1',
      name: 'Moradores do Recreio',
      description: 'Grupo oficial de moradores do Recreio dos Bandeirantes.',
      memberCount: 1247,
      category: 'Bairro',
      imageUrl: AppImages.communityById['c1'],
    ),
    CommunityModel(
      id: 'c2',
      name: 'Mutirão Recreio Verde',
      description: 'Voluntários de limpeza e sustentabilidade na orla.',
      memberCount: 389,
      category: 'Ambiental',
      imageUrl: AppImages.communityById['c2'],
    ),
    CommunityModel(
      id: 'c3',
      name: 'Ciclistas da Orla',
      description: 'Pedal, segurança e mobilidade no Recreio.',
      memberCount: 156,
      category: 'Mobilidade',
      imageUrl: AppImages.communityById['c3'],
    ),
    CommunityModel(
      id: 'c4',
      name: 'Feira de Sustentabilidade',
      description: 'Organização do evento anual no Recreio Shopping.',
      memberCount: 78,
      category: 'Eventos',
      imageUrl: AppImages.communityById['c4'],
    ),
  ];

  static ProfileModel? getProfile(String userId) {
    try {
      return profiles.firstWhere((p) => p.userId == userId);
    } catch (_) {
      return null;
    }
  }

  static List<ProfileModel> getFriends(String userId) {
    final ids = _friends[userId] ?? [];
    return ids.map(getProfile).whereType<ProfileModel>().toList();
  }

  static int friendCount(String userId) => (_friends[userId] ?? []).length;

  static List<ScrapModel> getScraps(String userId) =>
      _scraps.where((s) => s.targetUserId == userId).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

  static List<TestimonialModel> getTestimonials(String userId) =>
      _testimonials.where((t) => t.targetUserId == userId).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

  static void addScrap({
    required String authorId,
    required String authorName,
    required String targetUserId,
    required String content,
  }) {
    _scraps.insert(0, ScrapModel(
      id: 's${_scraps.length + 1}',
      authorId: authorId,
      authorName: authorName,
      targetUserId: targetUserId,
      content: content,
      createdAt: DateTime.now(),
    ));
  }
}
