import React from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Padrões de Segurança Infantil — DM Conecta",
  description: "Padrões de segurança e tolerância zero contra exploração e abuso sexual infantil (CSAM/CSAE) no DM Conecta.",
};

export default function SegurancaInfantilPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-12 flex-1">
        <h1 className="text-3xl md:text-4xl font-bold mb-6 text-orange-400">
          Padrões de Segurança Infantil e Prevenção ao Abuso (CSAE)
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          Última atualização: 13 de setembro de 2026
        </p>

        <section className="space-y-6 text-slate-300 leading-relaxed">
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">1. Tolerância Zero</h2>
            <p>
              O <strong>DM Conecta</strong> adota uma política irrestrita de tolerância zero contra qualquer forma de
              abuso sexual infantil, exploração sexual infantil (CSAE) ou disseminação de material de abuso sexual infantil (CSAM).
              Não é permitida a publicação, compartilhamento, armazenamento ou facilitação de qualquer conteúdo que envolva,
              promova ou sugira dano, abuso ou exploração de crianças e adolescentes.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">2. Mecanismos de Denúncia no Aplicativo</h2>
            <p>
              Disponibilizamos recursos diretos para que usuários possam reportar imediatamente qualquer conteúdo,
              comentário ou comportamento inadequado:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-300 pl-4">
              <li>Opção de denúncia em todas as publicações e perfis da comunidade.</li>
              <li>Canal de emergência para denúncias prioritárias de segurança e moderação.</li>
              <li>Revisão humana acelerada para qualquer alerta relacionado à segurança de menores.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">3. Medidas de Moderação e Resposta</h2>
            <p>
              Ao identificar ou receber denúncia de conteúdo que viole nossas diretrizes de segurança infantil:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-300 pl-4">
              <li>O conteúdo é imediatamente removido da plataforma.</li>
              <li>A conta do infrator é permanentemente banida.</li>
              <li>As informações e evidências são preservadas e encaminhadas às autoridades policiais competentes e entidades de proteção à infância (como SaferNet Brasil, Polícia Federal e NCMEC, conforme aplicável).</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">4. Ponto de Contato Designado</h2>
            <p>
              Designamos um canal direto e prioritário para comunicações de segurança infantil, cooperando ativamente com organizações de proteção e órgãos reguladores:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-300 pl-4">
              <li><strong>E-mail de Contato do Desenvolvedor:</strong>{" "}
                <a href="mailto:sierra.csi@gmail.com" className="text-orange-400 hover:underline">
                  sierra.csi@gmail.com
                </a>
              </li>
              <li><strong>E-mail Institucional:</strong>{" "}
                <a href="mailto:contato@sierratecnologia.com.br" className="text-orange-400 hover:underline">
                  contato@sierratecnologia.com.br
                </a>
              </li>
            </ul>
          </div>
        </section>

        <div className="mt-12 pt-6 border-t border-slate-800">
          <Link href="/feed" className="text-orange-400 hover:text-orange-300 font-medium">
            ← Voltar para o DM Conecta
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
