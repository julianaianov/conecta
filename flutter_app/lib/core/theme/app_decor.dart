import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Decorações visuais compartilhadas — layout moderno 2026.
class AppDecor {
  AppDecor._();

  static const radiusSm  = 10.0;
  static const radiusMd  = 16.0;
  static const radiusLg  = 24.0;
  static const radiusPill = 100.0;

  static const headerGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.navy, Color(0xFF1A4A6E), AppColors.steelBlue],
  );

  static const accentGradient = LinearGradient(
    colors: [AppColors.orange, AppColors.orangeLight],
  );

  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.steelBlue, AppColors.blueLight],
  );

  static const coverGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.navy, AppColors.steelBlue, AppColors.blueLight],
  );

  static List<BoxShadow> get cardShadow => [
    BoxShadow(
      color: AppColors.navy.withAlpha(18),
      blurRadius: 24,
      offset: const Offset(0, 8),
    ),
    BoxShadow(
      color: AppColors.navy.withAlpha(8),
      blurRadius: 6,
      offset: const Offset(0, 2),
    ),
  ];

  static BoxDecoration card({Color? color, double radius = radiusMd}) => BoxDecoration(
    color: color ?? Colors.white,
    borderRadius: BorderRadius.circular(radius),
    boxShadow: cardShadow,
  );

  static BoxDecoration glass({double radius = radiusMd}) => BoxDecoration(
    color: Colors.white.withAlpha(230),
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: Colors.white.withAlpha(180)),
    boxShadow: cardShadow,
  );

  static BoxDecoration pill({Color? color, bool selected = false}) => BoxDecoration(
    color: selected ? (color ?? AppColors.steelBlue) : Colors.white.withAlpha(40),
    borderRadius: BorderRadius.circular(radiusPill),
    border: Border.all(
      color: selected ? Colors.transparent : Colors.white.withAlpha(60),
    ),
  );
}
