import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Decorações visuais modernas — paleta Conecta.
class AppDecor {
  AppDecor._();

  static const radiusSm = 10.0;
  static const radiusMd = 16.0;
  static const radiusLg = 24.0;

  static const headerGradient = LinearGradient(
    colors: [AppColors.navy, AppColors.steelBlue],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const accentGradient = LinearGradient(
    colors: [AppColors.orange, AppColors.orangeLight],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const meshGradient = LinearGradient(
    colors: [Color(0xFFF5F7FA), AppColors.offWhite, Color(0xFFE8EEF3)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static List<BoxShadow> get cardShadow => [
    BoxShadow(
      color: AppColors.navy.withAlpha(20),
      blurRadius: 24,
      offset: const Offset(0, 8),
    ),
    BoxShadow(
      color: AppColors.steelBlue.withAlpha(8),
      blurRadius: 4,
      offset: const Offset(0, 1),
    ),
  ];

  static BoxDecoration card({Color? color, double radius = radiusMd}) => BoxDecoration(
    color: color ?? Colors.white,
    borderRadius: BorderRadius.circular(radius),
    boxShadow: cardShadow,
  );

  static BoxDecoration glassCard({double radius = radiusMd}) => BoxDecoration(
    color: Colors.white.withAlpha(230),
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: Colors.white.withAlpha(180)),
    boxShadow: cardShadow,
  );
}
