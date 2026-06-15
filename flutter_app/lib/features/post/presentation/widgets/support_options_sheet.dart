import 'package:flutter/material.dart';

import 'package:go_router/go_router.dart';

import '../../../feed/data/post_service.dart';

import '../../domain/models/support_type.dart';



class SupportOptionsSheet extends StatefulWidget {

  final String postId;

  final String postTitle;

  final void Function(int newCount)? onCountChanged;



  const SupportOptionsSheet({

    super.key,

    required this.postId,

    required this.postTitle,

    this.onCountChanged,

  });



  static Future<void> show(

    BuildContext context, {

    required String postId,

    required String postTitle,

    void Function(int newCount)? onCountChanged,

  }) =>

      showModalBottomSheet(

        context: context,

        isScrollControlled: true,

        shape: const RoundedRectangleBorder(

          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),

        ),

        builder: (_) => SupportOptionsSheet(

          postId: postId,

          postTitle: postTitle,

          onCountChanged: onCountChanged,

        ),

      );



  @override

  State<SupportOptionsSheet> createState() => _SupportOptionsSheetState();

}



class _SupportOptionsSheetState extends State<SupportOptionsSheet> {

  final _service = PostService();



  SupportType? _selected;

  List<SupportSummary> _summary = [];

  bool _loading = true;



  @override

  void initState() {

    super.initState();

    _load();

  }



  Future<void> _load() async {

    try {

      final data = await _service.fetchSupports(widget.postId);

      if (!mounted) return;

      setState(() {

        _summary = data.summary;

        _loading = false;

      });

    } catch (_) {

      if (mounted) setState(() => _loading = false);

    }

  }



  void _continue() {

    if (_selected == null) return;

    Navigator.pop(context);

    context.push(

      '/post/${widget.postId}/support',

      extra: {

        'type': _selected!.value,

        'title': widget.postTitle,

        'onCountChanged': widget.onCountChanged,

      },

    ).then((result) {

      if (result is Map && result['reactions_count'] != null) {

        widget.onCountChanged?.call((result['reactions_count'] as num).toInt());

      }

    });

  }



  @override

  Widget build(BuildContext context) {

    final cs = Theme.of(context).colorScheme;



    return DraggableScrollableSheet(

      expand: false,

      initialChildSize: 0.75,

      minChildSize: 0.4,

      maxChildSize: 0.92,

      builder: (_, scrollCtrl) => Column(

        children: [

          const SizedBox(height: 8),

          Container(width: 40, height: 4,

            decoration: BoxDecoration(color: cs.outline.withAlpha(80), borderRadius: BorderRadius.circular(2))),

          Padding(

            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),

            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

              Text('Como você quer apoiar?',

                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),

              const SizedBox(height: 4),

              Text(widget.postTitle,

                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.outline),

                maxLines: 2, overflow: TextOverflow.ellipsis),

            ]),

          ),

          if (_summary.isNotEmpty)

            Padding(

              padding: const EdgeInsets.symmetric(horizontal: 20),

              child: Wrap(

                spacing: 6, runSpacing: 6,

                children: _summary.map((s) => Chip(

                  avatar: Icon(s.type.icon, size: 16),

                  label: Text('${s.type.label}: ${s.count}', style: const TextStyle(fontSize: 11)),

                  visualDensity: VisualDensity.compact,

                  padding: EdgeInsets.zero,

                )).toList(),

              ),

            ),

          const SizedBox(height: 8),

          Expanded(

            child: _loading

                ? const Center(child: CircularProgressIndicator())

                : ListView.builder(

                    controller: scrollCtrl,

                    padding: const EdgeInsets.symmetric(horizontal: 16),

                    itemCount: SupportType.values.length,

                    itemBuilder: (_, i) {

                      final type     = SupportType.values[i];

                      final selected = _selected == type;



                      return Card(

                        elevation: selected ? 2 : 0,

                        color: selected

                            ? cs.primaryContainer.withAlpha(120)

                            : cs.surfaceContainerHighest.withAlpha(60),

                        margin: const EdgeInsets.only(bottom: 8),

                        child: InkWell(

                          borderRadius: BorderRadius.circular(12),

                          onTap: () => setState(() => _selected = type),

                          child: Padding(

                            padding: const EdgeInsets.all(12),

                            child: Row(children: [

                              CircleAvatar(

                                backgroundColor: selected ? cs.primary : cs.primaryContainer,

                                child: Icon(type.icon,

                                  color: selected ? cs.onPrimary : cs.primary, size: 22),

                              ),

                              const SizedBox(width: 12),

                              Expanded(

                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

                                  Text(type.label, style: const TextStyle(fontWeight: FontWeight.w600)),

                                  Text(type.subtitle,

                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.outline)),

                                ]),

                              ),

                              if (selected) Icon(Icons.arrow_forward, color: cs.primary),

                            ]),

                          ),

                        ),

                      );

                    },

                  ),

          ),

          SafeArea(

            child: Padding(

              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),

              child: FilledButton(

                onPressed: _selected == null ? null : _continue,

                child: const Text('Continuar'),

              ),

            ),

          ),

        ],

      ),

    );

  }

}


