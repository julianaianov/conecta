import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../../data/auth_service.dart';
import '../../domain/models/user_model.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  final _service = AuthService();

  AuthStatus _status = AuthStatus.unknown;
  UserModel? _user;
  String?    _error;
  bool       _demoMode = false;

  AuthStatus get status        => _status;
  UserModel? get user          => _user;
  String?    get error         => _error;
  bool       get isLoading     => _status == AuthStatus.unknown;
  bool       get isLoggedIn    => _status == AuthStatus.authenticated;
  bool       get isDemoMode    => _demoMode;

  Future<void> checkAuth() async {
    final user = await _service.verifyToken();
    _demoMode = await _service.isDemoMode;
    _status = user != null ? AuthStatus.authenticated : AuthStatus.unauthenticated;
    _user   = user;
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    _error = null;
    try {
      _user     = await _service.login(email: email, password: password);
      _demoMode = await _service.isDemoMode;
      _status   = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on DioException catch (e) {
      _error = _parseError(e);
      notifyListeners();
      return false;
    }
  }

  /// Entrar em modo demo sem precisar de servidor.
  Future<bool> loginDemo() async {
    _error = null;
    try {
      _user     = await _service.loginDemo();
      _demoMode = true;
      _status   = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } catch (_) {
      _error = 'Erro ao iniciar modo demo';
      notifyListeners();
      return false;
    }
  }

  Future<bool> register({
    required String email,
    required String password,
    required String name,
    required String role,
  }) async {
    _error = null;
    try {
      _user   = await _service.register(email: email, password: password, name: name, role: role);
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on DioException catch (e) {
      _error  = _parseError(e);
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await _service.logout();
    _user     = null;
    _demoMode = false;
    _status   = AuthStatus.unauthenticated;
    notifyListeners();
  }

  String _parseError(DioException e) {
    final data = e.response?.data;
    if (data is Map) return data['error']?.toString() ?? 'Erro desconhecido';
    return 'Erro de conexão. Verifique se o servidor está rodando.';
  }
}
