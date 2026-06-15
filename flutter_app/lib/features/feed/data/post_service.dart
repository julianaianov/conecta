import '../../../core/config/app_config.dart';
import '../../../core/demo/demo_data.dart';
import '../../../core/network/api_client.dart';
import '../../post/domain/models/support_type.dart';
import '../../post/domain/models/support_record.dart';
import '../domain/models/post_model.dart';

class PostService {
  final _dio = ApiClient().dio;

  Future<({List<PostModel> posts, int total})> fetchPosts({
    String? type,
    String? status,
    String? neighborhood,
    int limit  = 20,
    int offset = 0,
  }) async {
    try {
      final res = await _dio.get('${AppConfig.postsPath}/', queryParameters: {
        'type':         type,
        'status':       status,
        'neighborhood': neighborhood,
        'limit':        limit,
        'offset':       offset,
      }..removeWhere((_, v) => v == null));
      final data = res.data as Map<String, dynamic>;
      return (
        posts: (data['posts'] as List).map((e) => PostModel.fromJson(e as Map<String, dynamic>)).toList(),
        total: data['total'] as int,
      );
    } catch (_) {
      if (AppConfig.useDemoFallback) {
        return DemoData.fetchPosts(type: type, limit: limit, offset: offset);
      }
      rethrow;
    }
  }

  Future<List<PostModel>> fetchMapPosts({String? type, String? status}) async {
    try {
      final res = await _dio.get('${AppConfig.postsPath}/map', queryParameters: {
        'type':   type,
        'status': status,
      }..removeWhere((_, v) => v == null));
      return (res.data as List).map((e) => PostModel.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      if (AppConfig.useDemoFallback) {
        return DemoData.fetchMapPosts(type: type);
      }
      rethrow;
    }
  }

  Future<PostModel> fetchPost(String id) async {
    try {
      final res = await _dio.get('${AppConfig.postsPath}/$id');
      return PostModel.fromJson(res.data as Map<String, dynamic>);
    } catch (_) {
      if (AppConfig.useDemoFallback) {
        final post = DemoData.getPost(id);
        if (post != null) return post;
      }
      rethrow;
    }
  }

  Future<PostModel> createPost({
    required String type,
    required String title,
    required String description,
    String? neighborhood,
    String? city,
    double? latitude,
    double? longitude,
    List<String> tags = const [],
  }) async {
    final res = await _dio.post('${AppConfig.postsPath}/', data: {
      'type': type, 'title': title, 'description': description,
      'neighborhood': neighborhood ?? DemoData.neighborhood,
      'city':         city ?? DemoData.city,
      'latitude':     latitude,
      'longitude':    longitude,
      'tags': tags,
    });
    return PostModel.fromJson(res.data as Map<String, dynamic>);
  }

  Future<String> toggleReaction(String postId) async {
    final res = await _dio.post('${AppConfig.postsPath}/$postId/reactions');
    return (res.data as Map<String, dynamic>)['action'] as String;
  }

  Future<List<Map<String, dynamic>>> fetchComments(String postId) async {
    try {
      final res = await _dio.get('${AppConfig.postsPath}/$postId/comments');
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      if (AppConfig.useDemoFallback) {
        return DemoData.getComments(postId);
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> addComment(String postId, String content) async {
    try {
      final res = await _dio.post('${AppConfig.postsPath}/$postId/comments', data: {'content': content});
      return res.data as Map<String, dynamic>;
    } catch (_) {
      if (AppConfig.useDemoFallback) {
        return DemoData.addComment(postId, content);
      }
      rethrow;
    }
  }

  Future<PostModel> updateStatus(String postId, String status) async {
    final res = await _dio.put('${AppConfig.postsPath}/$postId', data: {'status': status});
    return PostModel.fromJson(res.data as Map<String, dynamic>);
  }

  Future<({List<SupportSummary> summary, List<Map<String, dynamic>> supports})> fetchSupports(
    String postId,
  ) async {
    try {
      final res = await _dio.get('${AppConfig.postsPath}/$postId/supports');
      final data = res.data as Map<String, dynamic>;
      return (
        summary: (data['summary'] as List)
            .map((e) => SupportSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
        supports: (data['supports'] as List).cast<Map<String, dynamic>>(),
      );
    } catch (_) {
      if (AppConfig.useDemoFallback) {
        return DemoData.fetchSupports(postId);
      }
      rethrow;
    }
  }

  Future<List<Map<String, dynamic>>> fetchMySupports(String postId) async {
    try {
      final res = await _dio.get('${AppConfig.postsPath}/$postId/supports/mine');
      return (res.data as List).cast<Map<String, dynamic>>();
    } catch (_) {
      if (AppConfig.useDemoFallback) {
        return DemoData.getMySupports(postId);
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> createSupport(
    String postId, {
    required String type,
    String? message,
    double? amount,
    String? paymentMethod,
    Map<String, dynamic>? details,
    String status = 'confirmed',
  }) async {
    try {
      final res = await _dio.post('${AppConfig.postsPath}/$postId/supports', data: {
        'type': type,
        if (message != null) 'message': message,
        if (amount != null) 'amount': amount,
        if (paymentMethod != null) 'payment_method': paymentMethod,
        if (details != null) 'details': details,
        'status': status,
      });
      return res.data as Map<String, dynamic>;
    } catch (_) {
      if (AppConfig.useDemoFallback) {
        return DemoData.createSupport(
          postId, type,
          message: message,
          amount: amount,
          paymentMethod: paymentMethod,
          details: details,
        );
      }
      rethrow;
    }
  }

  Future<void> removeSupport(String postId, String type) async {
    try {
      await _dio.delete('${AppConfig.postsPath}/$postId/supports/$type');
    } catch (_) {
      if (AppConfig.useDemoFallback) {
        DemoData.removeSupport(postId, type);
        return;
      }
      rethrow;
    }
  }

  Future<List<SupportRecord>> fetchAllMySupports() async {
    try {
      final res = await _dio.get('${AppConfig.postsPath}/my/supports');
      return (res.data as List)
          .map((e) => SupportRecord.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      if (AppConfig.useDemoFallback) {
        return DemoData.fetchAllMySupports();
      }
      rethrow;
    }
  }

  @Deprecated('Use createSupport')
  Future<Map<String, dynamic>> toggleSupport(
    String postId,
    String type, {
    String? message,
  }) async =>
      createSupport(postId, type: type, message: message);
}
