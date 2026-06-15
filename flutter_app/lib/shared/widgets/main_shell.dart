import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import 'orkut_scaffold.dart';

class MainShell extends StatelessWidget {
  final StatefulNavigationShell navigationShell;
  const MainShell({super.key, required this.navigationShell});

  @override
  Widget build(BuildContext context) {
    final user  = context.watch<AuthProvider>().user;
    final index = navigationShell.currentIndex;

    final title = switch (index) {
      1 => 'Mapa de impacto',
      2 => 'Comunidades',
      _ => null,
    };

    return OrkutScaffold(
      title: title,
      navigationShell: navigationShell,
      body: navigationShell,
    );
  }
}
