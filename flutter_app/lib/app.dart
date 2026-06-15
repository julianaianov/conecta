import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/theme/app_theme.dart';
import 'features/auth/presentation/providers/auth_provider.dart';
import 'features/auth/presentation/pages/splash_page.dart';
import 'features/auth/presentation/pages/login_page.dart';
import 'features/auth/presentation/pages/register_page.dart';
import 'features/feed/presentation/pages/feed_page.dart';
import 'features/feed/presentation/providers/feed_provider.dart';
import 'features/map/presentation/pages/map_page.dart';
import 'features/map/presentation/providers/map_provider.dart';
import 'features/post/presentation/pages/create_post_page.dart';
import 'features/post/presentation/pages/post_detail_page.dart';
import 'features/post/presentation/pages/support_flow_page.dart';
import 'features/post/presentation/pages/my_supports_page.dart';
import 'features/post/domain/models/support_type.dart';
import 'features/profile/presentation/pages/profile_page.dart';
import 'features/profile/presentation/pages/user_profile_page.dart';
import 'features/profile/presentation/pages/communities_page.dart';
import 'shared/widgets/main_shell.dart';

class ConectaApp extends StatefulWidget {
  const ConectaApp({super.key});

  @override
  State<ConectaApp> createState() => _ConectaAppState();
}

class _ConectaAppState extends State<ConectaApp> {
  late final AuthProvider _auth;
  late final GoRouter _router;

  static const _publicRoutes = {'/splash', '/login', '/register'};

  @override
  void initState() {
    super.initState();
    _auth = AuthProvider()..checkAuth();
    _router = GoRouter(
      initialLocation: '/splash',
      refreshListenable: _auth,
      redirect: _redirect,
      routes: [
        GoRoute(path: '/splash',   builder: (ctx, state) => const SplashPage()),
        GoRoute(path: '/login',    builder: (ctx, state) => const LoginPage()),
        GoRoute(path: '/register', builder: (ctx, state) => const RegisterPage()),
        GoRoute(path: '/create',   builder: (ctx, state) => const CreatePostPage()),
        GoRoute(
          path: '/post/:id',
          builder: (ctx, state) => PostDetailPage(postId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/post/:id/support',
          builder: (ctx, state) {
            final extra = state.extra as Map<String, dynamic>?;
            return SupportFlowPage(
              postId: state.pathParameters['id']!,
              postTitle: extra?['title'] as String? ?? 'Publicação',
              type: SupportType.fromString(extra?['type'] as String? ?? 'volunteering'),
            );
          },
        ),
        GoRoute(path: '/my-supports', builder: (ctx, state) => const MySupportsPage()),
        GoRoute(
          path: '/user/:id',
          builder: (ctx, state) => UserProfilePage(userId: state.pathParameters['id']!),
        ),
        StatefulShellRoute.indexedStack(
          builder: (ctx, state, shell) => MainShell(navigationShell: shell),
          branches: [
            StatefulShellBranch(routes: [GoRoute(path: '/feed',        builder: (ctx, state) => const FeedPage())]),
            StatefulShellBranch(routes: [GoRoute(path: '/map',         builder: (ctx, state) => const MapPage())]),
            StatefulShellBranch(routes: [GoRoute(path: '/communities', builder: (ctx, state) => const CommunitiesPage())]),
            StatefulShellBranch(routes: [GoRoute(path: '/profile',     builder: (ctx, state) => const ProfilePage())]),
          ],
        ),
      ],
    );
  }

  String? _redirect(BuildContext context, GoRouterState state) {
    final loc = state.matchedLocation;

    if (_auth.status == AuthStatus.unknown) {
      return loc == '/splash' ? null : '/splash';
    }
    if (!_auth.isLoggedIn) {
      return _publicRoutes.contains(loc) ? null : '/login';
    }
    if (_publicRoutes.contains(loc)) return '/feed';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: _auth),
        ChangeNotifierProvider(create: (_) => FeedProvider()),
        ChangeNotifierProvider(create: (_) => MapProvider()),
      ],
      child: MaterialApp.router(
        title: 'dmconecta',
        theme: AppTheme.light,
        locale: const Locale('pt', 'BR'),
        routerConfig: _router,
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}
