class AppConfig {
  // Android emulator: 10.0.2.2 aponta para localhost da máquina
  // iOS simulator / web: localhost
  // Dispositivo físico na mesma rede: IP da sua máquina, ex: 192.168.1.100
  static const String baseUrl = 'http://192.168.1.30:8080';

  static const String authPath  = '/api/auth';
  static const String usersPath = '/api/users';
  static const String postsPath = '/api/posts';

  /// Usa dados demo do Recreio quando a API não responde.
  static const bool useDemoFallback = true;

  /// Conta demo para login: maria@recreio.conecta / demo123
  static const String demoEmail    = 'maria@recreio.conecta';
  static const String demoPassword = 'demo123';
}
