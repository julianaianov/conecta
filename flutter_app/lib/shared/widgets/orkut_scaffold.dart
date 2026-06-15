import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_decorations.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import 'atom_logo.dart';

/// Shell moderno: header gradiente + nav responsiva.
class OrkutScaffold extends StatelessWidget {
  final Widget body;
  final String? title;
  final bool showNav;
  final StatefulNavigationShell? navigationShell;

  const OrkutScaffold({
    super.key,
    required this.body,
    this.title,
    this.showNav = true,
    this.navigationShell,
  });

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 768;

    return Scaffold(
      backgroundColor: AppColors.pageBg,
      extendBody: navigationShell != null,
      floatingActionButton: showNav && navigationShell != null
          ? FloatingActionButton(
              onPressed: () => context.push('/create'),
              backgroundColor: AppColors.orange,
              foregroundColor: Colors.white,
              elevation: 6,
              tooltip: 'Publicar',
              child: const Icon(Icons.add_rounded, size: 28),
            )
          : null,
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: showNav && navigationShell != null && !wide
          ? _MobileBottomBar(shell: navigationShell!)
          : null,
      body: Container(
        decoration: const BoxDecoration(gradient: AppDecor.meshGradient),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _ModernHeader(
              showNav: showNav,
              wide: wide,
              navigationShell: navigationShell,
            ),
            if (title != null) _PageTitleBar(title: title!),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

class _PageTitleBar extends StatelessWidget {
  final String title;
  const _PageTitleBar({required this.title});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: AppDecor.glassCard(radius: AppDecor.radiusMd),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w800,
          color: AppColors.navy,
          letterSpacing: -0.5,
        ),
      ),
    );
  }
}

class _ModernHeader extends StatelessWidget {
  final bool showNav;
  final bool wide;
  final StatefulNavigationShell? navigationShell;

  const _ModernHeader({
    required this.showNav,
    required this.wide,
    this.navigationShell,
  });

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return Container(
      decoration: const BoxDecoration(gradient: AppDecor.headerGradient),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Row(
            children: [
              GestureDetector(
                onTap: () => context.go('/feed'),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: 42,
                      height: 42,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          AtomLogo(size: 42, color: Colors.white.withAlpha(220)),
                          Container(
                            width: 17,
                            height: 17,
                            decoration: BoxDecoration(
                              gradient: AppDecor.accentGradient,
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.orange.withAlpha(120),
                                  blurRadius: 6,
                                ),
                              ],
                            ),
                            alignment: Alignment.center,
                            child: const Text(
                              'dm',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 6,
                                letterSpacing: -0.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      'dmconecta',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 20,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ],
                ),
              ),
              if (showNav) ...[
                const Spacer(),
                if (wide) ...[
                  _DesktopNav(path: '/feed',        label: 'Home',        icon: Icons.home_rounded),
                  _DesktopNav(path: '/profile',     label: 'Perfil',      icon: Icons.person_rounded),
                  _DesktopNav(path: '/communities', label: 'Comunidades', icon: Icons.groups_rounded),
                  _DesktopNav(path: '/map',         label: 'Mapa',        icon: Icons.map_rounded),
                  const SizedBox(width: 12),
                  FilledButton.tonal(
                    onPressed: () => context.push('/create'),
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white.withAlpha(30),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.add, size: 18),
                        SizedBox(width: 4),
                        Text('Publicar', style: TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                ] else
                  IconButton(
                    tooltip: 'Menu',
                    icon: const Icon(Icons.menu_rounded, color: Colors.white),
                    onPressed: () => _showMobileMenu(context),
                  ),
                if (user != null)
                  GestureDetector(
                    onTap: () => context.go('/profile'),
                    child: CircleAvatar(
                      radius: 18,
                      backgroundColor: AppColors.orange,
                      child: Text(
                        user.name[0].toUpperCase(),
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

void _showMobileMenu(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.home_rounded, color: AppColors.orange),
            title: const Text('Home'),
            onTap: () { Navigator.pop(ctx); context.go('/feed'); },
          ),
          ListTile(
            leading: const Icon(Icons.map_rounded, color: AppColors.orange),
            title: const Text('Mapa'),
            onTap: () { Navigator.pop(ctx); context.go('/map'); },
          ),
          ListTile(
            leading: const Icon(Icons.groups_rounded, color: AppColors.orange),
            title: const Text('Comunidades'),
            onTap: () { Navigator.pop(ctx); context.go('/communities'); },
          ),
          ListTile(
            leading: const Icon(Icons.person_rounded, color: AppColors.orange),
            title: const Text('Perfil'),
            onTap: () { Navigator.pop(ctx); context.go('/profile'); },
          ),
          ListTile(
            leading: const Icon(Icons.add_circle_outline, color: AppColors.orange),
            title: const Text('Publicar'),
            onTap: () { Navigator.pop(ctx); context.push('/create'); },
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

class _DesktopNav extends StatelessWidget {
  final String path;
  final String label;
  final IconData icon;

  const _DesktopNav({required this.path, required this.label, required this.icon});

  @override
  Widget build(BuildContext context) {
    final active = GoRouterState.of(context).uri.path.startsWith(path);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: TextButton.icon(
        onPressed: () => context.go(path),
        icon: Icon(icon, size: 18, color: active ? AppColors.orange : Colors.white70),
        label: Text(
          label,
          style: TextStyle(
            color: active ? Colors.white : Colors.white70,
            fontWeight: active ? FontWeight.w700 : FontWeight.normal,
            fontSize: 13,
          ),
        ),
        style: TextButton.styleFrom(
          backgroundColor: active ? Colors.white.withAlpha(25) : Colors.transparent,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
    );
  }
}

class _MobileBottomBar extends StatelessWidget {
  final StatefulNavigationShell shell;
  const _MobileBottomBar({required this.shell});

  @override
  Widget build(BuildContext context) {
    return BottomAppBar(
      shape: const CircularNotchedRectangle(),
      notchMargin: 8,
      height: 60,
      color: Colors.white,
      elevation: 8,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _MobileNavItem(icon: Icons.home_rounded,    label: 'Home',       index: 0, shell: shell),
          _MobileNavItem(icon: Icons.map_rounded,     label: 'Mapa',       index: 1, shell: shell),
          const SizedBox(width: 72),
          _MobileNavItem(icon: Icons.groups_rounded,  label: 'Comunidade', index: 2, shell: shell),
          _MobileNavItem(icon: Icons.person_rounded,  label: 'Perfil',     index: 3, shell: shell),
        ],
      ),
    );
  }
}

class _MobileNavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final int index;
  final StatefulNavigationShell shell;

  const _MobileNavItem({
    required this.icon,
    required this.label,
    required this.index,
    required this.shell,
  });

  @override
  Widget build(BuildContext context) {
    final active = shell.currentIndex == index;
    final color  = active ? AppColors.orange : AppColors.textMuted;
    return InkWell(
      onTap: () => shell.goBranch(index, initialLocation: index == shell.currentIndex),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 24),
            Text(label, style: TextStyle(fontSize: 10, color: color, fontWeight: active ? FontWeight.w700 : FontWeight.normal)),
          ],
        ),
      ),
    );
  }
}
