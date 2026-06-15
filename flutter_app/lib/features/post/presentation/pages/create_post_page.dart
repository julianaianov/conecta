import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/demo/demo_data.dart';
import '../../../../shared/widgets/orkut_scaffold.dart';
import '../../../feed/data/post_service.dart';
import '../../../feed/presentation/providers/feed_provider.dart';

class CreatePostPage extends StatefulWidget {
  const CreatePostPage({super.key});

  @override
  State<CreatePostPage> createState() => _CreatePostPageState();
}

class _CreatePostPageState extends State<CreatePostPage> {
  final _formKey      = GlobalKey<FormState>();
  final _title        = TextEditingController();
  final _description  = TextEditingController();
  final _neighborhood = TextEditingController();
  final _city         = TextEditingController();
  final _tagsCtrl     = TextEditingController();

  String _type    = 'problem';
  bool   _loading = false;

  @override
  void initState() {
    super.initState();
    _neighborhood.text = DemoData.neighborhood;
    _city.text         = DemoData.city;
  }

  static const _types = [
    ('problem', 'Problema',    Icons.warning_amber_rounded,       0xFFF66B0E),
    ('project', 'Projeto',     Icons.construction_rounded,        0xFF205375),
    ('need',    'Necessidade', Icons.volunteer_activism,          0xFFF8833A),
    ('event',   'Evento',      Icons.event,                       0xFF5483A9),
    ('action',  'Ação Social', Icons.eco,                         0xFF112B3C),
    ('message', 'Mensagem',    Icons.chat_bubble_outline_rounded, 0xFF1565C0),
  ];

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _neighborhood.dispose();
    _city.dispose();
    _tagsCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      final tags = _tagsCtrl.text
          .split(',')
          .map((t) => t.trim())
          .where((t) => t.isNotEmpty)
          .toList();

      await PostService().createPost(
        type:         _type,
        title:        _title.text.trim(),
        description:  _description.text.trim(),
        neighborhood: _neighborhood.text.trim().isEmpty ? null : _neighborhood.text.trim(),
        city:         _city.text.trim().isEmpty ? null : _city.text.trim(),
        tags:         tags,
      );

      if (!mounted) return;
      context.read<FeedProvider>().loadPosts(refresh: true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Publicação criada com sucesso!')),
      );
      context.pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao criar publicação: $e')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _submitButton({bool compact = false}) {
    final child = _loading
        ? SizedBox(
            height: compact ? 16 : 20,
            width: compact ? 16 : 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: compact ? Theme.of(context).colorScheme.primary : Colors.white,
            ),
          )
        : const Text('Publicar');

    if (compact) {
      return TextButton(
        onPressed: _loading ? null : _submit,
        child: child,
      );
    }

    return FilledButton(
      onPressed: _loading ? null : _submit,
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    return OrkutScaffold(
      title: 'Nova Publicação',
      body: Column(
        children: [
          Expanded(
            child: Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
            // ── Type selector ──────────────────────────────────────────
            Text('Tipo de publicação', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 10),
            GridView.count(
              crossAxisCount: 3,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 1.3,
              children: _types.map((t) {
                final selected = _type == t.$1;
                final color    = Color(t.$4);
                return GestureDetector(
                  onTap: () => setState(() => _type = t.$1),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    decoration: BoxDecoration(
                      color: selected ? color : color.withAlpha(30),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: selected ? color : Colors.transparent, width: 2),
                    ),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(t.$3, color: selected ? Colors.white : color, size: 22),
                      const SizedBox(height: 4),
                      Text(t.$2,
                        style: TextStyle(
                          color: selected ? Colors.white : color,
                          fontSize: 11, fontWeight: FontWeight.w600),
                        textAlign: TextAlign.center),
                    ]),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 20),
            // ── Fields ────────────────────────────────────────────────
            TextFormField(
              controller: _title,
              decoration: const InputDecoration(
                labelText: 'Título *',
                prefixIcon: Icon(Icons.title),
                hintText: 'Ex: Buraco na Rua das Flores',
              ),
              maxLength: 100,
              validator: (v) => (v?.trim().isNotEmpty ?? false) ? null : 'Campo obrigatório',
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _description,
              decoration: const InputDecoration(
                labelText: 'Descrição *',
                prefixIcon: Icon(Icons.description_outlined),
                hintText: 'Descreva a situação com detalhes...',
                alignLabelWithHint: true,
              ),
              maxLines: 5,
              maxLength: 1000,
              validator: (v) => (v?.trim().isNotEmpty ?? false) ? null : 'Campo obrigatório',
            ),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: TextFormField(
                  controller: _neighborhood,
                  decoration: const InputDecoration(
                    labelText: 'Bairro',
                    prefixIcon: Icon(Icons.place_outlined),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextFormField(
                  controller: _city,
                  decoration: const InputDecoration(
                    labelText: 'Cidade',
                    prefixIcon: Icon(Icons.location_city_outlined),
                  ),
                ),
              ),
            ]),
            const SizedBox(height: 16),
            TextFormField(
              controller: _tagsCtrl,
              decoration: const InputDecoration(
                labelText: 'Tags (separadas por vírgula)',
                prefixIcon: Icon(Icons.tag),
                hintText: 'ambiental, esporte, saúde...',
              ),
            ),
            const SizedBox(height: 8),
            Text('* Campos obrigatórios',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey)),
                ],
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: _submitButton(),
            ),
          ),
        ],
      ),
    );
  }
}
