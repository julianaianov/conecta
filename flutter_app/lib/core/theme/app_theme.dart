import 'package:flutter/material.dart';
import 'app_colors.dart';

class AppTheme {
  static ThemeData get light {
    const cs = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.steelBlue,
      onPrimary: Colors.white,
      primaryContainer: AppColors.blueMuted,
      onPrimaryContainer: AppColors.navy,
      secondary: AppColors.orange,
      onSecondary: Colors.white,
      secondaryContainer: AppColors.orangeMuted,
      onSecondaryContainer: AppColors.navy,
      tertiary: AppColors.navy,
      onTertiary: Colors.white,
      error: Color(0xFFB00020),
      onError: Colors.white,
      surface: Colors.white,
      onSurface: AppColors.navy,
      onSurfaceVariant: AppColors.navyLight,
      outline: AppColors.blueLight,
      outlineVariant: AppColors.neutralDark,
      shadow: Colors.black26,
      surfaceContainerHighest: AppColors.offWhite,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: cs,
      scaffoldBackgroundColor: AppColors.pageBg,
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.headerBg,
        foregroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.orange,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(48),
          elevation: 2,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.steelBlue,
          side: const BorderSide(color: AppColors.steelBlue),
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.offWhite,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.steelBlue, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: Colors.white,
        selectedColor: AppColors.orange.withAlpha(30),
        side: BorderSide(color: AppColors.neutralDark.withAlpha(100)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        labelStyle: const TextStyle(fontSize: 12),
      ),
      navigationBarTheme: NavigationBarThemeData(
        indicatorColor: AppColors.orange.withAlpha(40),
        labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 11)),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.orange),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.navy,
        contentTextStyle: const TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
