import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/theme/app_colors.dart';
import '../providers/auth_provider.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _formKey  = GlobalKey<FormState>();
  final _name     = TextEditingController();
  final _email    = TextEditingController();
  final _password = TextEditingController();
  String _role    = 'citizen';
  bool   _loading = false;
  bool   _obscure = true;

  static const _roles = [
    ('citizen',      'Cidadão / Morador',       Icons.person_outline),
    ('organization', 'ONG',                      Icons.groups_outlined),
    ('association',  'Associação',               Icons.home_work_outlined),
    ('government',   'Governo / Prefeitura',     Icons.account_balance_outlined),
    ('business',     'Empresa / Patrocinador',   Icons.business_outlined),
  ];

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    final ok = await context.read<AuthProvider>().register(
      email: _email.text.trim(),
      password: _password.text,
      name: _name.text.trim(),
      role: _role,
    );
    if (!mounted) return;
    setState(() => _loading = false);
    if (ok) {
      context.go('/feed');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.read<AuthProvider>().error ?? 'Erro ao cadastrar')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.pageBg,
      body: Column(
        children: [
          Container(
            width: double.infinity,
            color: AppColors.headerBg,
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: SafeArea(
              bottom: false,
              child: Column(
                children: [
                  const Text('dmconecta', style: TextStyle(
                    color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold, letterSpacing: 1)),
                  const Text('criar conta', style: TextStyle(color: AppColors.blueMuted, fontSize: 13)),
                ],
              ),
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: AppColors.boxBorder),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          color: AppColors.boxAccent,
                          child: const Text('cadastro', style: TextStyle(
                            color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: Form(
                            key: _formKey,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                TextFormField(
                                  controller: _name,
                                  decoration: const InputDecoration(labelText: 'Nome completo'),
                                  validator: (v) => (v?.trim().isNotEmpty ?? false) ? null : 'Campo obrigatório',
                                ),
                                const SizedBox(height: 12),
                                TextFormField(
                                  controller: _email,
                                  keyboardType: TextInputType.emailAddress,
                                  decoration: const InputDecoration(labelText: 'E-mail'),
                                  validator: (v) => (v?.contains('@') ?? false) ? null : 'E-mail inválido',
                                ),
                                const SizedBox(height: 12),
                                TextFormField(
                                  controller: _password,
                                  obscureText: _obscure,
                                  decoration: InputDecoration(
                                    labelText: 'Senha',
                                    suffixIcon: IconButton(
                                      icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                                      onPressed: () => setState(() => _obscure = !_obscure),
                                    ),
                                  ),
                                  validator: (v) => (v?.length ?? 0) >= 6 ? null : 'Mínimo 6 caracteres',
                                ),
                                const SizedBox(height: 16),
                                const Text('tipo de perfil', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                                const SizedBox(height: 8),
                                ..._roles.map((r) {
                                  final selected = _role == r.$1;
                                  final roleColor = AppColors.roleColor(r.$1);
                                  return InkWell(
                                    onTap: () => setState(() => _role = r.$1),
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 6),
                                      child: Row(children: [
                                        AnimatedContainer(
                                          duration: const Duration(milliseconds: 150),
                                          width: 20, height: 20,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            border: Border.all(color: roleColor, width: 2),
                                            color: selected ? roleColor : Colors.transparent,
                                          ),
                                          child: selected
                                              ? const Icon(Icons.check, size: 12, color: Colors.white)
                                              : null,
                                        ),
                                        const SizedBox(width: 10),
                                        Icon(r.$3, size: 20, color: roleColor),
                                        const SizedBox(width: 8),
                                        Text(r.$2, style: const TextStyle(fontSize: 13)),
                                      ]),
                                    ),
                                  );
                                }),
                                const SizedBox(height: 20),
                                FilledButton(
                                  onPressed: _loading ? null : _submit,
                                  child: _loading
                                      ? const SizedBox(height: 20, width: 20,
                                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                      : const Text('Cadastrar'),
                                ),
                                TextButton(
                                  onPressed: () => context.go('/login'),
                                  child: const Text('Já tem conta? Entrar'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
