import 'support_type.dart';
import 'payment_method.dart';

class SupportRecord {
  final String id;
  final String postId;
  final String postTitle;
  final String? postType;
  final SupportType type;
  final String? message;
  final double? amount;
  final PaymentMethod? paymentMethod;
  final Map<String, dynamic> details;
  final String status;
  final String? neighborhood;
  final String? city;
  final DateTime createdAt;

  const SupportRecord({
    required this.id,
    required this.postId,
    required this.postTitle,
    this.postType,
    required this.type,
    this.message,
    this.amount,
    this.paymentMethod,
    this.details = const {},
    required this.status,
    this.neighborhood,
    this.city,
    required this.createdAt,
  });

  factory SupportRecord.fromJson(Map<String, dynamic> j) {
    final detailsRaw = j['details'];
    Map<String, dynamic> details = {};
    if (detailsRaw is Map) {
      details = Map<String, dynamic>.from(detailsRaw);
    } else if (detailsRaw is String && detailsRaw.isNotEmpty) {
      try {
        // postgres jsonb as string fallback
        details = {};
      } catch (_) {}
    }

    return SupportRecord(
      id:          j['id'] as String,
      postId:      j['post_id'] as String,
      postTitle:   j['post_title'] as String? ?? 'Publicação',
      postType:    j['post_type'] as String?,
      type:        SupportType.fromString(j['type'] as String),
      message:     j['message'] as String?,
      amount:      (j['amount'] as num?)?.toDouble(),
      paymentMethod: j['payment_method'] != null
          ? PaymentMethod.fromString(j['payment_method'] as String)
          : null,
      details:     details,
      status:      j['status'] as String? ?? 'confirmed',
      neighborhood: j['neighborhood'] as String?,
      city:        j['city'] as String?,
      createdAt:   DateTime.parse(j['created_at'] as String),
    );
  }

  String get statusLabel => switch (status) {
    'pending'   => 'Aguardando',
    'confirmed' => 'Confirmado',
    'completed' => 'Concluído',
    'cancelled' => 'Cancelado',
    _           => status,
  };

  String get summaryLine {
    final parts = <String>[type.label];
    if (amount != null) parts.add('R\$ ${amount!.toStringAsFixed(2)}');
    if (paymentMethod != null) parts.add(paymentMethod!.label);
    final desc = details['description'] as String?;
    if (desc != null && desc.isNotEmpty) parts.add(desc);
    return parts.join(' · ');
  }
}
