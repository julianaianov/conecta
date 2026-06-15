import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_decorations.dart';

/// Card moderno com sombra suave e título estilizado.
class OrkutBox extends StatelessWidget {
  final String title;
  final Widget child;
  final Color? headerColor;
  final IconData? icon;
  final Widget? trailing;
  final EdgeInsets padding;

  const OrkutBox({
    super.key,
    required this.title,
    required this.child,
    this.headerColor,
    this.icon,
    this.trailing,
    this.padding = const EdgeInsets.all(16),
  });

  @override
  Widget build(BuildContext context) {
    final accent = headerColor ?? AppColors.steelBlue;
    return Container(
      decoration: AppDecor.card(),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [accent.withAlpha(25), Colors.transparent],
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              ),
              border: Border(
                left: BorderSide(color: accent, width: 4),
              ),
            ),
            child: Row(
              children: [
                if (icon != null) ...[
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [accent, accent.withAlpha(180)],
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(icon, color: Colors.white, size: 16),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      color: AppColors.navy,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                if (trailing != null) trailing!,
              ],
            ),
          ),
          Padding(padding: padding, child: child),
        ],
      ),
    );
  }
}
