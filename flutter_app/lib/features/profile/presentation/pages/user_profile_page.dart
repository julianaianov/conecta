import 'package:flutter/material.dart';
import '../../../../core/demo/demo_social.dart';
import '../widgets/orkut_profile_view.dart';
import '../../../../shared/widgets/orkut_scaffold.dart';

class UserProfilePage extends StatelessWidget {
  final String userId;
  const UserProfilePage({super.key, required this.userId});

  @override
  Widget build(BuildContext context) {
    final profile = DemoSocial.getProfile(userId);
    return OrkutScaffold(
      title: profile?.name ?? 'Perfil',
      body: OrkutProfileView(userId: userId, isOwnProfile: false),
    );
  }
}
