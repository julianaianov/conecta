import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../feed/data/post_service.dart';
import '../../domain/models/payment_method.dart';
import '../../domain/models/support_type.dart';

/// Fluxo completo de apoio por tipo — inclui pagamento PIX/cartão para financeiro.
class SupportFlowPage extends StatefulWidget {
  final String postId;
  final String postTitle;
  final SupportType type;

  const SupportFlowPage({
    super.key,
    required this.postId,
    required this.postTitle,
    required this.type,
  });

  @override
  State<SupportFlowPage> createState() => _SupportFlowPageState();
}

class _SupportFlowPageState extends State<SupportFlowPage> {
  final _service = PostService();
  final _currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');

  int _step = 0;
  bool _loading = false;

  // Financeiro
  final _amountCtrl = TextEditingController();
  PaymentMethod? _paymentMethod;
  final _cardNumber = TextEditingController();
  final _cardName   = TextEditingController();
  final _cardExpiry = TextEditingController();
  final _cardCvv    = TextEditingController();

  // Campos comuns / por tipo
  final _description = TextEditingController();
  final _quantity    = TextEditingController();
  final _schedule    = TextEditingController();
  final _message     = TextEditingController();

  bool _done = false;
  Map<String, dynamic>? _result;

  @override
  void dispose() {
    _amountCtrl.dispose();
    _cardNumber.dispose();
    _cardName.dispose();
    _cardExpiry.dispose();
    _cardCvv.dispose();
    _description.dispose();
    _quantity.dispose();
    _schedule.dispose();
    _message.dispose();
    super.dispose();
  }

  int get _totalSteps => widget.type == SupportType.financial ? 3 : 1;

  String get _stepTitle => switch (_step) {
    0 => _typeStepTitle(),
    1 when widget.type == SupportType.financial => 'Forma de pagamento',
    2 => 'Pagamento',
    _ => 'Concluir',
  };

  String _typeStepTitle() => switch (widget.type) {
    SupportType.financial    => 'Valor do apoio',
    SupportType.materials    => 'Materiais oferecidos',
    SupportType.labor        => 'Mão de obra',
    SupportType.volunteering => 'Voluntariado',
    SupportType.equipment    => 'Equipamentos',
    SupportType.space        => 'Espaço / local',
    SupportType.food         => 'Alimentos',
    SupportType.transport    => 'Transporte',
    SupportType.knowledge    => 'Conhecimento',
    SupportType.sharing      => 'Divulgação',
  };

  Map<String, dynamic> _buildDetails() {
    final d = <String, dynamic>{
      if (_description.text.trim().isNotEmpty) 'description': _description.text.trim(),
      if (_quantity.text.trim().isNotEmpty)    'quantity': _quantity.text.trim(),
      if (_schedule.text.trim().isNotEmpty)    'schedule': _schedule.text.trim(),
    };
    switch (widget.type) {
      case SupportType.materials:
        d['delivery'] = _schedule.text.trim();
      case SupportType.labor:
        d['skill'] = _description.text.trim();
        d['hours'] = _quantity.text.trim();
      case SupportType.volunteering:
        d['hours_per_week'] = _quantity.text.trim();
      case SupportType.equipment:
        d['equipment_name'] = _description.text.trim();
        d['mode'] = _quantity.text.trim(); // emprestar / doar
      case SupportType.space:
        d['space_type'] = _description.text.trim();
        d['capacity'] = _quantity.text.trim();
      case SupportType.food:
        d['food_type'] = _description.text.trim();
        d['portions'] = _quantity.text.trim();
      case SupportType.transport:
        d['vehicle'] = _description.text.trim();
        d['capacity'] = _quantity.text.trim();
      case SupportType.knowledge:
        d['expertise'] = _description.text.trim();
        d['format'] = _quantity.text.trim();
      case SupportType.sharing:
        d['channels'] = _description.text.trim();
        d['reach'] = _quantity.text.trim();
      default:
        break;
    }
    return d;
  }

  double? _parseAmount() {
    final raw = _amountCtrl.text.replaceAll('.', '').replaceAll(',', '.');
    return double.tryParse(raw);
  }

  bool _validateStep() {
    if (_step == 0) {
      if (widget.type == SupportType.financial) {
        final v = _parseAmount();
        if (v == null || v <= 0) {
          _snack('Informe um valor válido');
          return false;
        }
        return true;
      }
      if (_description.text.trim().isEmpty) {
        _snack(_hintForDescription());
        return false;
      }
      return true;
    }
    if (_step == 1 && widget.type == SupportType.financial) {
      if (_paymentMethod == null) {
        _snack('Selecione a forma de pagamento');
        return false;
      }
      return true;
    }
    if (_step == 2 && widget.type == SupportType.financial) {
      if (_paymentMethod == PaymentMethod.pix) return true;
      if (_cardNumber.text.length < 16 || _cardName.text.isEmpty ||
          _cardExpiry.text.length < 4 || _cardCvv.text.length < 3) {
        _snack('Preencha os dados do cartão');
        return false;
      }
      return true;
    }
    return true;
  }

  String _hintForDescription() => switch (widget.type) {
    SupportType.materials    => 'Descreva os materiais que pode oferecer',
    SupportType.labor        => 'Descreva sua habilidade / serviço',
    SupportType.volunteering => 'Descreva como pode ajudar',
    SupportType.equipment    => 'Descreva o equipamento',
    SupportType.space        => 'Descreva o espaço disponível',
    SupportType.food         => 'Descreva os alimentos',
    SupportType.transport    => 'Descreva o veículo / frete',
    SupportType.knowledge    => 'Descreva sua área de conhecimento',
    SupportType.sharing      => 'Descreva onde pode divulgar',
    _ => 'Preencha os detalhes',
  };

  void _snack(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  Future<void> _next() async {
    if (!_validateStep()) return;

    if (widget.type == SupportType.financial) {
      if (_step < 2) {
        setState(() => _step++);
        return;
      }
      await _submitFinancial();
    } else {
      await _submitOther();
    }
  }

  Future<void> _submitFinancial() async {
    setState(() => _loading = true);
    try {
      final amount = _parseAmount()!;
      final result = await _service.createSupport(
        widget.postId,
        type: widget.type.value,
        amount: amount,
        paymentMethod: _paymentMethod!.value,
        message: _message.text.trim().isEmpty ? null : _message.text.trim(),
        details: {
          'payment_simulated': true,
          if (_paymentMethod != PaymentMethod.pix && _cardNumber.text.length >= 4)
            'card_last4': _cardNumber.text.substring(_cardNumber.text.length - 4),
        },
        status: 'confirmed',
      );
      if (!mounted) return;
      setState(() { _done = true; _result = result; _loading = false; });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
      _snack('Erro ao processar pagamento');
    }
  }

  Future<void> _submitOther() async {
    setState(() => _loading = true);
    try {
      final result = await _service.createSupport(
        widget.postId,
        type: widget.type.value,
        message: _message.text.trim().isEmpty ? null : _message.text.trim(),
        details: _buildDetails(),
        status: 'confirmed',
      );
      if (!mounted) return;
      setState(() { _done = true; _result = result; _loading = false; });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
      _snack('Erro ao registrar apoio');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_done) return _SuccessView(
      type: widget.type,
      postTitle: widget.postTitle,
      amount: _parseAmount(),
      paymentMethod: _paymentMethod,
      onClose: () => context.pop(_result),
      onViewPanel: () {
        context.pop(_result);
        context.push('/my-supports');
      },
    );

    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(_stepTitle),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          LinearProgressIndicator(
            value: (_step + 1) / _totalSteps,
            backgroundColor: cs.surfaceContainerHighest,
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              CircleAvatar(
                backgroundColor: cs.primaryContainer,
                child: Icon(widget.type.icon, color: cs.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(widget.type.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(widget.postTitle,
                    style: TextStyle(fontSize: 12, color: cs.outline),
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                ]),
              ),
            ]),
          ),
          Expanded(child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: _buildStepContent(),
          )),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: FilledButton(
                onPressed: _loading ? null : _next,
                child: _loading
                    ? const SizedBox(height: 22, width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(_step == _totalSteps - 1 ? 'Confirmar apoio' : 'Continuar'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepContent() {
    if (_step == 0) return _buildDetailsStep();
    if (_step == 1) return _buildPaymentMethodStep();
    return _buildPaymentStep();
  }

  Widget _buildDetailsStep() {
    if (widget.type == SupportType.financial) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Quanto deseja apoiar?', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 16),
        TextField(
          controller: _amountCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: 'Valor (R\$)',
            prefixIcon: const Icon(Icons.attach_money),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(spacing: 8, children: [20, 50, 100, 200].map((v) => ActionChip(
          label: Text(_currency.format(v)),
          onPressed: () => _amountCtrl.text = v.toStringAsFixed(2).replaceAll('.', ','),
        )).toList()),
        const SizedBox(height: 16),
        TextField(
          controller: _message,
          decoration: InputDecoration(
            labelText: 'Mensagem (opcional)',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          maxLines: 2,
        ),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      ..._fieldsForType(),
      const SizedBox(height: 12),
      TextField(
        controller: _message,
        decoration: InputDecoration(
          labelText: 'Mensagem para o autor (opcional)',
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
        maxLines: 2,
      ),
    ]);
  }

  List<Widget> _fieldsForType() {
    InputDecoration deco(String label, {String? hint}) => InputDecoration(
      labelText: label,
      hintText: hint,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    );

    switch (widget.type) {
      case SupportType.materials:
        return [
          TextField(controller: _description, decoration: deco('Materiais', hint: 'Ex: 10 sacos de cimento, tinta branca')),
          const SizedBox(height: 12),
          TextField(controller: _quantity, decoration: deco('Quantidade / detalhes')),
          const SizedBox(height: 12),
          TextField(controller: _schedule, decoration: deco('Quando pode entregar?', hint: 'Ex: sábado de manhã')),
        ];
      case SupportType.labor:
        return [
          TextField(controller: _description, decoration: deco('Habilidade / serviço', hint: 'Ex: pedreiro, eletricista')),
          const SizedBox(height: 12),
          TextField(controller: _quantity, decoration: deco('Horas disponíveis', hint: 'Ex: 4h por semana')),
          const SizedBox(height: 12),
          TextField(controller: _schedule, decoration: deco('Dias disponíveis', hint: 'Ex: seg, qua, sáb')),
        ];
      case SupportType.volunteering:
        return [
          TextField(controller: _description, decoration: deco('Como pode ajudar?', hint: 'Ex: organização, recepção')),
          const SizedBox(height: 12),
          TextField(controller: _quantity, decoration: deco('Horas por semana')),
          const SizedBox(height: 12),
          TextField(controller: _schedule, decoration: deco('Disponibilidade', hint: 'Ex: sábados 8h–12h')),
        ];
      case SupportType.equipment:
        return [
          TextField(controller: _description, decoration: deco('Equipamento', hint: 'Ex: betoneira, furadeira')),
          const SizedBox(height: 12),
          TextField(controller: _quantity, decoration: deco('Emprestar ou doar?')),
          const SizedBox(height: 12),
          TextField(controller: _schedule, decoration: deco('Período disponível')),
        ];
      case SupportType.space:
        return [
          TextField(controller: _description, decoration: deco('Tipo de espaço', hint: 'Ex: salão comunitário, galpão')),
          const SizedBox(height: 12),
          TextField(controller: _quantity, decoration: deco('Capacidade (pessoas/m²)')),
          const SizedBox(height: 12),
          TextField(controller: _schedule, decoration: deco('Datas disponíveis')),
        ];
      case SupportType.food:
        return [
          TextField(controller: _description, decoration: deco('Alimentos', hint: 'Ex: cestas básicas, frutas')),
          const SizedBox(height: 12),
          TextField(controller: _quantity, decoration: deco('Porções / quantidade')),
          const SizedBox(height: 12),
          TextField(controller: _schedule, decoration: deco('Data de entrega')),
        ];
      case SupportType.transport:
        return [
          TextField(controller: _description, decoration: deco('Veículo / frete', hint: 'Ex: caminhonete, van')),
          const SizedBox(height: 12),
          TextField(controller: _quantity, decoration: deco('Capacidade de carga')),
          const SizedBox(height: 12),
          TextField(controller: _schedule, decoration: deco('Disponibilidade')),
        ];
      case SupportType.knowledge:
        return [
          TextField(controller: _description, decoration: deco('Área de expertise', hint: 'Ex: engenharia, direito ambiental')),
          const SizedBox(height: 12),
          TextField(controller: _quantity, decoration: deco('Formato', hint: 'Presencial / Online')),
          const SizedBox(height: 12),
          TextField(controller: _schedule, decoration: deco('Horários disponíveis')),
        ];
      case SupportType.sharing:
        return [
          TextField(controller: _description, decoration: deco('Canais de divulgação', hint: 'Ex: Instagram, WhatsApp, rádio local')),
          const SizedBox(height: 12),
          TextField(controller: _quantity, decoration: deco('Alcance estimado', hint: 'Ex: 500 seguidores')),
        ];
      default:
        return [TextField(controller: _description, decoration: deco('Detalhes'))];
    }
  }

  Widget _buildPaymentMethodStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: PaymentMethod.values.map((m) {
        final selected = _paymentMethod == m;
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          color: selected ? Theme.of(context).colorScheme.primaryContainer.withAlpha(120) : null,
          child: ListTile(
            leading: Icon(m.icon, color: Theme.of(context).colorScheme.primary),
            title: Text(m.label, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(m.subtitle),
            trailing: selected ? Icon(Icons.check_circle, color: Theme.of(context).colorScheme.primary) : null,
            onTap: () => setState(() => _paymentMethod = m),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildPaymentStep() {
    final amount = _parseAmount() ?? 0;
    if (_paymentMethod == PaymentMethod.pix) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Pague via PIX', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Text('Valor: ${_currency.format(amount)}',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.bold, color: Theme.of(context).colorScheme.primary)),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(children: [
            Icon(Icons.qr_code_2, size: 120, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 12),
            Text('QR Code PIX', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 4),
            Text(PaymentConfig.pixName, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
          ]),
        ),
        const SizedBox(height: 16),
        ListTile(
          tileColor: Theme.of(context).colorScheme.primaryContainer.withAlpha(60),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          title: const Text('Chave PIX', style: TextStyle(fontSize: 12)),
          subtitle: Text(PaymentConfig.pixKey, style: const TextStyle(fontWeight: FontWeight.w600)),
          trailing: IconButton(
            icon: const Icon(Icons.copy),
            onPressed: () {
              Clipboard.setData(ClipboardData(text: PaymentConfig.pixKey));
              _snack('Chave PIX copiada!');
            },
          ),
        ),
        const SizedBox(height: 12),
        Text('Após pagar, toque em "Confirmar apoio" abaixo.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Theme.of(context).colorScheme.outline, fontSize: 13)),
      ]);
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('${_paymentMethod!.label} — ${_currency.format(amount)}',
        style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 16),
      TextField(controller: _cardNumber, keyboardType: TextInputType.number,
        decoration: InputDecoration(labelText: 'Número do cartão', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
        maxLength: 19,
      ),
      const SizedBox(height: 8),
      TextField(controller: _cardName,
        decoration: InputDecoration(labelText: 'Nome no cartão', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: TextField(controller: _cardExpiry, keyboardType: TextInputType.number,
          decoration: InputDecoration(labelText: 'Validade (MM/AA)', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
          maxLength: 5)),
        const SizedBox(width: 12),
        Expanded(child: TextField(controller: _cardCvv, keyboardType: TextInputType.number, obscureText: true,
          decoration: InputDecoration(labelText: 'CVV', border: OutlineInputBorder(borderRadius: BorderRadius.circular(12))),
          maxLength: 4)),
      ]),
      const SizedBox(height: 12),
      Text('Pagamento simulado para demonstração.',
        style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline)),
    ]);
  }
}

class _SuccessView extends StatelessWidget {
  final SupportType type;
  final String postTitle;
  final double? amount;
  final PaymentMethod? paymentMethod;
  final VoidCallback onClose;
  final VoidCallback onViewPanel;

  const _SuccessView({
    required this.type,
    required this.postTitle,
    this.amount,
    this.paymentMethod,
    required this.onClose,
    required this.onViewPanel,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.check_circle, size: 80, color: cs.primary),
            const SizedBox(height: 20),
            Text('Apoio confirmado!', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            Text(postTitle, textAlign: TextAlign.center, style: TextStyle(color: cs.outline)),
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(children: [
                  Row(children: [
                    Icon(type.icon, color: cs.primary),
                    const SizedBox(width: 8),
                    Text(type.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                  ]),
                  if (amount != null) ...[
                    const Divider(),
                    Text(currency.format(amount), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                    if (paymentMethod != null)
                      Text(paymentMethod!.label, style: TextStyle(color: cs.outline)),
                  ],
                ]),
              ),
            ),
            const Spacer(),
            FilledButton(onPressed: onViewPanel, child: const Text('Ver meus apoios')),
            const SizedBox(height: 8),
            TextButton(onPressed: onClose, child: const Text('Voltar à publicação')),
          ]),
        ),
      ),
    );
  }
}
