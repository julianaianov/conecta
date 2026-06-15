import 'dart:convert';

class UserModel {
  final String id;
  final String email;
  final String name;
  final String role;
  final String? avatarUrl;

  const UserModel({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    this.avatarUrl,
  });

  factory UserModel.fromJson(Map<String, dynamic> j) => UserModel(
    id:        j['id']         as String,
    email:     j['email']      as String,
    name:      j['name']       as String,
    role:      j['role']       as String,
    avatarUrl: j['avatar_url'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'id': id, 'email': email, 'name': name,
    'role': role, 'avatar_url': avatarUrl,
  };

  String toJsonString() => jsonEncode(toJson());

  static UserModel fromJsonString(String s) => UserModel.fromJson(jsonDecode(s) as Map<String, dynamic>);

  String get roleLabel => switch (role) {
    'citizen'      => 'Cidadão',
    'organization' => 'Organização / ONG',
    'association'  => 'Associação',
    'government'   => 'Governo / Prefeitura',
    'business'     => 'Empresa / Patrocinador',
    _              => role,
  };
}
