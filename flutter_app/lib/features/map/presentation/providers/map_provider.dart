import 'package:flutter/foundation.dart';
import '../../../feed/data/post_service.dart';
import '../../../feed/domain/models/post_model.dart';

class MapProvider extends ChangeNotifier {
  final _service = PostService();

  List<PostModel> _markers = [];
  bool   _loading = false;
  String? _error;
  String? _typeFilter;

  List<PostModel> get markers    => _markers;
  bool            get loading    => _loading;
  String?         get error      => _error;
  String?         get typeFilter => _typeFilter;

  Future<void> loadMarkers({bool refresh = false}) async {
    if (_loading && !refresh) return;
    _loading = true;
    _error   = null;
    notifyListeners();
    try {
      _markers = await _service.fetchMapPosts(type: _typeFilter);
    } catch (_) {
      _error = 'Erro ao carregar mapa. Verifique a conexão.';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> setFilter(String? type) async {
    if (_typeFilter == type) return;
    _typeFilter = type;
    await loadMarkers(refresh: true);
  }
}
