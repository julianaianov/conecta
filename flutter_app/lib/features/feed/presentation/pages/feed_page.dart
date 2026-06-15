import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/demo/demo_social.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_decorations.dart';
import '../../../../core/theme/app_images.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../providers/feed_provider.dart';
import '../widgets/post_card.dart';
import '../../../post/presentation/widgets/support_options_sheet.dart';
import '../../../../shared/widgets/orkut_box.dart';

const _kFeedBg = Color(0xFFEFF2F5);

class FeedPage extends StatefulWidget {
  const FeedPage({super.key});

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  final _scroll = ScrollController();

  static const _filters = [
    (null,      'Todos',        Icons.grid_view_rounded),
    ('problem', 'Problemas',    Icons.warning_amber_rounded),
    ('project', 'Projetos',     Icons.construction_rounded),
    ('need',    'Necessidades', Icons.volunteer_activism_rounded),
    ('event',   'Eventos',      Icons.event_rounded),
    ('action',  'Ações',        Icons.eco_rounded),
    ('message', 'Mensagens',    Icons.chat_bubble_outline_rounded),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<FeedProvider>().loadPosts(refresh: true);
    });
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 200) {
      context.read<FeedProvider>().loadPosts();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final wide = MediaQuery.sizeOf(context).width >= 960;

    return Container(
      color: _kFeedBg,
      child: SingleChildScrollView(
        controller: _scroll,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1200),
            child: wide
                ? _WideLayout(auth: auth, user: user, filters: _filters)
                : _NarrowLayout(auth: auth, user: user, filters: _filters),
          ),
        ),
      ),
    );
  }
}

// ─── Narrow (mobile) ──────────────────────────────────────────────────────────

class _NarrowLayout extends StatelessWidget {
  final AuthProvider auth;
  final dynamic user;
  final List<(String?, String, IconData)> filters;

  const _NarrowLayout({required this.auth, required this.user, required this.filters});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (user != null) _QuickPostBar(userId: user!.id),
        const SizedBox(height: 8),
        _FeedColumn(auth: auth, filters: filters),
        const SizedBox(height: 100),
      ],
    );
  }
}

// ─── Wide (desktop) ───────────────────────────────────────────────────────────

class _WideLayout extends StatelessWidget {
  final AuthProvider auth;
  final dynamic user;
  final List<(String?, String, IconData)> filters;

  const _WideLayout({required this.auth, required this.user, required this.filters});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (user != null) SizedBox(width: 260, child: _Sidebar(userId: user!.id)),
          if (user != null) const SizedBox(width: 16),
          Expanded(
            child: Column(
              children: [
                if (user != null) _QuickPostBar(userId: user!.id),
                const SizedBox(height: 8),
                _FeedColumn(auth: auth, filters: filters),
              ],
            ),
          ),
          const SizedBox(width: 16),
          SizedBox(width: 260, child: _CommunitiesPanel()),
        ],
      ),
    );
  }
}

// ─── Quick post bar ───────────────────────────────────────────────────────────

class _QuickPostBar extends StatelessWidget {
  final String userId;
  const _QuickPostBar({required this.userId});

  @override
  Widget build(BuildContext context) {
    final profile = DemoSocial.getProfile(userId);
    if (profile == null) return const SizedBox.shrink();

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      child: Column(
        children: [
          Row(
            children: [
              AppAvatar(
                imageUrl: profile.avatarUrl,
                name: profile.name,
                radius: 20,
                accentColor: AppColors.orange,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: GestureDetector(
                  onTap: () => context.push('/create'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Text(
                      'O que está acontecendo no bairro?',
                      style: TextStyle(color: Colors.grey.shade500, fontSize: 14),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const Divider(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _QuickAction(icon: Icons.warning_amber_rounded,       label: 'Problema', color: AppColors.orange,    onTap: () => context.push('/create')),
              _QuickAction(icon: Icons.construction_rounded,        label: 'Projeto',  color: AppColors.steelBlue, onTap: () => context.push('/create')),
              _QuickAction(icon: Icons.event,                       label: 'Evento',   color: AppColors.navy,      onTap: () => context.push('/create')),
              _QuickAction(icon: Icons.chat_bubble_outline_rounded, label: 'Mensagem', color: const Color(0xFF1565C0), onTap: () => context.push('/create')),
            ],
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;
  const _QuickAction({required this.icon, required this.label, required this.color, this.onTap});

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18, color: color),
      label: Text(label, style: TextStyle(fontSize: 12, color: color)),
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
    );
  }
}

// ─── Feed column (search + filters + posts) ───────────────────────────────────

class _FeedColumn extends StatefulWidget {
  final AuthProvider auth;
  final List<(String?, String, IconData)> filters;
  const _FeedColumn({required this.auth, required this.filters});

  @override
  State<_FeedColumn> createState() => _FeedColumnState();
}

class _FeedColumnState extends State<_FeedColumn> {
  final _searchCtrl = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Demo banner
        if (widget.auth.isDemoMode)
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Row(children: [
              const Icon(Icons.wifi_off_rounded, size: 16, color: AppColors.orange),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('Modo demo — dados do Recreio dos Bandeirantes', style: TextStyle(fontSize: 12)),
              ),
            ]),
          ),

        // Search + filters
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _searchCtrl,
                onChanged: (v) => setState(() => _searchQuery = v.trim().toLowerCase()),
                decoration: InputDecoration(
                  hintText: 'Pesquisar publicações...',
                  prefixIcon: const Icon(Icons.search_rounded, size: 20),
                  suffixIcon: _searchQuery.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear_rounded, size: 18),
                          onPressed: () {
                            _searchCtrl.clear();
                            setState(() => _searchQuery = '');
                          },
                        )
                      : null,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 38,
                child: Consumer<FeedProvider>(
                  builder: (ctx, feed, _) => ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: widget.filters.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 6),
                    itemBuilder: (_, i) {
                      final (key, label, icon) = widget.filters[i];
                      final selected = feed.typeFilter == key;
                      return FilterChip(
                        avatar: Icon(icon, size: 15,
                            color: selected ? AppColors.orange : AppColors.steelBlue),
                        label: Text(label),
                        selected: selected,
                        onSelected: (_) => feed.setFilter(key),
                        showCheckmark: false,
                        labelStyle: TextStyle(
                          fontSize: 11,
                          fontWeight: selected ? FontWeight.w700 : FontWeight.normal,
                          color: selected ? AppColors.navy : AppColors.textMuted,
                        ),
                        visualDensity: VisualDensity.compact,
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),

        // Posts
        Consumer<FeedProvider>(
          builder: (ctx, feed, _) {
            if (feed.error != null && feed.posts.isEmpty) {
              return _ErrorView(message: feed.error!, onRetry: () => feed.loadPosts(refresh: true));
            }
            if (feed.loading && feed.posts.isEmpty) {
              return Container(
                color: Colors.white,
                padding: const EdgeInsets.all(40),
                child: const Center(child: CircularProgressIndicator()),
              );
            }
            final posts = _searchQuery.isEmpty
                ? feed.posts
                : feed.posts
                    .where((p) =>
                        p.title.toLowerCase().contains(_searchQuery) ||
                        p.description.toLowerCase().contains(_searchQuery))
                    .toList();

            if (posts.isEmpty) {
              return Container(
                color: Colors.white,
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.all(32),
                child: Center(
                  child: Text(
                    _searchQuery.isNotEmpty
                        ? 'Nenhum resultado para "$_searchQuery".'
                        : 'Nenhuma publicação ainda.',
                    style: const TextStyle(color: AppColors.textMuted),
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }

            return Column(
              children: [
                ...posts.expand((post) => [
                  const SizedBox(height: 8),
                  PostCard(
                    post: post,
                    onSupport: () => SupportOptionsSheet.show(
                      context,
                      postId: post.id,
                      postTitle: post.title,
                      onCountChanged: (count) => feed.setPostSupportCount(post.id, count),
                    ),
                  ),
                ]),
                if (feed.hasMore && _searchQuery.isEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    color: Colors.white,
                    padding: const EdgeInsets.all(20),
                    child: const Center(child: CircularProgressIndicator()),
                  ),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

// ─── Sidebar (desktop only) ───────────────────────────────────────────────────

class _Sidebar extends StatelessWidget {
  final String userId;
  const _Sidebar({required this.userId});

  @override
  Widget build(BuildContext context) {
    final profile = DemoSocial.getProfile(userId);
    if (profile == null) return const SizedBox.shrink();

    return Container(
      decoration: AppDecor.card(radius: AppDecor.radiusLg),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          AppNetworkImage(
            url: AppImages.coverForUser(userId, override: profile.coverUrl),
            height: 90,
            width: double.infinity,
          ),
          Transform.translate(
            offset: const Offset(0, -36),
            child: Column(
              children: [
                AppAvatar(
                  imageUrl: profile.avatarUrl,
                  name: profile.name,
                  radius: 36,
                  borderColor: Colors.white,
                  accentColor: AppColors.orange,
                ),
                const SizedBox(height: 8),
                Text(
                  profile.name,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.navy),
                  textAlign: TextAlign.center,
                ),
                Text(
                  '${DemoSocial.friendCount(userId)} conexões',
                  style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: OutlinedButton(
                    onPressed: () => context.go('/profile'),
                    style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 40)),
                    child: const Text('Ver perfil'),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Communities panel (desktop only) ────────────────────────────────────────

class _CommunitiesPanel extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final communities = DemoSocial.communities.take(4).toList();
    return OrkutBox(
      title: 'Comunidades',
      icon: Icons.groups_rounded,
      child: Column(
        children: communities.map((c) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: InkWell(
            onTap: () => context.go('/communities'),
            borderRadius: BorderRadius.circular(12),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: AppNetworkImage(
                    url: c.imageUrl ?? AppImages.communityImage(c.id),
                    width: 52,
                    height: 52,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.name,
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.navy),
                          overflow: TextOverflow.ellipsis),
                      Text('${c.memberCount} membros',
                          style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        )).toList(),
      ),
    );
  }
}

// ─── Error view ───────────────────────────────────────────────────────────────

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Container(
    color: Colors.white,
    margin: const EdgeInsets.only(top: 8),
    padding: const EdgeInsets.all(24),
    child: Column(children: [
      const Icon(Icons.cloud_off_rounded, size: 48, color: AppColors.textMuted),
      const SizedBox(height: 12),
      Text(message, textAlign: TextAlign.center),
      const SizedBox(height: 12),
      FilledButton.tonal(onPressed: onRetry, child: const Text('Tentar novamente')),
    ]),
  );
}
