import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_images.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../../../shared/widgets/atom_logo.dart';
import '../providers/auth_provider.dart';

class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage> {
  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await context.read<AuthProvider>().checkAuth();
    if (!mounted) return;
    final auth = context.read<AuthProvider>();
    if (auth.isLoggedIn) {
      context.go('/feed');
    } else {
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          AppNetworkImage(url: AppImages.heroCover, fit: BoxFit.cover),
          Container(color: AppColors.headerBg.withAlpha(200)),
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AtomLogo(size: 96),
                const SizedBox(height: 16),
                const Text('dmconecta', style: TextStyle(
                  color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold, letterSpacing: 2)),
                const Text('Transformando bairros', style: TextStyle(color: AppColors.blueMuted, fontSize: 14)),
                const SizedBox(height: 40),
                const CircularProgressIndicator(color: AppColors.orange),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
