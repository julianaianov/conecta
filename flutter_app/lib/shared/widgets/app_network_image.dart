import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../core/theme/app_colors.dart';

class AppNetworkImage extends StatelessWidget {
  final String url;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final Widget? fallback;

  const AppNetworkImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.borderRadius,
    this.fallback,
  });

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty) {
      return _wrap(fallback ?? _defaultFallback());
    }

    return ClipRRect(
      borderRadius: borderRadius ?? BorderRadius.zero,
      child: CachedNetworkImage(
        imageUrl: url,
        width: width,
        height: height,
        fit: fit,
        placeholder: (_, __) => _wrap(
          Shimmer.fromColors(
            baseColor: AppColors.offWhite,
            highlightColor: Colors.white,
            child: Container(color: AppColors.offWhite),
          ),
        ),
        errorWidget: (_, __, ___) => _wrap(fallback ?? _defaultFallback()),
      ),
    );
  }

  Widget _wrap(Widget child) {
    if (width != null || height != null) {
      return SizedBox(width: width, height: height, child: child);
    }
    return child;
  }

  Widget _defaultFallback() => Container(
    color: AppColors.steelBlue.withAlpha(40),
    child: const Center(
      child: Icon(Icons.image_outlined, color: AppColors.textMuted, size: 32),
    ),
  );
}

class AppAvatar extends StatelessWidget {
  final String? imageUrl;
  final String name;
  final double radius;
  final Color? borderColor;
  final Color? accentColor;

  const AppAvatar({
    super.key,
    this.imageUrl,
    required this.name,
    this.radius = 20,
    this.borderColor,
    this.accentColor,
  });

  @override
  Widget build(BuildContext context) {
    final color = accentColor ?? AppColors.orange;
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: borderColor != null ? Border.all(color: borderColor!, width: 2) : null,
      ),
      child: CircleAvatar(
        radius: radius,
        backgroundColor: color.withAlpha(50),
        child: imageUrl != null && imageUrl!.isNotEmpty
            ? ClipOval(
                child: AppNetworkImage(
                  url: imageUrl!,
                  width: radius * 2,
                  height: radius * 2,
                  fallback: Text(
                    initial,
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.bold,
                      fontSize: radius * 0.9,
                    ),
                  ),
                ),
              )
            : Text(
                initial,
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.bold,
                  fontSize: radius * 0.9,
                ),
              ),
      ),
    );
  }
}
