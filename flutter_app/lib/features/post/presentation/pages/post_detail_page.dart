import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_decorations.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../../../shared/widgets/orkut_scaffold.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../feed/data/post_service.dart';
import '../../../feed/domain/models/post_model.dart';
import '../../../feed/presentation/providers/feed_provider.dart';
import '../../domain/models/support_type.dart';
import '../widgets/support_options_sheet.dart';

class PostDetailPage extends StatefulWidget {
  final String postId;
  const PostDetailPage({super.key, required this.postId});

  @override
  State<PostDetailPage> createState() => _PostDetailPageState();
}

class _PostDetailPageState extends State<PostDetailPage> {
  final _service     = PostService();
  final _commentCtrl = TextEditingController();
  final _scrollCtrl  = ScrollController();

  PostModel?          _post;
  List<Map<String, dynamic>> _comments = [];
  List<SupportSummary>       _supportSummary = [];
  bool   _loadingPost     = true;
  bool   _sendingComment  = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _service.fetchPost(widget.postId),
        _service.fetchComments(widget.postId),
        _service.fetchSupports(widget.postId),
      ]);
      if (!mounted) return;
      setState(() {
        _post           = results[0] as PostModel;
        _comments       = (results[1] as List).cast<Map<String, dynamic>>();
        _supportSummary = (results[2] as ({List<SupportSummary> summary, List<Map<String, dynamic>> supports})).summary;
        _loadingPost    = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _error = 'Erro ao carregar publicação.'; _loadingPost = false; });
    }
  }

  void _openSupport() {
    if (_post == null) return;
    SupportOptionsSheet.show(
      context,
      postId: _post!.id,
      postTitle: _post!.title,
      onCountChanged: (count) {
        context.read<FeedProvider>().setPostSupportCount(_post!.id, count);
        setState(() {
          _post = PostModel(
            id: _post!.id, authorId: _post!.authorId, authorName: _post!.authorName,
            authorAvatar: _post!.authorAvatar, type: _post!.type, title: _post!.title,
            description: _post!.description, status: _post!.status,
            latitude: _post!.latitude, longitude: _post!.longitude,
            neighborhood: _post!.neighborhood, city: _post!.city,
            images: _post!.images, tags: _post!.tags,
            reactionsCount: count,
            commentsCount: _post!.commentsCount, viewsCount: _post!.viewsCount,
            createdAt: _post!.createdAt,
          );
        });
        _load();
      },
    );
  }

  Future<void> _sendComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _sendingComment = true);
    try {
      final comment = await _service.addComment(_post!.id, text);
      if (!mounted) return;
      setState(() {
        _comments.add(comment);
        _commentCtrl.clear();
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      });
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Erro ao enviar comentário')),
      );
    } finally {
      if (mounted) setState(() => _sendingComment = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingPost) {
      return const OrkutScaffold(
        title: 'Publicação',
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null || _post == null) {
      return OrkutScaffold(
        title: 'Publicação',
        body: Center(child: Text(_error ?? 'Publicação não encontrada')),
      );
    }

    final post      = _post!;
    final typeColor = Color(post.type.colorValue);
    final cs        = Theme.of(context).colorScheme;
    final me        = context.read<AuthProvider>().user;

    return OrkutScaffold(
      title: post.title,
      body: Column(
        children: [
          if (me?.id == post.authorId)
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.only(right: 8, top: 4),
                child: PopupMenuButton<String>(
                  onSelected: (v) async {
                    await _service.updateStatus(post.id, v);
                    if (mounted) await _load();
                  },
                  itemBuilder: (_) => PostStatus.values.map((s) =>
                    PopupMenuItem(value: s.value, child: Text(s.label))).toList(),
                  child: const Icon(Icons.more_vert, size: 20),
                ),
              ),
            ),
          Expanded(
            child: ListView(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(16),
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(AppDecor.radiusMd),
                  child: AppNetworkImage(
                    url: post.coverImageUrl,
                    height: 220,
                    width: double.infinity,
                  ),
                ),
                const SizedBox(height: 16),
                // ── Header ───────────────────────────────────────────
                Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: typeColor, borderRadius: BorderRadius.circular(20)),
                    child: Text(post.type.label,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(width: 8),
                  _StatusBadge(status: post.status),
                ]),
                const SizedBox(height: 12),
                Text(post.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Row(children: [
                  AppAvatar(
                    imageUrl: post.authorAvatar,
                    name: post.authorName,
                    radius: 14,
                    accentColor: typeColor,
                  ),
                  const SizedBox(width: 8),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    GestureDetector(
                      onTap: () => context.push('/user/${post.authorId}'),
                      child: Text(post.authorName, style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: AppColors.linkBlue, fontWeight: FontWeight.bold)),
                    ),
                    Text(DateFormat('dd/MM/yyyy HH:mm').format(post.createdAt.toLocal()),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(color: cs.outline)),
                  ]),
                ]),
                if (post.locationLabel.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Row(children: [
                    Icon(Icons.place_outlined, size: 16, color: cs.outline),
                    const SizedBox(width: 4),
                    Text(post.locationLabel, style: TextStyle(color: cs.outline)),
                  ]),
                ],
                const Divider(height: 24),
                Text(post.description, style: Theme.of(context).textTheme.bodyMedium),
                if (post.tags.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 6, runSpacing: 6,
                    children: post.tags.map((t) => Chip(
                      label: Text(t, style: const TextStyle(fontSize: 12)),
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                    )).toList(),
                  ),
                ],
                // ── Stats ─────────────────────────────────────────────
                const Divider(height: 24),
                Row(children: [
                  _StatItem(icon: Icons.volunteer_activism_outlined, value: post.reactionsCount, label: 'apoios'),
                  const SizedBox(width: 24),
                  _StatItem(icon: Icons.chat_bubble_outline, value: post.commentsCount, label: 'comentários'),
                  const SizedBox(width: 24),
                  _StatItem(icon: Icons.visibility_outlined, value: post.viewsCount, label: 'visualizações'),
                ]),
                if (_supportSummary.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text('Apoios por tipo', style: Theme.of(context).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6, runSpacing: 6,
                    children: _supportSummary.map((s) => Chip(
                      avatar: Icon(s.type.icon, size: 16),
                      label: Text('${s.type.label} (${s.count})', style: const TextStyle(fontSize: 11)),
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                    )).toList(),
                  ),
                ],
                // ── Comments ──────────────────────────────────────────
                const Divider(height: 24),
                Text('Comentários', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 12),
                if (_comments.isEmpty)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Text('Nenhum comentário ainda. Seja o primeiro!', style: TextStyle(color: Colors.grey)),
                    ),
                  ),
                ..._comments.map((c) => _CommentTile(comment: c)),
              ],
            ),
          ),
          // ── React button ─────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
            decoration: BoxDecoration(
              color: Theme.of(context).scaffoldBackgroundColor,
              boxShadow: [BoxShadow(color: Colors.black.withAlpha(20), blurRadius: 4, offset: const Offset(0, -2))],
            ),
            child: Row(children: [
              Expanded(
                child: FilledButton.tonal(
                  onPressed: _openSupport,
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    const Icon(Icons.volunteer_activism_outlined, size: 18),
                    const SizedBox(width: 6),
                    Text('Apoiar (${post.reactionsCount})'),
                  ]),
                ),
              ),
            ]),
          ),
          // ── Comment input ─────────────────────────────────────────────
          SafeArea(
            child: Padding(
              padding: EdgeInsets.fromLTRB(12, 8, 12, MediaQuery.of(context).viewInsets.bottom + 8),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _commentCtrl,
                    decoration: InputDecoration(
                      hintText: 'Adicionar comentário...',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                      isDense: true,
                    ),
                    onSubmitted: (_) => _sendComment(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _sendingComment ? null : _sendComment,
                  icon: _sendingComment
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send_rounded),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final IconData icon;
  final int value;
  final String label;

  const _StatItem({required this.icon, required this.value, required this.label});

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Icon(icon, size: 16, color: Theme.of(context).colorScheme.primary),
    const SizedBox(width: 4),
    Text('$value $label', style: Theme.of(context).textTheme.labelMedium),
  ]);
}

class _CommentTile extends StatelessWidget {
  final Map<String, dynamic> comment;
  const _CommentTile({required this.comment});

  @override
  Widget build(BuildContext context) {
    final name = comment['author_name'] as String? ?? 'Usuário';
    final date = DateTime.tryParse(comment['created_at'] as String? ?? '');
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        CircleAvatar(
          radius: 16,
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          child: Text(name[0].toUpperCase(),
            style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.primary)),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text(name, style: Theme.of(context).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600)),
              const Spacer(),
              if (date != null)
                Text(DateFormat('dd/MM HH:mm').format(date.toLocal()),
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Colors.grey)),
            ]),
            const SizedBox(height: 2),
            Text(comment['content'] as String? ?? ''),
          ]),
        ),
      ]),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final PostStatus status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      PostStatus.active     => AppColors.steelBlue,
      PostStatus.inProgress => AppColors.orange,
      PostStatus.resolved   => AppColors.blueLight,
      PostStatus.cancelled  => AppColors.neutralDark,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withAlpha(100)),
      ),
      child: Text(status.label, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }
}
