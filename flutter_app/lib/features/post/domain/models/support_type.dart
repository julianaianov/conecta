import 'package:flutter/material.dart';

enum SupportType {
  financial('financial', 'Apoio financeiro', 'Doação em dinheiro ou PIX', Icons.payments_outlined),
  materials('materials', 'Materiais e insumos', 'Ferramentas, tinta, telas, etc.', Icons.inventory_2_outlined),
  labor('labor', 'Mão de obra', 'Trabalho técnico ou operacional', Icons.construction_outlined),
  volunteering('volunteering', 'Voluntariado', 'Disponibilidade de tempo', Icons.volunteer_activism_outlined),
  equipment('equipment', 'Equipamentos', 'Emprestar ou doar equipamentos', Icons.handyman_outlined),
  space('space', 'Espaço / local', 'Ceder sala, galpão ou área', Icons.home_work_outlined),
  food('food', 'Alimentos', 'Doação de comida ou bebidas', Icons.restaurant_outlined),
  transport('transport', 'Transporte', 'Veículo, frete ou logística', Icons.local_shipping_outlined),
  knowledge('knowledge', 'Conhecimento', 'Mentoria, consultoria ou palestra', Icons.school_outlined),
  sharing('sharing', 'Divulgação', 'Compartilhar nas redes e grupos', Icons.share_outlined);

  const SupportType(this.value, this.label, this.subtitle, this.icon);
  final String value;
  final String label;
  final String subtitle;
  final IconData icon;

  static SupportType fromString(String s) =>
      SupportType.values.firstWhere((e) => e.value == s, orElse: () => SupportType.volunteering);
}

class SupportSummary {
  final SupportType type;
  final int count;

  const SupportSummary({required this.type, required this.count});

  factory SupportSummary.fromJson(Map<String, dynamic> j) => SupportSummary(
    type:  SupportType.fromString(j['type'] as String),
    count: (j['count'] as num).toInt(),
  );
}
