import React from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { metadataForPage } from "@/lib/seo/site";
import { CONSENT_DOCUMENTS, PRIVACY_PATH } from "@/lib/app/privacy";

export const metadata = metadataForPage({
  title: "Termos de Uso — DM Conecta",
  description: "Regras de uso do DM Conecta: quem pode publicar, como a demanda é validada, apoio, moderação e governança.",
  path: "/termos-de-uso",
});

const TERMS = CONSENT_DOCUMENTS.find((doc) => doc.key === "termos_de_uso")!;

/**
 * Termos de Uso (T24). O texto **descreve o que a plataforma faz hoje** —
 * categorias e permissões, validação institucional, estrutura da demanda,
 * apoio como valor declarado, rankings, moderação e governança —, derivado da
 * fonte da verdade do produto (Apresentação Institucional e os dois fluxos de
 * cadastro). O que ainda não existe aparece como "em desenvolvimento".
 *
 * Mudança de regra sobe a versão em `src/lib/app/privacy.ts` e em
 * `services/auth-service/src/consents.js`, e todo titular passa a ter aceite
 * pendente.
 */
export default function TermosDeUsoPage() {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-900 text-slate-100">
      <Navbar />
      <main className="mx-auto max-w-4xl flex-1 px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-emerald-400 md:text-4xl">Termos de Uso — DM Conecta</h1>
        <p className="mb-8 text-sm text-slate-400">Versão {TERMS.version} · de {TERMS.date}</p>

        <section className="space-y-6 leading-relaxed text-slate-300">
          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">1. O que é o DM Conecta</h2>
            <p>
              O DM Conecta é uma plataforma de impacto local: moradores, agentes de transformação, parceiros,
              poder público e comunicação registram demandas do território, se conectam e acompanham a execução e
              os resultados. A plataforma <strong>conecta e dá transparência</strong>; ela não executa obras, não
              intermedeia contratos e não é parte nos acordos firmados entre quem pede e quem apoia.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">2. Conta e categorias</h2>
            <p>
              Para usar as funções de publicação, apoio e conexão é preciso criar uma conta, escolhendo uma das
              cinco categorias — Agente de Transformação, Membro da Comunidade, Parceiro, Poder Público e
              Comunicação — e o perfil dentro dela. Cada categoria tem permissões próprias, que a plataforma
              aplica também no servidor.
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4">
              <li>Você é responsável pelos dados que informa e por mantê-los corretos.</li>
              <li>A conta é pessoal: não compartilhe a sua senha.</li>
              <li>
                Membros da Comunidade não publicam demandas ou projetos em nome de organização ou comunidade sem
                vínculo ou autorização.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">3. Cadastro institucional e validação</h2>
            <p>
              Agente de Transformação e Poder Público preenchem um cadastro institucional (CNPJ e CNAE para o
              Agente; órgão, CNPJ, esfera, território, secretaria e competências para o Poder Público, com
              representante identificado). <strong>O acesso às ações institucionais — publicar demanda, responder,
              encaminhar e apoiar oficialmente — só é liberado depois da validação</strong> feita pela equipe. A
              plataforma registra cada passo dessa validação.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">4. Demandas e publicações</h2>
            <p>
              A demanda é estruturada pelo Agente validado e exige fotografia, localização com CEP, território,
              descrição, objetivo, justificativa, público beneficiado, prioridade, orçamento detalhado e
              cronograma. O sistema acrescenta automaticamente 4% para o Agente e 6% para a plataforma sobre o
              valor original, somados ao total, e gera o Dossiê da Demanda. Demanda publicada passa por análise e
              entra numa linha do tempo pública.
            </p>
            <p className="mt-2">
              Publicações, demandas, evidências e prestação de contas são conteúdo de interesse público:{" "}
              <strong>uma vez publicados, não são excluídos</strong>. A moderação pode ocultar conteúdo que
              infrinja estes termos, e a demanda pode ser arquivada; o registro permanece para auditoria.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">5. Apoio</h2>
            <p>
              O apoio é <strong>declarado pelo apoiador e confirmado pelo Agente</strong> dentro da plataforma.
              A plataforma <strong>não processa pagamento</strong>: quando há valor, ele é informado para fins de
              transparência e combinado diretamente entre as partes. Registrar apoio que não aconteceu, ou valor
              diferente do real, é uso indevido e pode levar à contestação e à suspensão da conta.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">6. Conduta</h2>
            <p>Ao publicar no DM Conecta, você se compromete a não:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4">
              <li>publicar informação falsa, enganosa ou não verificável;</li>
              <li>publicar discurso de ódio, conteúdo impróprio, spam ou dado pessoal de terceiros;</li>
              <li>usar a plataforma para propaganda político-partidária ou campanha eleitoral;</li>
              <li>se passar por outra pessoa, organização ou órgão público;</li>
              <li>coletar dados de outros usuários por raspagem ou automação.</li>
            </ul>
            <p className="mt-2">
              Qualquer conta pode denunciar conteúdo ou perfil. A denúncia é apurada pela equipe; quem foi
              denunciado não sabe quem denunciou, e o denunciante recebe apenas o andamento da apuração.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">7. Rankings e reconhecimento</h2>
            <p>
              Os rankings reconhecem apoio e impacto a partir de dados reais da plataforma. O seu nome só aparece
              com o seu consentimento, que pode ser revogado a qualquer momento — sem consentimento, a sua
              participação continua contando nos números, mas sem identificação. Poder Público e políticos{" "}
              <strong>não entram em ranking competitivo</strong>: para eles valem indicadores de atuação.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">8. Conteúdo que você publica</h2>
            <p>
              O conteúdo continua sendo seu. Ao publicar, você autoriza o DM Conecta a exibi-lo na plataforma e
              nas páginas públicas de demandas, mapa e transparência, e a mantê-lo no histórico da demanda para
              fins de prestação de contas. Publique apenas conteúdo que você pode compartilhar; ao enviar fotos
              com pessoas identificáveis, garanta que houve autorização.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">9. Governança</h2>
            <p>
              A plataforma é <strong>neutra do ponto de vista político-partidário</strong> e atende qualquer
              gestão. O relacionamento com o poder público é baseado em demanda real e em processos transparentes.
              São publicados apenas dados verificáveis, e as funcionalidades ainda em desenvolvimento aparecem
              identificadas como tal.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">10. Em desenvolvimento</h2>
            <p>
              Hoje não estão disponíveis: pagamento dentro da plataforma, recuperação de senha por e-mail e os
              recursos de inteligência artificial previstos no projeto. Onde aparecem na interface, vêm marcados
              como em desenvolvimento.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">11. Encerramento da conta</h2>
            <p>
              Você pode pedir a eliminação da conta a qualquer momento em{" "}
              <Link href={PRIVACY_PATH} className="text-emerald-400 hover:underline">Privacidade</Link>. A conta é
              anonimizada e o que a lei e o interesse público mandam reter permanece sem identificação — a regra,
              dado por dado, está na{" "}
              <Link href="/privacidade" className="text-emerald-400 hover:underline">página de privacidade e dados</Link>.
              A plataforma pode suspender ou encerrar contas que descumpram estes termos, informando o motivo.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">12. Dados pessoais</h2>
            <p>
              O tratamento de dados pessoais segue a LGPD (Lei nº 13.709/2018) e está descrito na{" "}
              <Link href="/politica-de-privacidade" className="text-emerald-400 hover:underline">Política de Privacidade</Link>{" "}
              e na <Link href="/privacidade" className="text-emerald-400 hover:underline">página de privacidade e dados</Link>.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">13. Mudanças nestes termos</h2>
            <p>
              Mudança de regra gera uma versão nova destes termos. Quando isso acontece, a plataforma pede o seu
              aceite outra vez e registra a versão e a data — o aceite anterior continua guardado.
            </p>
          </div>
        </section>

        <div className="mt-12 border-t border-slate-800 pt-6">
          <Link href="/feed" className="font-medium text-emerald-400 hover:text-emerald-300">
            ← Voltar para o DM Conecta
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
