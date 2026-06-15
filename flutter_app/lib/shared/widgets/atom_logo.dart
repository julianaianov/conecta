import 'dart:math';
import 'package:flutter/material.dart';

class AtomLogo extends StatelessWidget {
  final double size;
  final Color color;

  const AtomLogo({super.key, this.size = 80, this.color = Colors.white});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: _AtomPainter(color: color),
    );
  }
}

class _AtomPainter extends CustomPainter {
  final Color color;
  const _AtomPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;
    final r  = size.width / 2;

    final orbitPaint = Paint()
      ..color = color.withAlpha(200)
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.03;

    final nucleusPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final electronPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    // Nucleus
    canvas.drawCircle(Offset(cx, cy), r * 0.12, nucleusPaint);

    // Three orbits at 0°, 60°, 120°
    for (int i = 0; i < 3; i++) {
      final angle = i * pi / 3;
      canvas.save();
      canvas.translate(cx, cy);
      canvas.rotate(angle);
      canvas.scale(1.0, 0.38);
      canvas.drawOval(
        Rect.fromCenter(center: Offset.zero, width: r * 1.7, height: r * 1.7),
        orbitPaint,
      );
      canvas.restore();

      // Electron dot on each orbit
      final eAngle = angle + pi / 2;
      final ex = cx + cos(eAngle) * r * 0.78;
      final ey = cy + sin(eAngle) * r * 0.78 * 0.38;
      canvas.drawCircle(Offset(ex, ey), r * 0.07, electronPaint);
    }
  }

  @override
  bool shouldRepaint(_AtomPainter old) => old.color != color;
}
