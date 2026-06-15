import 'package:flutter/material.dart';

/// Paleta Conecta — navy, steel blue, laranja e off-white.
class AppColors {
  AppColors._();

  // ── Cores base Conecta ────────────────────────────────────────────────────
  static const navy      = Color(0xFF112B3C);
  static const steelBlue = Color(0xFF205375);
  static const orange    = Color(0xFFF66B0E);
  static const offWhite  = Color(0xFFEFEFEF);

  // ── Variações ─────────────────────────────────────────────────────────────
  static const navyLight   = Color(0xFF234963);
  static const blueLight   = Color(0xFF5483A9);
  static const blueMuted   = Color(0xFF7EA8C5);
  static const orangeLight = Color(0xFFF8833A);
  static const orangeMuted = Color(0xFFFCB392);
  static const neutralDark = Color(0xFFD1D1D1);

  // ── Tokens de layout (estrutura social, cores Conecta) ───────────────────
  static const headerBg     = navy;
  static const headerActive = steelBlue;
  static const boxHeader    = steelBlue;
  static const boxAccent    = orange;
  static const pageBg       = offWhite;
  static const boxBorder    = neutralDark;
  static const linkBlue     = steelBlue;
  static const textDark     = navy;
  static const textMuted    = blueLight;

  // ── Tipos de publicação ───────────────────────────────────────────────────
  static const postProblem = orange;
  static const postProject = steelBlue;
  static const postNeed    = orangeLight;
  static const postEvent   = blueLight;
  static const postAction  = navy;

  static Color roleColor(String role) => switch (role) {
    'citizen'      => steelBlue,
    'organization' => blueLight,
    'government'   => navy,
    'business'     => orange,
    _              => steelBlue,
  };
}
