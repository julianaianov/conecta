import React from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { metadataForPage } from "@/lib/seo/site";
import {
  CONSENT_DOCUMENTS, EXPORT_RETENTION_DAYS, PRIVACY_PATH, RESPONSE_DEADLINE_DAYS,
} from "@/lib/app/privacy";

const POLICY = CONSENT_DOCUMENTS.find((doc) => doc.key === "politica_de_privacidade")!;

export const metadata = metadataForPage({
  title: "Política de Privacidade — DM Conecta",
  description: "Política de privacidade e proteção de dados do aplicativo DM Conecta.",
  path: "/politica-de-privacidade",
});

export default function PoliticaPrivacidadePage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-12 flex-1">
        <h1 className="text-3xl md:text-4xl font-bold mb-6 text-emerald-400">
          Política de Privacidade — DM Conecta
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          Versão {POLICY.version} · última atualização: {POLICY.date}
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
              Coletamos apenas as informações estritamente necessárias para o funcionamento do serviço. A lista
              completa, item por item e com a tabela de origem no banco de dados, está na{" "}
              <Link href="/privacidade" className="text-emerald-400 hover:underline">página de privacidade e dados</Link>:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-300 pl-4">
              <li><strong>Dados de Cadastro:</strong> Nome, e-mail e foto de perfil opcional para identificação de autoria nas demandas e conexões.</li>
              <li><strong>Conteúdo registrado:</strong> Demandas, propostas de apoio, atualizações e interações que você opta por registrar no território.</li>
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
              <li><strong>Acesso à Internet:</strong> Necessário para comunicação com o servidor e exibição do pulso do território.</li>
              <li><strong>Câmera / Armazenamento (opcional):</strong> Utilizado caso você decida enviar fotos para ilustrar uma demanda comunitária ou foto de perfil.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">5. Consentimento</h2>
            <p>
              Criar conta exige aceitar estes documentos. Cada aceite é registrado com a{" "}
              <strong>versão do documento, a data e a origem</strong>, e esse registro nunca é alterado nem
              apagado — é a prova de qual texto foi aceito. Quando um documento muda de versão, a plataforma pede
              o aceite outra vez. O registro do consentimento não guarda IP nem identificador de dispositivo.
            </p>
            <p className="mt-2">
              Consentimentos <strong>opcionais</strong> — exibir o seu nome nos rankings públicos e nos apoios que
              você registrou — são dados e revogados a qualquer momento em{" "}
              <Link href={PRIVACY_PATH} className="text-emerald-400 hover:underline">Privacidade</Link>, na sua
              conta. Revogar não muda os números da plataforma: a sua participação continua contando, sem
              identificação.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">6. Seus Direitos (LGPD)</h2>
            <p>
              Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, art. 18), você pode
              solicitar acesso, portabilidade, correção, revogação de consentimento, informação sobre
              compartilhamento e a eliminação da sua conta. Os pedidos são feitos em{" "}
              <Link href={PRIVACY_PATH} className="text-emerald-400 hover:underline">Privacidade</Link>, na sua
              conta: cada um gera um <strong>protocolo</strong> e é respondido em até {RESPONSE_DEADLINE_DAYS}{" "}
              dias corridos (art. 19, II).
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-300 pl-4">
              <li>
                <strong>Acesso e portabilidade:</strong> a plataforma gera na hora um arquivo com tudo o que
                guarda da sua conta e entrega por link temporário; o arquivo some do armazenamento em{" "}
                {EXPORT_RETENTION_DAYS} dias e não inclui dados de outras pessoas.
              </li>
              <li>
                <strong>Correção:</strong> os dados do perfil e do cadastro institucional são corrigidos por você
                mesmo, nas telas de edição.
              </li>
              <li>
                <strong>Eliminação:</strong> a conta é <strong>anonimizada</strong>, não apagada — o que a lei e o
                interesse público mandam reter (demanda publicada, prestação de contas, auditoria) permanece sem
                identificar você. A regra por tipo de dado está na{" "}
                <Link href="/privacidade" className="text-emerald-400 hover:underline">página de privacidade e dados</Link>.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">7. Onde os dados ficam e com quem são compartilhados</h2>
            <p>
              A plataforma roda na Amazon Web Services, na região us-east-2 (Estados Unidos), o que configura{" "}
              <strong>transferência internacional de dados</strong> (LGPD, art. 33); o tráfego passa pela
              Cloudflare. A consulta de CEP usa o ViaCEP e envia apenas o CEP digitado, sem gravar o resultado. A
              equipe de gestão acessa dados pessoais de forma mínima e auditada, para validação institucional,
              moderação e atendimento às solicitações. Não vendemos dados e não os compartilhamos com anunciantes.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">8. Funcionalidades em desenvolvimento</h2>
            <p>
              A plataforma <strong>não processa pagamento</strong> (o apoio financeiro é valor declarado entre as
              partes), a recuperação de senha por e-mail ainda não está disponível e os recursos de inteligência
              artificial previstos no projeto não estão em operação. Onde aparecem na interface, vêm identificados
              como em desenvolvimento.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">9. Contato</h2>
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
