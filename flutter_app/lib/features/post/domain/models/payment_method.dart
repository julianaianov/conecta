import 'package:flutter/material.dart';

enum PaymentMethod {
  pix('pix', 'PIX', 'Pagamento instantâneo', Icons.qr_code_2),
  debit('debit', 'Cartão de débito', 'Débito em conta', Icons.credit_card),
  credit('credit', 'Cartão de crédito', 'Parcelamento disponível', Icons.credit_score);

  const PaymentMethod(this.value, this.label, this.subtitle, this.icon);
  final String value;
  final String label;
  final String subtitle;
  final IconData icon;

  static PaymentMethod fromString(String s) =>
      PaymentMethod.values.firstWhere((e) => e.value == s, orElse: () => PaymentMethod.pix);
}

/// Chave PIX demo para fluxo de pagamento simulado.
class PaymentConfig {
  static const pixKey  = 'recreio.verde@pix.demo';
  static const pixName = 'Associação Recreio Verde';
}
