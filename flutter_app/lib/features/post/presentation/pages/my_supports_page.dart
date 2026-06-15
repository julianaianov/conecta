import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/orkut_scaffold.dart';
import '../../../feed/data/post_service.dart';
import '../../domain/models/support_record.dart';

class MySupportsPage extends StatefulWidget {
  const MySupportsPage({super.key});

  @override
  State<MySupportsPage> createState() => _MySupportsPageState();
}

class _MySupportsPageState extends State<MySupportsPage> {
  final _service = PostService();
  List<SupportRecord> _items = [];
  bool _loading = true;
  String? _error;
  String? _filter;

  static const _filters = [
    (null, 'Todos'),
    ('financial', 'Financeiro'),
    ('materials', 'Materiais'),
    ('labor', 'Mão de obra'),
    ('volunteering', 'Voluntariado'),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final list = await _service.fetchAllMySupports();
      if (!mounted) return;
      setState(() { _items = list; _loading = false; });
    } catch (_) {
      if (!mounted) return;
      setState(() { _error = 'Erro ao carregar apoios'; _loading = false; });
    }
  }

  List<SupportRecord> get _filtered {
    if (_filter == null) return _items;
    return _items.where((s) => s.type.value == _filter).toList();
  }

  double get _totalFinancial =>
      _items.where((s) => s.amount != null).fold(0.0, (sum, s) => sum + s.amount!);

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');

    return OrkutScaffold(
      title: 'Meus Apoios',
      body: Column(
        children: [
          if (_items.isNotEmpty)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.navy, AppColors.steelBlue],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Painel do apoiador',
                  style: TextStyle(color: Colors.white70, fontSize: 12)),
                const SizedBox(height: 4),
                Text('${_items.length} apoio${_items.length == 1 ? '' : 's'} realizados',
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                if (_totalFinancial > 0) ...[
                  const SizedBox(height: 4),
                  Text('${currency.format(_totalFinancial)} em apoio financeiro',
                    style: TextStyle(color: Colors.white.withAlpha(220))),
                ],
              ]),
            ),
          SizedBox(
            height: 44,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: _filters.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final selected = _filter == _filters[i].$1;
                return FilterChip(
                  label: Text(_filters[i].$2),
                  selected: selected,
                  onSelected: (_) => setState(() => _filter = _filters[i].$1),
                );
              },
            ),
          ),
          const Divider(height: 1),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_error!),
          const SizedBox(height: 12),
          FilledButton.tonal(onPressed: _load, child: const Text('Tentar novamente')),
        ]),
      );
    }
    if (_filtered.isEmpty) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.volunteer_activism_outlined, size: 64, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          const Text('Nenhum apoio registrado ainda'),
          const SizedBox(height: 4),
          Text('Apoie publicações no feed para vê-las aqui',
            style: TextStyle(color: Theme.of(context).colorScheme.outline)),
        ]),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _filtered.length,
        itemBuilder: (_, i) => _SupportTile(record: _filtered[i]),
      ),
    );
  }
}

class _SupportTile extends StatelessWidget {
  final SupportRecord record;
  const _SupportTile({required this.record});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
    final date = DateFormat('dd/MM/yyyy HH:mm').format(record.createdAt.toLocal());

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/post/${record.postId}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: cs.primaryContainer,
                child: Icon(record.type.icon, size: 18, color: cs.primary),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(record.type.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(record.postTitle,
                    style: TextStyle(fontSize: 13, color: cs.outline),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                ]),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: cs.primaryContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(record.statusLabel,
                  style: TextStyle(fontSize: 10, color: cs.primary, fontWeight: FontWeight.w600)),
              ),
            ]),
            const SizedBox(height: 10),
            if (record.amount != null)
              Text(currency.format(record.amount),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold, color: cs.primary)),
            if (record.paymentMethod != null)
              Text(record.paymentMethod!.label, style: TextStyle(fontSize: 12, color: cs.outline)),
            if (record.details.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(_detailsText(record), style: Theme.of(context).textTheme.bodySmall),
            ],
            if (record.message != null && record.message!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('"${record.message}"', style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: cs.outline)),
            ],
            const SizedBox(height: 8),
            Row(children: [
              if (record.neighborhood != null) ...[
                Icon(Icons.place_outlined, size: 14, color: cs.outline),
                const SizedBox(width: 4),
                Text('${record.neighborhood}', style: TextStyle(fontSize: 11, color: cs.outline)),
                const SizedBox(width: 12),
              ],
              Icon(Icons.schedule, size: 14, color: cs.outline),
              const SizedBox(width: 4),
              Text(date, style: TextStyle(fontSize: 11, color: cs.outline)),
              const Spacer(),
              Text('Ver publicação', style: TextStyle(fontSize: 11, color: cs.primary)),
              Icon(Icons.chevron_right, size: 16, color: cs.primary),
            ]),
          ]),
        ),
      ),
    );
  }

  String _detailsText(SupportRecord r) {
    final d = r.details;
    final parts = <String>[];
    for (final key in ['description', 'skill', 'equipment_name', 'space_type', 'food_type', 'vehicle', 'expertise', 'channels', 'quantity', 'schedule', 'hours', 'portions']) {
      final v = d[key]?.toString();
      if (v != null && v.isNotEmpty) parts.add(v);
    }
    return parts.take(3).join(' · ');
  }
}
