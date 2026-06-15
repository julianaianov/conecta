import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/demo/demo_social.dart';
import '../../domain/models/social_models.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_decorations.dart';
import '../../../../core/theme/app_images.dart';
import '../../../../shared/widgets/app_network_image.dart';

class CommunitiesPage extends StatelessWidget {
  const CommunitiesPage({super.key});

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 700;
    final items = DemoSocial.communities;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.paddingOf(context).bottom + 100),
      child: wide
          ? Wrap(
              spacing: 16,
              runSpacing: 16,
              children: items.map((c) => SizedBox(width: 320, child: _CommunityCard(community: c))).toList(),
            )
          : Column(
              children: items
                  .map((c) => Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: _CommunityCard(community: c),
                      ))
                  .toList(),
            ),
    );
  }
}

class _CommunityCard extends StatelessWidget {
  final CommunityModel community;
  const _CommunityCard({required this.community});

  @override
  Widget build(BuildContext context) {
    final imageUrl = community.imageUrl ?? AppImages.communityImage(community.id);

    return Container(
      decoration: AppDecor.card(radius: AppDecor.radiusLg),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              AppNetworkImage(url: imageUrl, height: 140, width: double.infinity),
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  height: 60,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Colors.black.withAlpha(140)],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 12,
                bottom: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.orange,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    community.category,
                    style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  community.name,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.navy),
                ),
                const SizedBox(height: 6),
                Text(community.description,
                    style: const TextStyle(fontSize: 12, height: 1.4),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 10),
                Row(
                  children: [
                    const Icon(Icons.people_outline, size: 14, color: AppColors.textMuted),
                    const SizedBox(width: 4),
                    Text(
                      '${community.memberCount} membros',
                      style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                FilledButton.tonal(
                  onPressed: () {},
                  style: FilledButton.styleFrom(minimumSize: const Size(double.infinity, 40)),
                  child: const Text('Participar'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
