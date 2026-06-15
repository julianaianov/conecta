import 'package:dio/dio.dart';
import '../../../core/config/app_config.dart';
import '../../../core/demo/demo_auth.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../domain/models/user_model.dart';

class AuthService {
  final _dio     = ApiClient().dio;
  final _storage = SecureStorage();

  Future<UserModel> register({
    required String email,
    required String password,
    required String name,
    required String role,
  }) async {
    final res = await _dio.post('${AppConfig.authPath}/register', data: {
      'email': email, 'password': password, 'name': name, 'role': role,
    });
    await _storage.setDemoMode(false);
    return _saveAndReturn(res.data as Map<String, dynamic>);
  }

  Future<UserModel> login({required String email, required String password}) async {
    try {
      final res = await _dio.post('${AppConfig.authPath}/login', data: {
        'email': email, 'password': password,
      });
      await _storage.setDemoMode(false);
      return _saveAndReturn(res.data as Map<String, dynamic>);
    } on DioException {
      if (AppConfig.useDemoFallback && DemoAuth.isDemoCredentials(email, password)) {
        return loginDemo();
      }
      rethrow;
    }
  }

  /// Entrada offline — não precisa de servidor.
  Future<UserModel> loginDemo() async {
    await _storage.saveToken(DemoAuth.demoToken);
    await _storage.saveRefreshToken(DemoAuth.demoToken);
    await _storage.saveUser(DemoAuth.user.toJsonString());
    await _storage.setDemoMode(true);
    return DemoAuth.user;
  }

  Future<UserModel?> verifyToken() async {
    final token = await _storage.getToken();
    if (token == null) return null;

    if (DemoAuth.isDemoToken(token) || await _storage.isDemoMode()) {
      final userJson = await _storage.getUser();
      if (userJson != null) return UserModel.fromJsonString(userJson);
      return DemoAuth.user;
    }

    try {
      final res = await _dio.get('${AppConfig.authPath}/verify');
      final user = UserModel.fromJson(res.data['user'] as Map<String, dynamic>);
      await _storage.saveUser(user.toJsonString());
      return user;
    } on DioException {
      return null;
    }
  }

  Future<void> logout() async {
    await _storage.clear();
  }

  Future<bool> get isDemoMode => _storage.isDemoMode();

  Future<UserModel> _saveAndReturn(Map<String, dynamic> data) async {
    final user = UserModel.fromJson(data['user'] as Map<String, dynamic>);
    await _storage.saveToken(data['token'] as String);
    await _storage.saveRefreshToken(data['refreshToken'] as String);
    await _storage.saveUser(user.toJsonString());
    return user;
  }
}
