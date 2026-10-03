import React from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { metadataForPage } from "@/lib/seo/site";
import { CONSENT_DOCUMENTS, PRIVACY_PATH } from "@/lib/app/privacy";

export const metadata = metadataForPage({
  title: "Termos de Uso — DM Conecta",
  description: "Regras de uso da plataforma DM Conecta: perfis, publicação de projetos, apoio, moderação e governança.",
  path: "/termos-de-uso",
});

const TERMS = CONSENT_DOCUMENTS.find((doc) => doc.key === "termos_de_uso")!;

/**
 * Termos de Uso (T24).
 * Atualizado em 01/10/2026 (Versão 1.1).
 */
export default function TermosDeUsoPage() {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-900 text-slate-100">
      <Navbar />
      <main className="mx-auto max-w-4xl flex-1 px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-emerald-400 md:text-4xl">Termos de Uso — DM Conecta</h1>
        <p className="mb-8 text-sm text-slate-400">Versão {TERMS.version} · Última atualização: 01/10/2026</p>

        <section className="space-y-6 leading-relaxed text-slate-300">
          <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4 text-slate-200">
            <p className="font-medium text-white mb-2">Bem-vindo ao DM Conecta.</p>
            <p className="mb-2">
              Estes Termos de Uso estabelecem as regras para acesso e utilização da plataforma DM Conecta,
              incluindo seus sites, aplicativos, sistemas e demais interfaces digitais.
            </p>
            <p>
              Ao acessar, cadastrar-se ou utilizar a plataforma, o usuário declara que leu e concorda com estes
              Termos de Uso e com a{" "}
              <Link href="/politica-de-privacidade" className="text-emerald-400 hover:underline">
                Política de Privacidade
              </Link>.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">1. SOBRE O DM CONECTA</h2>
            <p>
              O DM Conecta é uma infraestrutura digital de impacto local criada para organizar, conectar e
              acompanhar projetos e iniciativas de impacto social e ambiental.
            </p>
            <p className="mt-2">
              A plataforma busca aproximar diferentes atores, facilitar conexões, organizar informações e
              acompanhar o desenvolvimento de projetos e seus resultados.
            </p>
            <p className="mt-2">Entre os participantes da plataforma podem estar:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4 text-slate-300">
              <li>Agentes de Transformação;</li>
              <li>associações;</li>
              <li>ONGs;</li>
              <li>projetos sociais;</li>
              <li>coletivos;</li>
              <li>lideranças comunitárias;</li>
              <li>empresas;</li>
              <li>patrocinadores;</li>
              <li>marcas;</li>
              <li>instituições;</li>
              <li>Poder Público;</li>
              <li>membros da comunidade;</li>
              <li>profissionais e organizações de comunicação.</li>
            </ul>
            <p className="mt-3">
              O DM Conecta funciona como uma infraestrutura de conexão, organização e acompanhamento. A
              plataforma não substitui as responsabilidades das organizações, empresas, instituições ou órgãos
              públicos envolvidos em cada iniciativa.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">2. DEFINIÇÕES</h2>
            <p className="mb-2">Para estes Termos:</p>
            <ul className="space-y-2 pl-2">
              <li>
                <strong className="text-white">Plataforma:</strong> ambiente digital do DM Conecta.
              </li>
              <li>
                <strong className="text-white">Usuário:</strong> pessoa que acessa ou utiliza a plataforma.
              </li>
              <li>
                <strong className="text-white">Agente de Transformação:</strong> associação, ONG, projeto social,
                coletivo, liderança comunitária ou outra organização ou pessoa responsável pela apresentação e
                acompanhamento de uma iniciativa.
              </li>
              <li>
                <strong className="text-white">Parceiro:</strong> empresa, patrocinador, marca, instituição ou
                organização interessada em apoiar ou estabelecer conexão com uma iniciativa.
              </li>
              <li>
                <strong className="text-white">Poder Público:</strong> órgãos, entidades ou representantes do poder
                público que utilizem a plataforma.
              </li>
              <li>
                <strong className="text-white">Membro da Comunidade:</strong> pessoa que utiliza a plataforma para
                acompanhar, apoiar ou participar de iniciativas.
              </li>
              <li>
                <strong className="text-white">Projeto:</strong> iniciativa social ou ambiental cadastrada na
                plataforma.
              </li>
              <li>
                <strong className="text-white">Conteúdo:</strong> textos, imagens, vídeos, documentos, informações e
                demais materiais publicados pelos usuários.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">3. CADASTRO E CONTA</h2>
            <p>Algumas funcionalidades poderão exigir cadastro.</p>
            <p className="mt-2">O usuário deverá fornecer informações verdadeiras, completas e atualizadas.</p>
            <p className="mt-2">
              O usuário é responsável pela utilização de sua conta e pela proteção de suas credenciais de acesso.
            </p>
            <p className="mt-2">
              Quando necessário, a plataforma poderá solicitar informações adicionais para validar uma conta,
              organização ou projeto.
            </p>
            <p className="mt-2">
              O processo de validação não significa que todas as informações fornecidas pelo usuário sejam
              automaticamente certificadas pelo DM Conecta.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-semibold text-white">4. PERFIS DE USUÁRIO</h2>
            <p className="mb-4">A plataforma poderá oferecer diferentes perfis de utilização.</p>
            <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-800/20 p-4">
              <div>
                <h3 className="text-lg font-medium text-emerald-400">Agente de Transformação</h3>
                <p className="mt-1">
                  Poderá cadastrar projetos, iniciativas, documentos, necessidades, cronogramas, informações e
                  resultados.
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  É responsável pela veracidade e legitimidade das informações publicadas.
                </p>
              </div>

              <div className="border-t border-slate-800/80 pt-3">
                <h3 className="text-lg font-medium text-emerald-400">Membro da Comunidade</h3>
                <p className="mt-1">
                  Poderá acompanhar projetos, interagir, demonstrar interesse, apoiar iniciativas e participar das
                  funcionalidades disponibilizadas.
                </p>
              </div>

              <div className="border-t border-slate-800/80 pt-3">
                <h3 className="text-lg font-medium text-emerald-400">Parceiro ou Empresa</h3>
                <p className="mt-1">
                  Poderá encontrar projetos, demonstrar interesse, estabelecer conexões e oferecer diferentes formas
                  de apoio.
                </p>
              </div>

              <div className="border-t border-slate-800/80 pt-3">
                <h3 className="text-lg font-medium text-emerald-400">Poder Público</h3>
                <p className="mt-1">
                  Poderá acompanhar iniciativas, analisar informações, estabelecer conexões e participar de
                  processos relacionados aos projetos.
                </p>
              </div>

              <div className="border-t border-slate-800/80 pt-3">
                <h3 className="text-lg font-medium text-emerald-400">Comunicação</h3>
                <p className="mt-1">
                  Poderá acessar informações disponibilizadas publicamente ou às quais tenha recebido autorização de
                  acesso.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">5. PUBLICAÇÃO DE PROJETOS</h2>
            <p>
              Os usuários poderão publicar projetos e iniciativas de acordo com as funcionalidades disponíveis.
            </p>
            <p className="mt-2">As publicações poderão conter:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4 text-slate-300">
              <li>descrição do projeto;</li>
              <li>objetivos;</li>
              <li>localização;</li>
              <li>fotografias;</li>
              <li>vídeos;</li>
              <li>documentos;</li>
              <li>orçamento;</li>
              <li>cronograma;</li>
              <li>público beneficiado;</li>
              <li>indicadores;</li>
              <li>resultados;</li>
              <li>registros de execução.</li>
            </ul>
            <p className="mt-3">
              O usuário é responsável por garantir que possui os direitos e autorizações necessários para publicar
              essas informações.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">6. RESPONSABILIDADE PELO CONTEÚDO</h2>
            <p>O usuário é responsável pelo conteúdo que publicar.</p>
            <p className="mt-2">
              O DM Conecta não garante que todas as informações fornecidas por usuários sejam verdadeiras,
              completas ou atualizadas.
            </p>
            <p className="mt-2">
              A existência de um projeto na plataforma não significa que o DM Conecta esteja certificando sua
              legitimidade, viabilidade, qualidade ou resultado.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">7. CONEXÕES</h2>
            <p>
              O DM Conecta poderá facilitar conexões entre Agentes de Transformação, empresas, instituições,
              membros da comunidade e Poder Público.
            </p>
            <p className="mt-2">Uma conexão realizada pela plataforma não representa garantia de:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4 text-slate-300">
              <li>financiamento;</li>
              <li>patrocínio;</li>
              <li>contratação;</li>
              <li>aprovação;</li>
              <li>execução;</li>
              <li>resultado;</li>
              <li>parceria;</li>
              <li>vínculo entre as partes.</li>
            </ul>
            <p className="mt-3">
              As condições de cada parceria ou apoio deverão ser definidas pelos participantes envolvidos.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">8. APOIO A PROJETOS</h2>
            <p>Quando disponível, a plataforma poderá permitir diferentes formas de apoio, incluindo:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4 text-slate-300">
              <li>apoio financeiro;</li>
              <li>materiais;</li>
              <li>voluntariado;</li>
              <li>serviços;</li>
              <li>divulgação;</li>
              <li>parcerias;</li>
              <li>outras formas de colaboração.</li>
            </ul>
            <p className="mt-3">
              A participação ou demonstração de interesse não representa obrigação automática de apoio ou
              financiamento.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">9. INTELIGÊNCIA ARTIFICIAL</h2>
            <p>
              O DM Conecta poderá utilizar inteligência artificial para auxiliar na organização e análise das
              informações.
            </p>
            <p className="mt-2">A IA poderá:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4 text-slate-300">
              <li>identificar possíveis conexões;</li>
              <li>sugerir parceiros;</li>
              <li>encontrar projetos semelhantes;</li>
              <li>organizar informações;</li>
              <li>auxiliar na elaboração de dossiês;</li>
              <li>identificar informações faltantes;</li>
              <li>apoiar análises;</li>
              <li>auxiliar na geração de indicadores;</li>
              <li>apoiar a comunicação;</li>
              <li>auxiliar usuários e gestores.</li>
            </ul>
            <p className="mt-3">As sugestões produzidas pela inteligência artificial possuem caráter auxiliar.</p>
            <p className="mt-2">A inteligência artificial não substitui a decisão humana.</p>
            <p className="mt-2">
              A decisão final sobre projetos, conexões, apoios, encaminhamentos e demais ações permanece sob
              responsabilidade das pessoas e instituições envolvidas.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">10. MAPA E LOCALIZAÇÃO</h2>
            <p>A plataforma poderá apresentar projetos e iniciativas em mapas.</p>
            <p className="mt-2">
              As informações de localização poderão ser apresentadas de maneira aproximada ou detalhada, conforme
              a funcionalidade utilizada.
            </p>
            <p className="mt-2">
              O usuário deverá evitar publicar informações de localização de terceiros que possam comprometer sua
              privacidade ou segurança.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">11. FOTOS, VÍDEOS E DOCUMENTOS</h2>
            <p>
              O usuário que publicar fotos, vídeos ou documentos deverá possuir autorização ou fundamento adequado
              para sua utilização.
            </p>
            <p className="mt-2">
              O usuário deverá evitar a publicação desnecessária de informações pessoais de terceiros.
            </p>
            <p className="mt-2">
              Documentos poderão possuir diferentes níveis de acesso conforme a finalidade e as funcionalidades da
              plataforma.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">12. CONTEÚDO PROIBIDO</h2>
            <p>É proibida a utilização da plataforma para:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4 text-slate-300">
              <li>publicar informações deliberadamente falsas;</li>
              <li>praticar fraude;</li>
              <li>falsificar documentos;</li>
              <li>apresentar resultados inexistentes;</li>
              <li>violar direitos autorais;</li>
              <li>expor indevidamente dados pessoais;</li>
              <li>ameaçar ou assediar pessoas;</li>
              <li>praticar discriminação;</li>
              <li>promover violência;</li>
              <li>inserir códigos maliciosos;</li>
              <li>tentar acessar contas ou sistemas sem autorização;</li>
              <li>praticar atividades ilícitas;</li>
              <li>utilizar a plataforma para finalidades incompatíveis com sua proposta.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">13. MODERAÇÃO</h2>
            <p>
              O DM Conecta poderá analisar conteúdos denunciados ou identificados como incompatíveis com estes
              Termos.
            </p>
            <p className="mt-2">Quando necessário, poderá:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4 text-slate-300">
              <li>solicitar esclarecimentos;</li>
              <li>solicitar correções;</li>
              <li>restringir conteúdos;</li>
              <li>remover conteúdos;</li>
              <li>suspender funcionalidades;</li>
              <li>suspender contas;</li>
              <li>encerrar contas.</li>
            </ul>
            <p className="mt-3">Sempre que adequado, o usuário poderá ser informado sobre a medida adotada.</p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">14. PROPRIEDADE INTELECTUAL</h2>
            <p>
              A marca, identidade visual, interface, código, estrutura, funcionalidades, elementos gráficos e
              demais componentes próprios do DM Conecta são protegidos pela legislação aplicável.
            </p>
            <p className="mt-2">
              O uso da plataforma não transfere ao usuário qualquer direito de propriedade sobre esses elementos.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">15. CONTEÚDO DOS USUÁRIOS</h2>
            <p>O usuário permanece titular dos direitos que possuir sobre seus conteúdos.</p>
            <p className="mt-2">
              Ao publicar um conteúdo, o usuário autoriza o DM Conecta a armazená-lo, processá-lo, organizá-lo e
              disponibilizá-lo dentro da plataforma conforme a finalidade da publicação e as configurações de
              acesso.
            </p>
            <p className="mt-2">
              Essa autorização não significa transferência de propriedade intelectual do conteúdo.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">16. DISPONIBILIDADE DA PLATAFORMA</h2>
            <p>
              O DM Conecta buscará manter seus serviços disponíveis, mas não garante funcionamento ininterrupto.
            </p>
            <p className="mt-2">A plataforma poderá ficar temporariamente indisponível por motivos como:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4 text-slate-300">
              <li>manutenção;</li>
              <li>atualizações;</li>
              <li>falhas técnicas;</li>
              <li>problemas de infraestrutura;</li>
              <li>indisponibilidade de serviços de terceiros;</li>
              <li>incidentes de segurança;</li>
              <li>eventos fora do controle da plataforma.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">17. SERVIÇOS DE TERCEIROS</h2>
            <p>A plataforma poderá utilizar serviços tecnológicos de terceiros, como:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 pl-4 text-slate-300">
              <li>hospedagem;</li>
              <li>armazenamento;</li>
              <li>mapas;</li>
              <li>autenticação;</li>
              <li>comunicação;</li>
              <li>análise;</li>
              <li>inteligência artificial;</li>
              <li>outros serviços necessários ao funcionamento da plataforma.</li>
            </ul>
            <p className="mt-3">Esses serviços poderão possuir suas próprias condições de utilização e políticas.</p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">18. RESPONSABILIDADE</h2>
            <p>O DM Conecta atua como infraestrutura digital de organização, conexão e acompanhamento.</p>
            <p className="mt-2">
              A plataforma não é responsável pela execução de projetos de terceiros, pela veracidade absoluta das
              informações fornecidas pelos usuários ou pelo cumprimento de acordos realizados diretamente entre
              participantes.
            </p>
            <p className="mt-2">
              Também não garante que uma iniciativa receberá apoio, financiamento, patrocínio ou execução.
            </p>
            <p className="mt-2">
              Isso não limita responsabilidades que não possam ser afastadas pela legislação aplicável.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">19. SEGURANÇA</h2>
            <p>
              O DM Conecta adotará medidas técnicas e administrativas destinadas a proteger a plataforma e as
              informações tratadas.
            </p>
            <p className="mt-2">Nenhum ambiente digital pode ser considerado completamente livre de riscos.</p>
            <p className="mt-2">Em caso de incidentes relevantes, serão adotadas as providências aplicáveis.</p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">20. ENCERRAMENTO DA CONTA</h2>
            <p>
              O usuário poderá solicitar o encerramento de sua conta através das configurações de{" "}
              <Link href={PRIVACY_PATH} className="text-emerald-400 hover:underline">
                Privacidade
              </Link>.
            </p>
            <p className="mt-2">
              O encerramento não implica necessariamente a eliminação imediata de todas as informações,
              especialmente quando houver obrigação legal ou outra justificativa legítima para sua conservação.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">21. ALTERAÇÕES DOS TERMOS</h2>
            <p>
              Estes Termos poderão ser atualizados para refletir mudanças na plataforma, nas funcionalidades ou na
              legislação.
            </p>
            <p className="mt-2">A versão mais recente estará disponível na plataforma.</p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-semibold text-white">22. LEGISLAÇÃO</h2>
            <p>Estes Termos serão interpretados de acordo com as leis da República Federativa do Brasil.</p>
          </div>
        </section>

        <div className="mt-12 flex flex-col sm:flex-row items-start sm:items-center justify-between border-t border-slate-800 pt-6 gap-4">
          <Link href="/feed" className="font-medium text-emerald-400 hover:text-emerald-300">
            ← Voltar para o DM Conecta
          </Link>
          <span className="text-xs text-slate-500">
            Última atualização: 01/10/2026
          </span>
        </div>
      </main>
      <Footer />
    </div>
  );
}
