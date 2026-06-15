import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../providers/map_provider.dart';
import '../../../feed/domain/models/post_model.dart';
import '../../../../core/theme/app_colors.dart';

class MapPage extends StatefulWidget {
  const MapPage({super.key});

  @override
  State<MapPage> createState() => _MapPageState();
}

class _MapPageState extends State<MapPage> {
  static const _filters = [
    (null,      'Todos'),
    ('problem', 'Problemas'),
    ('project', 'Projetos'),
    ('need',    'Necessidades'),
    ('event',   'Eventos'),
    ('action',  'Ações'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MapProvider>().loadMarkers();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<MapProvider>(
      builder: (ctx, map, child) {
        return Stack(
          children: [
            FlutterMap(
                options: const MapOptions(
                  // Centro no Recreio dos Bandeirantes
                  initialCenter: LatLng(-23.0247, -43.4567),
                  initialZoom: 14,
                ),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.conecta.app',
                  ),
                  MarkerLayer(
                    markers: map.markers
                        .where((p) => p.latitude != null && p.longitude != null)
                        .map((p) => _buildMarker(context, p))
                        .toList(),
                  ),
                ],
              ),
              // Loading overlay
              if (map.loading)
                const Positioned(
                  top: 12, left: 0, right: 0,
                  child: Center(child: Card(child: Padding(
                    padding: EdgeInsets.all(8),
                    child: SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                  ))),
                ),
              // Legend
              Positioned(
                bottom: 12, right: 12,
                child: _Legend(),
              ),
              // Error banner
              if (map.error != null)
                Positioned(
                  top: 0, left: 0, right: 0,
                  child: MaterialBanner(
                    content: Text(map.error!),
                    actions: [TextButton(onPressed: () => map.loadMarkers(refresh: true), child: const Text('Tentar'))],
                  ),
                ),
              Positioned(
                top: 12, right: 12,
                child: FloatingActionButton.small(
                  onPressed: _showFilterSheet,
                  backgroundColor: Colors.white,
                  foregroundColor: AppColors.steelBlue,
                  child: const Icon(Icons.filter_list),
                ),
              ),
            ],
          );
        },
    );
  }

  Marker _buildMarker(BuildContext context, PostModel post) {
    final color = Color(post.type.colorValue);
    return Marker(
      point: LatLng(post.latitude!, post.longitude!),
      width: 36, height: 36,
      child: GestureDetector(
        onTap: () => _showPostPopup(context, post),
        child: Container(
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: color.withAlpha(100), blurRadius: 8, spreadRadius: 2)],
          ),
          child: Icon(_typeIcon(post.type), color: Colors.white, size: 18),
        ),
      ),
    );
  }

  IconData _typeIcon(PostType type) => switch (type) {
    PostType.problem => Icons.warning_amber_rounded,
    PostType.project => Icons.construction_rounded,
    PostType.need    => Icons.volunteer_activism,
    PostType.event   => Icons.event,
    PostType.action  => Icons.eco,
    PostType.message => Icons.chat_bubble_outline_rounded,
  };

  void _showPostPopup(BuildContext context, PostModel post) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Color(post.type.colorValue),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(post.type.label,
                  style: const TextStyle(color: Colors.white, fontSize: 11)),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.open_in_new),
                onPressed: () { Navigator.pop(context); context.push('/post/${post.id}'); },
              ),
            ]),
            const SizedBox(height: 8),
            Text(post.title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            if (post.neighborhood != null) ...[
              const SizedBox(height: 4),
              Row(children: [
                const Icon(Icons.place_outlined, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text(post.neighborhood!, style: const TextStyle(color: Colors.grey, fontSize: 13)),
              ]),
            ],
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () { Navigator.pop(context); context.push('/post/${post.id}'); },
              child: const Text('Ver detalhes'),
            ),
          ],
        ),
      ),
    );
  }

  void _showFilterSheet() {
    final map = context.read<MapProvider>();
    showModalBottomSheet(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Filtrar por tipo', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8, runSpacing: 8,
                children: _filters.map((f) => FilterChip(
                  label: Text(f.$2),
                  selected: map.typeFilter == f.$1,
                  onSelected: (_) async {
                    Navigator.pop(context);
                    await map.setFilter(f.$1);
                  },
                )).toList(),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final types = [
      ('Problema',     PostType.problem),
      ('Projeto',      PostType.project),
      ('Necessidade',  PostType.need),
      ('Evento',       PostType.event),
      ('Ação',         PostType.action),
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: types.map((t) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 12, height: 12,
                decoration: BoxDecoration(
                  color: Color(t.$2.colorValue),
                  shape: BoxShape.circle,
                )),
              const SizedBox(width: 6),
              Text(t.$1, style: const TextStyle(fontSize: 11)),
            ]),
          )).toList(),
        ),
      ),
    );
  }
}
