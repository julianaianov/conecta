import 'package:flutter/foundation.dart';
import '../../data/post_service.dart';
import '../../domain/models/post_model.dart';

class FeedProvider extends ChangeNotifier {
  final _service = PostService();

  List<PostModel> _posts    = [];
  bool   _loading           = false;
  bool   _hasMore           = true;
  String? _error;
  String? _typeFilter;
  int    _offset            = 0;
  static const _pageSize    = 20;

  List<PostModel> get posts       => _posts;
  bool            get loading     => _loading;
  bool            get hasMore     => _hasMore;
  String?         get error       => _error;
  String?         get typeFilter  => _typeFilter;

  Future<void> loadPosts({bool refresh = false}) async {
    if (_loading) return;
    if (refresh) {
      _posts   = [];
      _offset  = 0;
      _hasMore = true;
      _error   = null;
    }
    if (!_hasMore) return;

    _loading = true;
    notifyListeners();

    try {
      final result = await _service.fetchPosts(
        type: _typeFilter, limit: _pageSize, offset: _offset,
      );
      _posts.addAll(result.posts);
      _offset  += result.posts.length;
      _hasMore  = _posts.length < result.total;
      _error    = null;
    } catch (e) {
      _error = 'Erro ao carregar publicações. Verifique a conexão.';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> setFilter(String? type) async {
    if (_typeFilter == type) return;
    _typeFilter = type;
    await loadPosts(refresh: true);
  }

  void updatePostReaction(String postId, String action) {
    updatePostSupportCount(postId, action == 'added' ? 1 : -1);
  }

  void updatePostSupportCount(String postId, int delta) {
    final idx = _posts.indexWhere((p) => p.id == postId);
    if (idx == -1) return;
    final p = _posts[idx];
    _posts[idx] = PostModel(
      id: p.id, authorId: p.authorId, authorName: p.authorName,
      authorAvatar: p.authorAvatar, type: p.type, title: p.title,
      description: p.description, status: p.status, latitude: p.latitude,
      longitude: p.longitude, neighborhood: p.neighborhood, city: p.city,
      images: p.images, tags: p.tags,
      reactionsCount: (p.reactionsCount + delta).clamp(0, 999999),
      commentsCount: p.commentsCount, viewsCount: p.viewsCount,
      createdAt: p.createdAt,
    );
    notifyListeners();
  }

  void setPostSupportCount(String postId, int count) {
    final idx = _posts.indexWhere((p) => p.id == postId);
    if (idx == -1) return;
    final p = _posts[idx];
    _posts[idx] = PostModel(
      id: p.id, authorId: p.authorId, authorName: p.authorName,
      authorAvatar: p.authorAvatar, type: p.type, title: p.title,
      description: p.description, status: p.status, latitude: p.latitude,
      longitude: p.longitude, neighborhood: p.neighborhood, city: p.city,
      images: p.images, tags: p.tags,
      reactionsCount: count,
      commentsCount: p.commentsCount, viewsCount: p.viewsCount,
      createdAt: p.createdAt,
    );
    notifyListeners();
  }
}
