import '../theme/app_images.dart';
import '../../features/feed/domain/models/post_model.dart';
import '../../features/post/domain/models/support_type.dart';
import '../../features/post/domain/models/support_record.dart';

/// Dados demo do Recreio dos Bandeirantes — fallback quando a API não responde.
class DemoData {
  DemoData._();

  static const neighborhood = 'Recreio dos Bandeirantes';
  static const city         = 'Rio de Janeiro';

  static final List<PostModel> _posts = [
    _post(
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      authorId: '11111111-1111-1111-1111-111111111111',
      authorName: 'Maria Silva',
      type: PostType.problem,
      title: 'Buraco na Av. das Américas',
      description: 'Buraco grande próximo ao Recreio Shopping, na altura do posto de gasolina. Risco para ciclistas e motociclistas, especialmente à noite.',
      lat: -23.0245, lng: -43.4580,
      tags: ['infraestrutura', 'transito', 'asfalto'],
      images: [AppImages.postById['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']!],
      reactions: 12, comments: 2, views: 87, daysAgo: 2,
    ),
    _post(
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      authorId: '22222222-2222-2222-2222-222222222222',
      authorName: 'Associação Recreio Verde',
      type: PostType.project,
      title: 'Mutirão de limpeza da Praia do Recreio',
      description: 'Voluntários reunidos todo sábado às 8h na orla, em frente à faixa de areia central. Traga luvas e garrafa de água!',
      lat: -23.0290, lng: -43.4650,
      tags: ['ambiental', 'praia', 'voluntariado'],
      images: [AppImages.postById['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb']!],
      reactions: 28, comments: 3, views: 156, daysAgo: 5,
    ),
    _post(
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      authorId: '11111111-1111-1111-1111-111111111111',
      authorName: 'Maria Silva',
      type: PostType.problem,
      title: 'Iluminação precária na Av. Gen. Barreto',
      description: 'Trecho entre a Rua Guignard e a Av. das Américas está escuro. Moradores relatam insegurança ao caminhar à noite.',
      lat: -23.0260, lng: -43.4610,
      tags: ['seguranca', 'iluminacao', 'infraestrutura'],
      images: [AppImages.postById['cccccccc-cccc-cccc-cccc-cccccccccccc']!],
      reactions: 19, comments: 1, views: 64, daysAgo: 1,
    ),
    _post(
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      authorId: '22222222-2222-2222-2222-222222222222',
      authorName: 'Associação Recreio Verde',
      type: PostType.project,
      title: 'Horta comunitária do Recreio',
      description: 'Projeto de horta urbana na praça da Rua Guignard. Já plantamos tomate, alface e hortelã. Precisamos de mais voluntários!',
      status: PostStatus.inProgress,
      lat: -23.0255, lng: -43.4540,
      tags: ['sustentabilidade', 'horta', 'comunidade'],
      images: [AppImages.postById['dddddddd-dddd-dddd-dddd-dddddddddddd']!],
      reactions: 35, comments: 2, views: 203, daysAgo: 10,
    ),
    _post(
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      authorId: '33333333-3333-3333-3333-333333333333',
      authorName: 'Subprefeitura do Recreio',
      type: PostType.need,
      title: 'Doação de cestas básicas — famílias afetadas',
      description: 'Identificamos 40 famílias no Recreio que precisam de cestas básicas este mês. Aceitamos doações de alimentos não perecíveis.',
      lat: -23.0230, lng: -43.4510,
      tags: ['doacao', 'alimentos', 'solidariedade'],
      images: [AppImages.postById['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee']!],
      reactions: 22, comments: 1, views: 98, daysAgo: 3,
    ),
    _post(
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      authorId: '44444444-4444-4444-4444-444444444444',
      authorName: 'Recreio Construções Ltda',
      type: PostType.event,
      title: 'Feira de Sustentabilidade do Recreio',
      description: 'Feira gratuita no estacionamento do Recreio Shopping, dia 15, das 10h às 18h. Palestras, oficinas e expositores locais.',
      lat: -23.0240, lng: -43.4575,
      tags: ['evento', 'sustentabilidade', 'feira'],
      images: [AppImages.postById['ffffffff-ffff-ffff-ffff-ffffffffffff']!],
      reactions: 41, comments: 2, views: 312, daysAgo: 7,
    ),
    _post(
      id: '10101010-1010-1010-1010-101010101010',
      authorId: '22222222-2222-2222-2222-222222222222',
      authorName: 'Associação Recreio Verde',
      type: PostType.action,
      title: 'Plantio de mudas nativas na orla',
      description: 'Ação de reflorestamento com 200 mudas nativas da restinga. Encontro na Praia do Recreio, domingo às 7h.',
      lat: -23.0285, lng: -43.4640,
      tags: ['ambiental', 'plantio', 'restinga'],
      images: [AppImages.postById['10101010-1010-1010-1010-101010101010']!],
      reactions: 17, comments: 1, views: 74, daysAgo: 4,
    ),
    _post(
      id: '20202020-2020-2020-2020-202020202020',
      authorId: '11111111-1111-1111-1111-111111111111',
      authorName: 'Maria Silva',
      type: PostType.problem,
      title: 'Alagamento na Rua Guignard',
      description: 'Após chuvas fortes, a Rua Guignard alaga próximo ao cruzamento com a Av. Gen. Barreto. Problema recorrente há 2 anos.',
      status: PostStatus.resolved,
      lat: -23.0265, lng: -43.4605,
      tags: ['drenagem', 'alagamento', 'chuva'],
      images: [AppImages.postById['20202020-2020-2020-2020-202020202020']!],
      reactions: 8, comments: 1, views: 145, daysAgo: 20,
    ),
    _post(
      id: '30303030-3030-3030-3030-303030303030',
      authorId: '44444444-4444-4444-4444-444444444444',
      authorName: 'Recreio Construções Ltda',
      type: PostType.event,
      title: 'Campeonato de futebol comunitário',
      description: 'Torneio de futebol de campo na quadra da Escola Municipal do Recreio. Inscrições abertas para times do bairro!',
      lat: -23.0220, lng: -43.4530,
      tags: ['esporte', 'futebol', 'comunidade'],
      images: [AppImages.postById['30303030-3030-3030-3030-303030303030']!],
      reactions: 33, comments: 1, views: 189, daysAgo: 6,
    ),
    _post(
      id: '40404040-4040-4040-4040-404040404040',
      authorId: '33333333-3333-3333-3333-333333333333',
      authorName: 'Subprefeitura do Recreio',
      type: PostType.need,
      title: 'Voluntários para aulas de reforço escolar',
      description: 'Programa de reforço gratuito para estudantes do Recreio. Precisamos de 10 voluntários para matemática e português.',
      lat: -23.0235, lng: -43.4555,
      tags: ['educacao', 'voluntariado', 'escola'],
      images: [AppImages.postById['40404040-4040-4040-4040-404040404040']!],
      reactions: 15, comments: 1, views: 67, daysAgo: 8,
    ),
  ];

  static final Map<String, List<Map<String, dynamic>>> _comments = {
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa': [
      _comment('22222222-2222-2222-2222-222222222222', 'Associação Recreio Verde',
          'Já reportamos à prefeitura! Vamos acompanhar a resolução.', hoursAgo: 24),
      _comment('33333333-3333-3333-3333-333333333333', 'Subprefeitura do Recreio',
          'Equipe de obras programada para a próxima semana. Obrigado pelo reporte!', hoursAgo: 12),
    ],
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb': [
      _comment('11111111-1111-1111-1111-111111111111', 'Maria Silva',
          'Participo todo sábado! Venham, a praia fica linda depois do mutirão.', hoursAgo: 72),
      _comment('44444444-4444-4444-4444-444444444444', 'Recreio Construções Ltda',
          'Vamos patrocinar sacos de lixo e luvas para o próximo mutirão!', hoursAgo: 48),
      _comment('33333333-3333-3333-3333-333333333333', 'Subprefeitura do Recreio',
          'Parabéns pela iniciativa! A subprefeitura apoia o projeto.', hoursAgo: 24),
    ],
    'cccccccc-cccc-cccc-cccc-cccccccccccc': [
      _comment('33333333-3333-3333-3333-333333333333', 'Subprefeitura do Recreio',
          'Solicitação encaminhada à concessionária de iluminação pública.', hoursAgo: 6),
    ],
    'dddddddd-dddd-dddd-dddd-dddddddddddd': [
      _comment('11111111-1111-1111-1111-111111111111', 'Maria Silva',
          'Adotei uma canteiro na horta! Já colhi minha primeira alface.', hoursAgo: 120),
      _comment('44444444-4444-4444-4444-444444444444', 'Recreio Construções Ltda',
          'Doamos ferramentas e adubo para a horta. Sucesso no projeto!', hoursAgo: 96),
    ],
    'ffffffff-ffff-ffff-ffff-ffffffffffff': [
      _comment('11111111-1111-1111-1111-111111111111', 'Maria Silva',
          'Vou levar as crianças! Alguém sabe se terá estacionamento?', hoursAgo: 48),
      _comment('22222222-2222-2222-2222-222222222222', 'Associação Recreio Verde',
          'Teremos nosso estande com oficina de compostagem. Nos vemos lá!', hoursAgo: 24),
    ],
  };

  static PostModel _post({
    required String id,
    required String authorId,
    required String authorName,
    required PostType type,
    required String title,
    required String description,
    PostStatus status = PostStatus.active,
    required double lat,
    required double lng,
    required List<String> tags,
    List<String> images = const [],
    required int reactions,
    required int comments,
    required int views,
    required int daysAgo,
  }) =>
      PostModel(
        id: id,
        authorId: authorId,
        authorName: authorName,
        type: type,
        title: title,
        description: description,
        status: status,
        latitude: lat,
        longitude: lng,
        neighborhood: neighborhood,
        city: city,
        images: images,
        tags: tags,
        reactionsCount: reactions,
        commentsCount: comments,
        viewsCount: views,
        createdAt: DateTime.now().subtract(Duration(days: daysAgo)),
      );

  static Map<String, dynamic> _comment(
    String authorId,
    String authorName,
    String content, {
    required int hoursAgo,
  }) =>
      {
        'author_id': authorId,
        'author_name': authorName,
        'content': content,
        'created_at': DateTime.now().subtract(Duration(hours: hoursAgo)).toIso8601String(),
      };

  static ({List<PostModel> posts, int total}) fetchPosts({
    String? type,
    int limit = 20,
    int offset = 0,
  }) {
    var list = _posts;
    if (type != null) {
      list = list.where((p) => p.type.value == type).toList();
    }
    final total = list.length;
    final page  = list.skip(offset).take(limit).toList();
    return (posts: page, total: total);
  }

  static List<PostModel> fetchMapPosts({String? type}) {
    var list = _posts.where((p) => p.latitude != null && p.longitude != null);
    if (type != null) {
      list = list.where((p) => p.type.value == type);
    }
    return list.toList();
  }

  static PostModel? getPost(String id) {
    try {
      return _posts.firstWhere((p) => p.id == id);
    } catch (_) {
      return null;
    }
  }

  static List<Map<String, dynamic>> getComments(String postId) =>
      List<Map<String, dynamic>>.from(_comments[postId] ?? []);

  static Map<String, dynamic> addComment(String postId, String content) {
    _comments.putIfAbsent(postId, () => []);
    final comment = {
      'author_id': _demoUserId,
      'author_name': 'Maria Silva',
      'content': content,
      'created_at': DateTime.now().toIso8601String(),
    };
    _comments[postId]!.add(comment);
    final idx = _posts.indexWhere((p) => p.id == postId);
    if (idx >= 0) {
      final p = _posts[idx];
      _posts[idx] = _copyPost(p, comments: p.commentsCount + 1);
    }
    return comment;
  }

  static const _demoUserId = '11111111-1111-1111-1111-111111111111';

  static final Map<String, List<Map<String, dynamic>>> _supports = {
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb': [
      {
        'id': 's1000001-0000-0000-0000-000000000001',
        'type': 'volunteering', 'user_id': _demoUserId, 'user_name': 'Maria Silva',
        'message': 'Posso ajudar todo sábado',
        'details': {'description': 'Organização do mutirão', 'hours_per_week': '4h'},
        'status': 'confirmed',
        'created_at': DateTime.now().subtract(const Duration(days: 3)).toIso8601String(),
      },
    ],
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa': [
      {
        'id': 's1000002-0000-0000-0000-000000000002',
        'type': 'financial', 'user_id': _demoUserId, 'user_name': 'Maria Silva',
        'amount': 50.0, 'payment_method': 'pix', 'message': 'Para o conserto do asfalto',
        'details': {'payment_simulated': true},
        'status': 'confirmed',
        'created_at': DateTime.now().subtract(const Duration(days: 1)).toIso8601String(),
      },
    ],
  };

  static ({List<SupportSummary> summary, List<Map<String, dynamic>> supports}) fetchSupports(
    String postId,
  ) {
    final list = _supports[postId] ?? [];
    final counts = <String, int>{};
    for (final s in list) {
      final t = s['type'] as String;
      counts[t] = (counts[t] ?? 0) + 1;
    }
    final summary = counts.entries
        .map((e) => SupportSummary(type: SupportType.fromString(e.key), count: e.value))
        .toList();
    return (summary: summary, supports: List<Map<String, dynamic>>.from(list));
  }

  static List<Map<String, dynamic>> getMySupports(String postId) {
    final list = _supports[postId] ?? [];
    return list.where((s) => s['user_id'] == _demoUserId).toList();
  }

  static Map<String, dynamic> createSupport(
    String postId,
    String type, {
    String? message,
    double? amount,
    String? paymentMethod,
    Map<String, dynamic>? details,
  }) {
    _supports.putIfAbsent(postId, () => []);
    final list = _supports[postId]!;
    final idx  = list.indexWhere((s) => s['user_id'] == _demoUserId && s['type'] == type);

    final postIdx = _posts.indexWhere((p) => p.id == postId);
    var count = postIdx >= 0 ? _posts[postIdx].reactionsCount : 0;
    String action;

    final entry = {
      'id': 's-${DateTime.now().millisecondsSinceEpoch}',
      'type': type,
      'user_id': _demoUserId,
      'user_name': 'Maria Silva',
      'post_id': postId,
      if (message != null) 'message': message,
      if (amount != null) 'amount': amount,
      if (paymentMethod != null) 'payment_method': paymentMethod,
      'details': details ?? {},
      'status': 'confirmed',
      'created_at': DateTime.now().toIso8601String(),
    };

    if (idx >= 0) {
      list[idx] = entry;
      action = 'updated';
    } else {
      list.add(entry);
      count += 1;
      action = 'added';
      if (postIdx >= 0) _posts[postIdx] = _copyPost(_posts[postIdx], reactions: count);
    }

    return {'action': action, 'type': type, 'reactions_count': count, 'support': entry};
  }

  static void removeSupport(String postId, String type) {
    _supports.putIfAbsent(postId, () => []);
    final list = _supports[postId]!;
    list.removeWhere((s) => s['user_id'] == _demoUserId && s['type'] == type);
    final postIdx = _posts.indexWhere((p) => p.id == postId);
    if (postIdx >= 0) {
      final p = _posts[postIdx];
      _posts[postIdx] = _copyPost(p, reactions: (p.reactionsCount - 1).clamp(0, 999999));
    }
  }

  static List<SupportRecord> fetchAllMySupports() {
    final records = <SupportRecord>[];
    for (final post in _posts) {
      final list = _supports[post.id] ?? [];
      for (final s in list.where((x) => x['user_id'] == _demoUserId)) {
        records.add(SupportRecord.fromJson({
          ...s,
          'post_id': post.id,
          'post_title': post.title,
          'post_type': post.type.value,
          'neighborhood': post.neighborhood,
          'city': post.city,
        }));
      }
    }
    records.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return records;
  }

  static Map<String, dynamic> toggleSupport(String postId, String type, {String? message}) =>
      createSupport(postId, type, message: message);

  static PostModel _copyPost(PostModel p, {int? reactions, int? comments}) => PostModel(
    id: p.id, authorId: p.authorId, authorName: p.authorName,
    authorAvatar: p.authorAvatar, type: p.type, title: p.title,
    description: p.description, status: p.status, latitude: p.latitude,
    longitude: p.longitude, neighborhood: p.neighborhood, city: p.city,
    images: p.images, tags: p.tags,
    reactionsCount: reactions ?? p.reactionsCount,
    commentsCount: comments ?? p.commentsCount,
    viewsCount: p.viewsCount,
    createdAt: p.createdAt,
  );
}
