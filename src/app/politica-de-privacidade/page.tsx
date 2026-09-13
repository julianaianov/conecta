import React from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Política de Privacidade — DM Conecta",
  description: "Política de privacidade e proteção de dados do aplicativo DM Conecta.",
};

export default function PoliticaPrivacidadePage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-12 flex-1">
        <h1 className="text-3xl md:text-4xl font-bold mb-6 text-emerald-400">
          Política de Privacidade — DM Conecta
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          Última atualização: 11 de setembro de 2026
        </p>

        <section className="space-y-6 text-slate-300 leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">1. Visão Geral</h2>
            <p>
              O <strong>DM Conecta</strong> é uma plataforma comunitária voltada para conectar moradores,
              projetos sociais, ONGs, voluntários e apoiadores para fortalecer iniciativas locais.
              Esta Política de Privacidade explica de forma transparente como tratamos as informações
              dos usuários no aplicativo móvel e na plataforma web.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">2. Dados Coletados</h2>
            <p>
              Coletamos apenas as informações estritamente necessárias para o funcionamento do serviço:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-300 pl-4">
              <li><strong>Dados de Cadastro:</strong> Nome, e-mail e foto de perfil opcional para identificação de autoria nas demandas e conexões.</li>
              <li><strong>Conteúdo Publicado:</strong> Demandas, propostas de apoio, comentários e interações que você opta por publicar na comunidade.</li>
              <li><strong>Localização aproximada (opcional):</strong> Utilizada exclusivamente se você optar por buscar demandas ou projetos próximos no mapa interativo.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">3. Uso dos Dados</h2>
            <p>
              Os dados coletados são utilizados para:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-300 pl-4">
              <li>Possibilitar a navegação e conexão entre demandantes e apoiadores.</li>
              <li>Autenticar e garantir a segurança das contas de usuário.</li>
              <li>Prevenir fraudes e manter a integridade da plataforma comunitária.</li>
              <li>Não vendemos e não compartilhamos dados pessoais com anunciantes de terceiros.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">4. Permissões no Aplicativo Móvel</h2>
            <p>
              O aplicativo Android do DM Conecta solicita apenas permissões essenciais:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-300 pl-4">
              <li><strong>Acesso à Internet:</strong> Necessário para comunicação com o servidor e exibição do feed.</li>
              <li><strong>Câmera / Armazenamento (opcional):</strong> Utilizado caso você decida enviar fotos para ilustrar uma demanda comunitária ou foto de perfil.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">5. Seus Direitos (LGPD)</h2>
            <p>
              Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem o direito de
              acessar, corrigir, atualizar ou solicitar a exclusão definitiva de seus dados a qualquer momento
              pela área de perfil ou entrando em contato com nossa equipe.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">6. Contato</h2>
            <p>
              Para dúvidas sobre esta política ou sobre o tratamento de dados pessoais, entre em contato pelo e-mail:{" "}
              <a href="mailto:contato@sierratecnologia.com.br" className="text-emerald-400 hover:underline">
                contato@sierratecnologia.com.br
              </a>.
            </p>
          </div>
        </section>

        <div className="mt-12 pt-6 border-t border-slate-800">
          <Link href="/feed" className="text-emerald-400 hover:text-emerald-300 font-medium">
            ← Voltar para o DM Conecta
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
