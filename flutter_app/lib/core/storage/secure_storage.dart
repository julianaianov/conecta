import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  static final SecureStorage _instance = SecureStorage._();
  factory SecureStorage() => _instance;
  SecureStorage._();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _tokenKey        = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _userKey         = 'user_json';
  static const _demoModeKey     = 'demo_mode';

  Future<void> saveToken(String token)             => _storage.write(key: _tokenKey,        value: token);
  Future<void> saveRefreshToken(String token)      => _storage.write(key: _refreshTokenKey, value: token);
  Future<void> saveUser(String userJson)           => _storage.write(key: _userKey,         value: userJson);
  Future<void> setDemoMode(bool enabled)           =>
      _storage.write(key: _demoModeKey, value: enabled.toString());

  Future<String?> getToken()        => _storage.read(key: _tokenKey);
  Future<String?> getRefreshToken() => _storage.read(key: _refreshTokenKey);
  Future<String?> getUser()         => _storage.read(key: _userKey);
  Future<bool> isDemoMode() async   => (await _storage.read(key: _demoModeKey)) == 'true';

  Future<void> clear() => _storage.deleteAll();
}
