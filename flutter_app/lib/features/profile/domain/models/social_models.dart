class ProfileModel {
  final String userId;
  final String name;
  final String email;
  final String role;
  final String? bio;
  final String? status;
  final String? city;
  final String? neighborhood;
  final String? website;
  final String? avatarUrl;
  final String? coverUrl;
  final DateTime memberSince;

  const ProfileModel({
    required this.userId,
    required this.name,
    required this.email,
    required this.role,
    this.bio,
    this.status,
    this.city,
    this.neighborhood,
    this.website,
    this.avatarUrl,
    this.coverUrl,
    required this.memberSince,
  });

  String get roleLabel => switch (role) {
    'citizen'      => 'Cidadão / Morador',
    'organization' => 'Organização / ONG',
    'association'  => 'Associação',
    'government'   => 'Governo / Prefeitura',
    'business'     => 'Empresa / Patrocinador',
    _              => role,
  };

  String get locationLabel {
    if (neighborhood != null && city != null) return '$neighborhood, $city';
    return city ?? neighborhood ?? '';
  }
}

class ScrapModel {
  final String id;
  final String authorId;
  final String authorName;
  final String targetUserId;
  final String content;
  final DateTime createdAt;

  const ScrapModel({
    required this.id,
    required this.authorId,
    required this.authorName,
    required this.targetUserId,
    required this.content,
    required this.createdAt,
  });
}

class TestimonialModel {
  final String id;
  final String authorId;
  final String authorName;
  final String targetUserId;
  final String content;
  final DateTime createdAt;

  const TestimonialModel({
    required this.id,
    required this.authorId,
    required this.authorName,
    required this.targetUserId,
    required this.content,
    required this.createdAt,
  });
}

class CommunityModel {
  final String id;
  final String name;
  final String description;
  final int memberCount;
  final String category;
  final String? imageUrl;

  const CommunityModel({
    required this.id,
    required this.name,
    required this.description,
    required this.memberCount,
    required this.category,
    this.imageUrl,
  });
}
