/// Catálogo visual do dmconecta — cada imagem ligada a um post, perfil ou comunidade demo.
class AppImages {
  AppImages._();

  // ── Publicações demo (Recreio dos Bandeirantes) ───────────────────────────
  static const postById = {
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa':
        'https://images.unsplash.com/photo-1574269900165-70d8562d659d?w=800&q=80', // Buraco Av. das Américas
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb':
        'https://images.unsplash.com/photo-1618477466952-1903755ed887?w=800&q=80', // Mutirão Praia do Recreio
    'cccccccc-cccc-cccc-cccc-cccccccccccc':
        'https://images.unsplash.com/photo-1519501025260-77648324155e?w=800&q=80', // Iluminação Av. Gen. Barreto
    'dddddddd-dddd-dddd-dddd-dddddddddddd':
        'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80', // Horta comunitária
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee':
        'https://images.unsplash.com/photo-1593113598331-c7886c94e3b0?w=800&q=80', // Cestas básicas
    'ffffffff-ffff-ffff-ffff-ffffffffffff':
        'https://images.unsplash.com/photo-1531058040493-90488741b951?w=800&q=80', // Feira de Sustentabilidade
    '10101010-1010-1010-1010-101010101010':
        'https://images.unsplash.com/photo-1464226184884-fa280b87f0c6?w=800&q=80', // Plantio de mudas na orla
    '20202020-2020-2020-2020-202020202020':
        'https://images.unsplash.com/photo-1427720656207-7dce240d7d98?w=800&q=80', // Alagamento Rua Guignard
    '30303030-3030-3030-3030-303030303030':
        'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', // Futebol comunitário
    '40404040-4040-4040-4040-404040404040':
        'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80', // Reforço escolar
  };

  static const avatarByUser = {
    '11111111-1111-1111-1111-111111111111':
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop', // Maria Silva
    '22222222-2222-2222-2222-222222222222':
        'https://images.unsplash.com/photo-1529156069898-49953e39b684?w=200&h=200&fit=crop', // Associação Recreio Verde
    '33333333-3333-3333-3333-333333333333':
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=200&h=200&fit=crop', // Subprefeitura
    '44444444-4444-4444-4444-444444444444':
        'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=200&h=200&fit=crop', // Recreio Construções
  };

  static const coverByUser = {
    '11111111-1111-1111-1111-111111111111':
        'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=1200&q=80',
    '22222222-2222-2222-2222-222222222222':
        'https://images.unsplash.com/photo-1618477466952-1903755ed887?w=1200&q=80',
    '33333333-3333-3333-3333-333333333333':
        'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1200&q=80',
    '44444444-4444-4444-4444-444444444444':
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=80',
  };

  static const communityById = {
    'c1': 'https://images.unsplash.com/photo-1543349250-86449f172c69?w=800&q=80',
    'c2': 'https://images.unsplash.com/photo-1618477466952-1903755ed887?w=800&q=80',
    'c3': 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800&q=80',
    'c4': 'https://images.unsplash.com/photo-1531058040493-90488741b951?w=800&q=80',
  };

  static const heroCover =
      'https://images.unsplash.com/photo-1618477466952-1903755ed887?w=1200&q=80';

  static String coverFor({
    required String id,
    required String type,
    List<String> images = const [],
  }) {
    if (images.isNotEmpty) return images.first;
    return postById[id] ?? postById['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']!;
  }

  static String avatarFor(String userId, {String? override, required String name}) =>
      override ?? avatarByUser[userId] ?? '';

  static String coverForUser(String userId, {String? override}) =>
      override ?? coverByUser[userId] ?? heroCover;

  static String communityImage(String id) =>
      communityById[id] ?? heroCover;
}
