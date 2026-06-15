import '../../features/auth/domain/models/user_model.dart';

/// Autenticação local — funciona sem servidor.
class DemoAuth {
  DemoAuth._();

  static const demoToken = 'demo_offline_token_conecta';

  static const user = UserModel(
    id:    '11111111-1111-1111-1111-111111111111',
    email: 'maria@recreio.conecta',
    name:  'Maria Silva',
    role:  'citizen',
  );

  static bool isDemoCredentials(String email, String password) =>
      email.trim().toLowerCase() == 'maria@recreio.conecta' &&
      password == 'demo123';

  static bool isDemoToken(String? value) => value == demoToken;
}
