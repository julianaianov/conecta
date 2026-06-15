import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_images.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../../../shared/widgets/atom_logo.dart';
import '../providers/auth_provider.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey  = GlobalKey<FormState>();
  final _email    = TextEditingController();
  final _password = TextEditingController();
  bool _loading   = false;
  bool _obscure   = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _loginDemo() async {
    setState(() => _loading = true);
    final ok = await context.read<AuthProvider>().loginDemo();
    if (!mounted) return;
    setState(() => _loading = false);
    if (ok) {
      context.go('/feed');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.read<AuthProvider>().error ?? 'Erro ao entrar')),
      );
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    final ok = await context.read<AuthProvider>().login(_email.text.trim(), _password.text);
    if (!mounted) return;
    setState(() => _loading = false);
    if (ok) {
      context.go('/feed');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.read<AuthProvider>().error ?? 'Erro ao entrar')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;

    return Scaffold(
      backgroundColor: AppColors.pageBg,
      body: wide ? _WideLogin(body: _buildForm()) : _NarrowLogin(form: _buildForm()),
    );
  }

  Widget _buildForm() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.boxBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            color: AppColors.boxHeader,
            child: const Text('entrar', style: TextStyle(
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
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.orangeMuted.withAlpha(80),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.orange.withAlpha(60)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('Modo demo offline', style: TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.orange)),
                        const SizedBox(height: 4),
                        const Text('Explore o app com dados do Recreio.', style: TextStyle(fontSize: 11)),
                        const SizedBox(height: 8),
                        FilledButton(
                          onPressed: _loading ? null : _loginDemo,
                          child: const Text('Entrar sem conexão'),
                        ),
                        TextButton(
                          onPressed: _loading ? null : () {
                            _email.text    = AppConfig.demoEmail;
                            _password.text = AppConfig.demoPassword;
                          },
                          child: const Text('Preencher conta demo'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _loading ? null : _submit,
                    child: _loading
                        ? const SizedBox(height: 20, width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Entrar'),
                  ),
                  TextButton(
                    onPressed: () => context.go('/register'),
                    child: const Text('Não tem conta? Cadastre-se'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NarrowLogin extends StatelessWidget {
  final Widget form;
  const _NarrowLogin({required this.form});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        children: [
          Container(
            width: double.infinity,
            color: AppColors.headerBg,
            padding: const EdgeInsets.symmetric(vertical: 32),
            child: SafeArea(
              bottom: false,
              child: Column(
                children: [
                  const AtomLogo(size: 64),
                  const SizedBox(height: 12),
                  const Text('dmconecta', style: TextStyle(
                    color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold, letterSpacing: 1)),
                  const SizedBox(height: 4),
                  const Text('Transformando bairros', style: TextStyle(color: AppColors.blueMuted, fontSize: 13)),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 400),
                child: form,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WideLogin extends StatelessWidget {
  final Widget body;
  const _WideLogin({required this.body});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              AppNetworkImage(url: AppImages.heroCover, fit: BoxFit.cover),
              Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [Colors.black.withAlpha(160), Colors.black.withAlpha(80)],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(48),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const AtomLogo(size: 80),
                    const SizedBox(height: 20),
                    const Text('dmconecta', style: TextStyle(
                      color: Colors.white, fontSize: 40, fontWeight: FontWeight.bold, letterSpacing: 1)),
                    const SizedBox(height: 8),
                    Text(
                      'Transformando bairros do Recreio',
                      style: TextStyle(color: Colors.white.withAlpha(200), fontSize: 18),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Conecte-se com moradores, associações e projetos que fazem a diferença na sua comunidade.',
                      style: TextStyle(color: Colors.white.withAlpha(180), fontSize: 14, height: 1.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(48),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: body,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
