import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../../core/demo/demo_data.dart';
import '../../../../core/demo/demo_social.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_decorations.dart';
import '../../../../core/theme/app_images.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../feed/domain/models/post_model.dart';
import '../../domain/models/social_models.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../../../shared/widgets/orkut_box.dart';

class OrkutProfileView extends StatefulWidget {
  final String userId;
  final bool isOwnProfile;

  const OrkutProfileView({
    super.key,
    required this.userId,
    required this.isOwnProfile,
  });

  @override
  State<OrkutProfileView> createState() => _OrkutProfileViewState();
}

class _OrkutProfileViewState extends State<OrkutProfileView> {
  final _scrapCtrl = TextEditingController();

  @override
  void dispose() {
    _scrapCtrl.dispose();
    super.dispose();
  }

  void _postScrap(ProfileModel profile) {
    final auth = context.read<AuthProvider>().user;
    if (auth == null || _scrapCtrl.text.trim().isEmpty) return;
    DemoSocial.addScrap(
      authorId: auth.id,
      authorName: auth.name,
      targetUserId: profile.userId,
      content: _scrapCtrl.text.trim(),
    );
    _scrapCtrl.clear();
    setState(() {});
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Recado publicado!')),
    );
  }

  void _sendConnect() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Solicitação de conexão enviada!')),
    );
  }

  void _showTestimonialDialog(ProfileModel profile) {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Depoimento para ${profile.name.split(' ').first}'),
        content: TextField(
          controller: ctrl,
          maxLines: 4,
          decoration: const InputDecoration(
            hintText: 'Escreva seu depoimento...',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              if (ctrl.text.trim().isNotEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Depoimento enviado!')),
                );
              }
            },
            child: const Text('Publicar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profile = DemoSocial.getProfile(widget.userId);
    if (profile == null) {
      return const Center(child: Text('Perfil não encontrado.'));
    }

    final friends      = DemoSocial.getFriends(widget.userId);
    final scraps       = DemoSocial.getScraps(widget.userId);
    final testimonials = DemoSocial.getTestimonials(widget.userId);
    final posts        = DemoData.fetchPosts(limit: 100).posts
        .where((p) => p.authorId == widget.userId)
        .toList();

    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 900;
        return SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(16, 0, 16, wide ? 24 : 100),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _ProfileCover(profile: profile),
                  const SizedBox(height: 12),
                  _StatsBar(
                    postCount: posts.length,
                    friendCount: friends.length,
                    testimonialCount: testimonials.length,
                  ),
                  const SizedBox(height: 16),
                  wide
                      ? Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 260,
                              child: Column(
                                children: [
                                  _InfoPanel(
                                    profile: profile,
                                    isOwn: widget.isOwnProfile,
                                    onConnect: _sendConnect,
                                    onTestimonial: () => _showTestimonialDialog(profile),
                                  ),
                                  const SizedBox(height: 12),
                                  _CommunitiesPanel(),
                                ],
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                children: [
                                  _PublicacoesPanel(posts: posts, isOwn: widget.isOwnProfile),
                                  const SizedBox(height: 12),
                                  _ScrapPanel(
                                    profile: profile,
                                    scraps: scraps,
                                    controller: _scrapCtrl,
                                    onPost: () => _postScrap(profile),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 16),
                            SizedBox(
                              width: 260,
                              child: _SocialPanel(friends: friends, testimonials: testimonials),
                            ),
                          ],
                        )
                      : Column(
                          children: [
                            _InfoPanel(
                              profile: profile,
                              isOwn: widget.isOwnProfile,
                              onConnect: _sendConnect,
                              onTestimonial: () => _showTestimonialDialog(profile),
                            ),
                            const SizedBox(height: 12),
                            _PublicacoesPanel(posts: posts, isOwn: widget.isOwnProfile),
                            const SizedBox(height: 12),
                            _ScrapPanel(
                              profile: profile,
                              scraps: scraps,
                              controller: _scrapCtrl,
                              onPost: () => _postScrap(profile),
                            ),
                            const SizedBox(height: 12),
                            _CommunitiesPanel(),
                            const SizedBox(height: 12),
                            _SocialPanel(friends: friends, testimonials: testimonials),
                          ],
                        ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

// ── Cover ─────────────────────────────────────────────────────────────────────

class _ProfileCover extends StatelessWidget {
  final ProfileModel profile;
  const _ProfileCover({required this.profile});

  @override
  Widget build(BuildContext context) {
    final coverUrl = AppImages.coverForUser(profile.userId, override: profile.coverUrl);
    final roleColor = AppColors.roleColor(profile.role);

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppDecor.radiusLg),
      child: Stack(
        children: [
          AppNetworkImage(url: coverUrl, height: 200, width: double.infinity),
          Container(
            height: 200,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.black.withAlpha(20), Colors.black.withAlpha(200)],
              ),
            ),
          ),
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          AppAvatar(
                            imageUrl: profile.avatarUrl,
                            name: profile.name,
                            radius: 44,
                            borderColor: Colors.white,
                            accentColor: roleColor,
                          ),
                          Positioned(
                            bottom: -4,
                            right: -4,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                              decoration: BoxDecoration(
                                color: roleColor,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: Colors.white, width: 2),
                              ),
                              child: Text(
                                _roleEmoji(profile.role),
                                style: const TextStyle(fontSize: 12),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              profile.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.3,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: roleColor.withAlpha(200),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    profile.roleLabel,
                                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                                  ),
                                ),
                                if (profile.locationLabel.isNotEmpty) ...[
                                  const SizedBox(width: 8),
                                  Icon(Icons.place_rounded, size: 13, color: Colors.white70),
                                  const SizedBox(width: 2),
                                  Text(
                                    profile.locationLabel,
                                    style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 12),
                                  ),
                                ],
                              ],
                            ),
                            if (profile.status != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                profile.status!,
                                style: TextStyle(color: Colors.white.withAlpha(160), fontSize: 12),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _roleEmoji(String role) => switch (role) {
    'citizen'      => '👤',
    'organization' => '🌱',
    'association'  => '🤝',
    'government'   => '🏛️',
    'business'     => '🏢',
    _              => '👤',
  };
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

class _StatsBar extends StatelessWidget {
  final int postCount;
  final int friendCount;
  final int testimonialCount;

  const _StatsBar({
    required this.postCount,
    required this.friendCount,
    required this.testimonialCount,
  });

  int get _impactScore => postCount * 5 + friendCount * 3 + testimonialCount * 10;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: AppDecor.card(),
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        children: [
          _StatCell(value: '$postCount',       label: 'Publicações', icon: Icons.campaign_rounded,     color: AppColors.orange),
          _VertDivider(),
          _StatCell(value: '$friendCount',     label: 'Conexões',    icon: Icons.people_rounded,       color: AppColors.steelBlue),
          _VertDivider(),
          _StatCell(value: '$testimonialCount',label: 'Depoimentos', icon: Icons.format_quote_rounded, color: AppColors.navyLight),
          _VertDivider(),
          _StatCell(value: '$_impactScore',    label: 'Pontos',      icon: Icons.bolt_rounded,         color: AppColors.orange),
        ],
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  final String value;
  final String label;
  final IconData icon;
  final Color color;

  const _StatCell({required this.value, required this.label, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Icon(icon, size: 22, color: color),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color, letterSpacing: -0.5)),
          const SizedBox(height: 1),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textMuted, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

class _VertDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 40, color: AppColors.neutralDark.withAlpha(100));
}

// ── Info Panel ────────────────────────────────────────────────────────────────

class _InfoPanel extends StatelessWidget {
  final ProfileModel profile;
  final bool isOwn;
  final VoidCallback onConnect;
  final VoidCallback onTestimonial;

  const _InfoPanel({
    required this.profile,
    required this.isOwn,
    required this.onConnect,
    required this.onTestimonial,
  });

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('MMMM yyyy', 'pt_BR');
    return OrkutBox(
      title: 'Sobre',
      icon: Icons.info_outline_rounded,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (profile.bio != null) ...[
            Text(profile.bio!, style: const TextStyle(fontSize: 14, height: 1.5, color: AppColors.navyLight)),
            const SizedBox(height: 14),
          ],
          _InfoChip(icon: Icons.badge_rounded,          label: profile.roleLabel),
          _InfoChip(icon: Icons.email_outlined,         label: profile.email),
          if (profile.website != null)
            _InfoChip(icon: Icons.language_rounded,     label: profile.website!),
          _InfoChip(icon: Icons.calendar_today_rounded, label: 'Membro desde ${dateFmt.format(profile.memberSince)}'),
          const SizedBox(height: 14),
          if (isOwn) ...[
            FilledButton.icon(
              onPressed: () => context.push('/create'),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Nova Publicação'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.orange,
                minimumSize: const Size(double.infinity, 44),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.tonal(
              onPressed: () => context.push('/my-supports'),
              style: FilledButton.styleFrom(minimumSize: const Size(double.infinity, 40)),
              child: const Text('Meus Apoios'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => context.go('/map'),
              style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 40)),
              child: const Text('Mapa de impacto'),
            ),
          ] else ...[
            FilledButton.icon(
              onPressed: onConnect,
              icon: const Icon(Icons.person_add_rounded, size: 18),
              label: const Text('Conectar'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.steelBlue,
                minimumSize: const Size(double.infinity, 44),
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: onTestimonial,
              icon: const Icon(Icons.format_quote_rounded, size: 18),
              label: const Text('Dar depoimento'),
              style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 40)),
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _InfoChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 17, color: AppColors.steelBlue),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.navy))),
        ],
      ),
    );
  }
}

// ── Publicações ───────────────────────────────────────────────────────────────

class _PublicacoesPanel extends StatelessWidget {
  final List<PostModel> posts;
  final bool isOwn;

  const _PublicacoesPanel({required this.posts, required this.isOwn});

  @override
  Widget build(BuildContext context) {
    return OrkutBox(
      title: 'Publicações (${posts.length})',
      icon: Icons.campaign_rounded,
      headerColor: AppColors.navy,
      trailing: isOwn
          ? TextButton(
              onPressed: () => context.push('/create'),
              child: const Text('+ nova', style: TextStyle(fontSize: 12)),
            )
          : null,
      child: posts.isEmpty
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Column(
                  children: [
                    Icon(Icons.campaign_outlined, size: 40, color: AppColors.textMuted),
                    SizedBox(height: 8),
                    Text('Nenhuma publicação ainda.', style: TextStyle(color: AppColors.textMuted)),
                  ],
                ),
              ),
            )
          : Column(children: posts.take(6).map((p) => _MiniPostCard(post: p)).toList()),
    );
  }
}

class _MiniPostCard extends StatelessWidget {
  final PostModel post;
  const _MiniPostCard({required this.post});

  @override
  Widget build(BuildContext context) {
    final color = Color(post.type.colorValue);
    final dateFmt = DateFormat('dd MMM', 'pt_BR');

    return GestureDetector(
      onTap: () => context.push('/post/${post.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppDecor.radiusSm),
          border: Border.all(color: AppColors.neutralDark.withAlpha(80)),
        ),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 52,
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: color.withAlpha(22),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: color.withAlpha(70)),
                        ),
                        child: Text(
                          post.type.label,
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color),
                        ),
                      ),
                      if (post.status != PostStatus.active) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.green.withAlpha(22),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            post.status.label,
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.green),
                          ),
                        ),
                      ],
                      const Spacer(),
                      Text(dateFmt.format(post.createdAt), style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    post.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.navy),
                  ),
                  const SizedBox(height: 5),
                  Row(
                    children: [
                      _PostStat(icon: Icons.favorite_rounded,           value: post.reactionsCount),
                      const SizedBox(width: 10),
                      _PostStat(icon: Icons.chat_bubble_outline_rounded, value: post.commentsCount),
                      const SizedBox(width: 10),
                      _PostStat(icon: Icons.remove_red_eye_outlined,     value: post.viewsCount),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }
}

class _PostStat extends StatelessWidget {
  final IconData icon;
  final int value;
  const _PostStat({required this.icon, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: AppColors.textMuted),
        const SizedBox(width: 3),
        Text('$value', style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
      ],
    );
  }
}

// ── Mural / Scraps ────────────────────────────────────────────────────────────

class _ScrapPanel extends StatelessWidget {
  final ProfileModel profile;
  final List<ScrapModel> scraps;
  final TextEditingController controller;
  final VoidCallback onPost;

  const _ScrapPanel({
    required this.profile,
    required this.scraps,
    required this.controller,
    required this.onPost,
  });

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd MMM · HH:mm', 'pt_BR');
    return OrkutBox(
      title: 'Mural de ${profile.name.split(' ').first}',
      icon: Icons.chat_bubble_rounded,
      headerColor: AppColors.orange,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.offWhite,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    maxLines: 3,
                    minLines: 1,
                    decoration: const InputDecoration(
                      hintText: 'Deixe um recado...',
                      border: InputBorder.none,
                      isDense: true,
                    ),
                    style: const TextStyle(fontSize: 14),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: onPost,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.orange,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                  child: const Icon(Icons.send_rounded, size: 18),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (scraps.isEmpty)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('Nenhum recado ainda.', style: TextStyle(color: AppColors.textMuted)),
              ),
            )
          else
            ...scraps.map((s) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: AppDecor.card(radius: AppDecor.radiusSm),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      AppAvatar(
                        imageUrl: AppImages.avatarFor(s.authorId, name: s.authorName),
                        name: s.authorName,
                        radius: 14,
                        accentColor: AppColors.steelBlue,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: GestureDetector(
                          onTap: () => context.push('/user/${s.authorId}'),
                          child: Text(
                            s.authorName,
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.steelBlue),
                          ),
                        ),
                      ),
                      Text(dateFmt.format(s.createdAt), style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                    ]),
                    const SizedBox(height: 8),
                    Text(s.content, style: const TextStyle(fontSize: 14, height: 1.4, color: AppColors.navy)),
                  ],
                ),
              ),
            )),
        ],
      ),
    );
  }
}

// ── Comunidades ───────────────────────────────────────────────────────────────

class _CommunitiesPanel extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final communities = DemoSocial.communities;
    return OrkutBox(
      title: 'Comunidades (${communities.length})',
      icon: Icons.groups_rounded,
      headerColor: AppColors.steelBlue,
      trailing: TextButton(
        onPressed: () => context.push('/communities'),
        child: const Text('ver todas', style: TextStyle(fontSize: 12)),
      ),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: communities.take(6).map((c) => _CommunityChip(name: c.name, memberCount: c.memberCount)).toList(),
      ),
    );
  }
}

class _CommunityChip extends StatelessWidget {
  final String name;
  final int memberCount;
  const _CommunityChip({required this.name, required this.memberCount});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/communities'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.steelBlue.withAlpha(15),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.steelBlue.withAlpha(60)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.groups_rounded, size: 13, color: AppColors.steelBlue),
                const SizedBox(width: 5),
                Text(name, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.steelBlue)),
              ],
            ),
            Text('$memberCount membros', style: const TextStyle(fontSize: 10, color: AppColors.textMuted)),
          ],
        ),
      ),
    );
  }
}

// ── Conexões + Depoimentos ────────────────────────────────────────────────────

class _SocialPanel extends StatelessWidget {
  final List<ProfileModel> friends;
  final List<TestimonialModel> testimonials;

  const _SocialPanel({required this.friends, required this.testimonials});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        OrkutBox(
          title: 'Conexões (${friends.length})',
          icon: Icons.people_rounded,
          child: friends.isEmpty
              ? const Text('Sem conexões ainda.', style: TextStyle(color: AppColors.textMuted))
              : Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: friends.map((f) => _FriendCard(friend: f)).toList(),
                ),
        ),
        const SizedBox(height: 12),
        OrkutBox(
          title: 'Depoimentos (${testimonials.length})',
          icon: Icons.format_quote_rounded,
          headerColor: AppColors.orange,
          child: testimonials.isEmpty
              ? const Text('Nenhum depoimento ainda.', style: TextStyle(color: AppColors.textMuted))
              : Column(
                  children: testimonials.map((t) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.orange.withAlpha(15),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.orange.withAlpha(40)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        GestureDetector(
                          onTap: () => context.push('/user/${t.authorId}'),
                          child: Text(
                            t.authorName,
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.orange),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text('"${t.content}"', style: const TextStyle(fontSize: 13, fontStyle: FontStyle.italic, height: 1.4)),
                      ],
                    ),
                  )).toList(),
                ),
        ),
      ],
    );
  }
}

class _FriendCard extends StatelessWidget {
  final ProfileModel friend;
  const _FriendCard({required this.friend});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push('/user/${friend.userId}'),
      child: SizedBox(
        width: 72,
        child: Column(
          children: [
            AppAvatar(
              imageUrl: friend.avatarUrl,
              name: friend.name,
              radius: 28,
              accentColor: AppColors.roleColor(friend.role),
            ),
            const SizedBox(height: 6),
            Text(
              friend.name.split(' ').first,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.navy),
            ),
            Text(
              _roleShort(friend.role),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }

  static String _roleShort(String role) => switch (role) {
    'citizen'      => 'Cidadão',
    'organization' => 'ONG',
    'association'  => 'Associação',
    'government'   => 'Governo',
    'business'     => 'Empresa',
    _              => '',
  };
}
