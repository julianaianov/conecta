import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_images.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../domain/models/post_model.dart';

class PostCard extends StatelessWidget {
  final PostModel post;
  final VoidCallback? onSupport;

  const PostCard({super.key, required this.post, this.onSupport});

  @override
  Widget build(BuildContext context) {
    final typeColor = Color(post.type.colorValue);

    return Container(
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Header: avatar + nome + hora + tag de tipo ──
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  onTap: () => context.push('/user/${post.authorId}'),
                  child: AppAvatar(
                    imageUrl: AppImages.avatarFor(post.authorId, name: post.authorName),
                    name: post.authorName,
                    radius: 22,
                    accentColor: typeColor,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GestureDetector(
                        onTap: () => context.push('/user/${post.authorId}'),
                        child: Text(
                          post.authorName,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.navy,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        [
                          _timeAgo(post.createdAt),
                          if (post.locationLabel.isNotEmpty) post.locationLabel,
                        ].join(' · '),
                        style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: typeColor.withAlpha(20),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: typeColor.withAlpha(80)),
                  ),
                  child: Text(
                    post.type.label,
                    style: TextStyle(fontSize: 10, color: typeColor, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),

          // ── Texto: título + descrição + tags ──
          GestureDetector(
            onTap: () => context.push('/post/${post.id}'),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    post.title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                      height: 1.3,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 5),
                  Text(
                    post.description,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade700,
                      height: 1.4,
                    ),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (post.tags.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      children: post.tags
                          .take(3)
                          .map((t) => Text(
                                '#$t',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: typeColor,
                                  fontWeight: FontWeight.w500,
                                ),
                              ))
                          .toList(),
                    ),
                  ],
                ],
              ),
            ),
          ),

          // ── Imagem full-width ──
          GestureDetector(
            onTap: () => context.push('/post/${post.id}'),
            child: AppNetworkImage(
              url: post.coverImageUrl,
              height: 200,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),

          // ── Contadores ──
          if (post.reactionsCount > 0 || post.commentsCount > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Row(
                children: [
                  if (post.reactionsCount > 0) ...[
                    Icon(Icons.volunteer_activism_rounded, size: 15, color: AppColors.orange),
                    const SizedBox(width: 4),
                    Text(
                      '${post.reactionsCount}',
                      style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                  ],
                  const Spacer(),
                  if (post.commentsCount > 0)
                    Text(
                      '${post.commentsCount} comentários',
                      style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                ],
              ),
            ),

          const Divider(height: 16, indent: 12, endIndent: 12),

          // ── Botões de ação estilo Facebook ──
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
            child: Row(
              children: [
                _FbAction(
                  icon: Icons.volunteer_activism_rounded,
                  label: 'Apoiar',
                  color: AppColors.orange,
                  onTap: onSupport,
                ),
                _FbAction(
                  icon: Icons.chat_bubble_outline_rounded,
                  label: 'Comentar',
                  color: AppColors.steelBlue,
                  onTap: () => context.push('/post/${post.id}'),
                ),
                _FbAction(
                  icon: Icons.open_in_new_rounded,
                  label: 'Ver',
                  color: AppColors.navy,
                  onTap: () => context.push('/post/${post.id}'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt.toLocal());
    if (diff.inMinutes < 1) return 'agora';
    if (diff.inMinutes < 60) return '${diff.inMinutes}min';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return DateFormat('dd/MM', 'pt_BR').format(dt.toLocal());
  }
}

class _FbAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  const _FbAction({
    required this.icon,
    required this.label,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: TextButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 18, color: color),
        label: Text(
          label,
          style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600),
        ),
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 8),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
    );
  }
}
