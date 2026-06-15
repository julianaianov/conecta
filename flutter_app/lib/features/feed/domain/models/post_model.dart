import '../../../../core/theme/app_images.dart';

class PostModel {
  final String   id;
  final String   authorId;
  final String   authorName;
  final String?  authorAvatar;
  final PostType type;
  final String   title;
  final String   description;
  final PostStatus status;
  final double?  latitude;
  final double?  longitude;
  final String?  neighborhood;
  final String?  city;
  final List<String> images;
  final List<String> tags;
  final int reactionsCount;
  final int commentsCount;
  final int viewsCount;
  final DateTime createdAt;

  const PostModel({
    required this.id,
    required this.authorId,
    required this.authorName,
    this.authorAvatar,
    required this.type,
    required this.title,
    required this.description,
    required this.status,
    this.latitude,
    this.longitude,
    this.neighborhood,
    this.city,
    required this.images,
    required this.tags,
    required this.reactionsCount,
    required this.commentsCount,
    required this.viewsCount,
    required this.createdAt,
  });

  factory PostModel.fromJson(Map<String, dynamic> j) => PostModel(
    id:             j['id']             as String,
    authorId:       j['author_id']      as String,
    authorName:     j['author_name']    as String? ?? 'Anônimo',
    authorAvatar:   j['author_avatar']  as String?,
    type:           PostType.fromString(j['type'] as String),
    title:          j['title']          as String,
    description:    j['description']    as String,
    status:         PostStatus.fromString(j['status'] as String? ?? 'active'),
    latitude:       (j['latitude']  as num?)?.toDouble(),
    longitude:      (j['longitude'] as num?)?.toDouble(),
    neighborhood:   j['neighborhood']   as String?,
    city:           j['city']           as String?,
    images:         (j['images']  as List?)?.cast<String>() ?? [],
    tags:           (j['tags']    as List?)?.cast<String>() ?? [],
    reactionsCount: (j['reactions_count'] as num?)?.toInt() ?? 0,
    commentsCount:  (j['comments_count']  as num?)?.toInt() ?? 0,
    viewsCount:     (j['views_count']     as num?)?.toInt() ?? 0,
    createdAt:      DateTime.parse(j['created_at'] as String),
  );

  String get locationLabel {
    if (neighborhood != null && city != null) return '$neighborhood, $city';
    if (neighborhood != null) return neighborhood!;
    if (city != null) return city!;
    return '';
  }

  String get coverImageUrl => AppImages.coverFor(id: id, type: type.value, images: images);
}

// ── Enums ────────────────────────────────────────────────────────────────────

enum PostType {
  problem ('problem',  'Problema',    0xFFF66B0E),
  project ('project',  'Projeto',     0xFF205375),
  need    ('need',     'Necessidade', 0xFFF8833A),
  event   ('event',    'Evento',      0xFF5483A9),
  action  ('action',   'Ação',        0xFF112B3C),
  message ('message',  'Mensagem',    0xFF1565C0);

  const PostType(this.value, this.label, this.colorValue);
  final String value;
  final String label;
  final int    colorValue;

  static PostType fromString(String s) =>
      PostType.values.firstWhere((e) => e.value == s, orElse: () => PostType.problem);
}

enum PostStatus {
  active    ('active',     'Ativo'),
  inProgress('in_progress','Em andamento'),
  resolved  ('resolved',   'Resolvido'),
  cancelled ('cancelled',  'Cancelado');

  const PostStatus(this.value, this.label);
  final String value;
  final String label;

  static PostStatus fromString(String s) =>
      PostStatus.values.firstWhere((e) => e.value == s, orElse: () => PostStatus.active);
}
