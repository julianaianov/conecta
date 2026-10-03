"use client";

import React, { useEffect, useRef } from "react";

interface TermosModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TermosModal({ isOpen, onClose }: TermosModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      const t = setTimeout(() => closeBtnRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const handleTocClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const elem = document.getElementById(targetId);
    if (elem && bodyRef.current) {
      bodyRef.current.scrollTo({
        top: elem.offsetTop - 12,
        behavior: "smooth",
      });
    }
  };

  return (
    <div
      className="lg-ov tu-ov"
      id="termosDlg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tuT"
      hidden={!isOpen}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tu-box">
        <header className="tu-h">
          <div>
            <span className="cad-k">Institucional</span>
            <h2 id="tuT">Termos de Uso — DM Conecta</h2>
            <p className="tu-date">Última atualização: 01/10/2026</p>
          </div>
          <button
            type="button"
            className="lg-x tu-x"
            id="termosX"
            aria-label="Fechar"
            onClick={onClose}
            ref={closeBtnRef}
          >
            ×
          </button>
        </header>
        <div className="tu-body" id="tuBody" tabIndex={0} ref={bodyRef}>
      <nav className="tu-toc" aria-label="Sumário dos Termos de Uso"><ol><li><a href="#tu-1" onClick={(e) => handleTocClick(e, "tu-1")
}>Sobre o DM Conecta</a></li><li><a href="#tu-2" onClick={(e) => handleTocClick(e, "tu-2")
}>Definições</a></li><li><a href="#tu-3" onClick={(e) => handleTocClick(e, "tu-3")
}>Cadastro e conta</a></li><li><a href="#tu-4" onClick={(e) => handleTocClick(e, "tu-4")
}>Perfis de usuário</a></li><li><a href="#tu-5" onClick={(e) => handleTocClick(e, "tu-5")
}>Publicação de projetos</a></li><li><a href="#tu-6" onClick={(e) => handleTocClick(e, "tu-6")
}>Responsabilidade pelo conteúdo</a></li><li><a href="#tu-7" onClick={(e) => handleTocClick(e, "tu-7")
}>Conexões</a></li><li><a href="#tu-8" onClick={(e) => handleTocClick(e, "tu-8")
}>Apoio a projetos</a></li><li><a href="#tu-9" onClick={(e) => handleTocClick(e, "tu-9")
}>Inteligência artificial</a></li><li><a href="#tu-10" onClick={(e) => handleTocClick(e, "tu-10")
}>Mapa e localização</a></li><li><a href="#tu-11" onClick={(e) => handleTocClick(e, "tu-11")
}>Fotos, vídeos e documentos</a></li><li><a href="#tu-12" onClick={(e) => handleTocClick(e, "tu-12")
}>Conteúdo proibido</a></li><li><a href="#tu-13" onClick={(e) => handleTocClick(e, "tu-13")
}>Moderação</a></li><li><a href="#tu-14" onClick={(e) => handleTocClick(e, "tu-14")
}>Propriedade intelectual</a></li><li><a href="#tu-15" onClick={(e) => handleTocClick(e, "tu-15")
}>Conteúdo dos usuários</a></li><li><a href="#tu-16" onClick={(e) => handleTocClick(e, "tu-16")
}>Disponibilidade da plataforma</a></li><li><a href="#tu-17" onClick={(e) => handleTocClick(e, "tu-17")
}>Serviços de terceiros</a></li><li><a href="#tu-18" onClick={(e) => handleTocClick(e, "tu-18")
}>Responsabilidade</a></li><li><a href="#tu-19" onClick={(e) => handleTocClick(e, "tu-19")
}>Segurança</a></li><li><a href="#tu-20" onClick={(e) => handleTocClick(e, "tu-20")
}>Encerramento da conta</a></li><li><a href="#tu-21" onClick={(e) => handleTocClick(e, "tu-21")
}>Alterações dos termos</a></li><li><a href="#tu-22" onClick={(e) => handleTocClick(e, "tu-22")
}>Legislação</a></li></ol></nav>
      <div className="tu-txt">
      <p className="tu-lead">Bem-vindo ao DM Conecta.</p>
      <p>Estes Termos de Uso estabelecem as regras para acesso e utilização da plataforma DM Conecta, incluindo seus sites, aplicativos, sistemas e demais interfaces digitais.</p>
      <p>Ao acessar, cadastrar-se ou utilizar a plataforma, o usuário declara que leu e concorda com estes Termos de Uso e com a Política de Privacidade.</p>
      <h3 id="tu-1"><span>01</span>Sobre o DM Conecta</h3>
      <p>O DM Conecta é uma infraestrutura digital de impacto local criada para organizar, conectar e acompanhar projetos e iniciativas de impacto social e ambiental.</p>
      <p>A plataforma busca aproximar diferentes atores, facilitar conexões, organizar informações e acompanhar o desenvolvimento de projetos e seus resultados.</p>
      <p>Entre os participantes da plataforma podem estar:</p>
      <ul>
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
      <p>O DM Conecta funciona como uma infraestrutura de conexão, organização e acompanhamento. A plataforma não substitui as responsabilidades das organizações, empresas, instituições ou órgãos públicos envolvidos em cada iniciativa.</p>
      <h3 id="tu-2"><span>02</span>Definições</h3>
      <p>Para estes Termos:</p>
      <p className="tu-def"><b>Plataforma:</b> ambiente digital do DM Conecta.</p>
      <p className="tu-def"><b>Usuário:</b> pessoa que acessa ou utiliza a plataforma.</p>
      <p className="tu-def"><b>Agente de Transformação:</b> associação, ONG, projeto social, coletivo, liderança comunitária ou outra organização ou pessoa responsável pela apresentação e acompanhamento de uma iniciativa.</p>
      <p className="tu-def"><b>Parceiro:</b> empresa, patrocinador, marca, instituição ou organização interessada em apoiar ou estabelecer conexão com uma iniciativa.</p>
      <p className="tu-def"><b>Poder Público:</b> órgãos, entidades ou representantes do poder público que utilizem a plataforma.</p>
      <p className="tu-def"><b>Membro da Comunidade:</b> pessoa que utiliza a plataforma para acompanhar, apoiar ou participar de iniciativas.</p>
      <p className="tu-def"><b>Projeto:</b> iniciativa social ou ambiental cadastrada na plataforma.</p>
      <p className="tu-def"><b>Conteúdo:</b> textos, imagens, vídeos, documentos, informações e demais materiais publicados pelos usuários.</p>
      <h3 id="tu-3"><span>03</span>Cadastro e conta</h3>
      <p>Algumas funcionalidades poderão exigir cadastro.</p>
      <p>O usuário deverá fornecer informações verdadeiras, completas e atualizadas.</p>
      <p>O usuário é responsável pela utilização de sua conta e pela proteção de suas credenciais de acesso.</p>
      <p>Quando necessário, a plataforma poderá solicitar informações adicionais para validar uma conta, organização ou projeto.</p>
      <p>O processo de validação não significa que todas as informações fornecidas pelo usuário sejam automaticamente certificadas pelo DM Conecta.</p>
      <h3 id="tu-4"><span>04</span>Perfis de usuário</h3>
      <p>A plataforma poderá oferecer diferentes perfis de utilização.</p>
      <h4>Agente de Transformação</h4>
      <p>Poderá cadastrar projetos, iniciativas, documentos, necessidades, cronogramas, informações e resultados.</p>
      <p>É responsável pela veracidade e legitimidade das informações publicadas.</p>
      <h4>Membro da Comunidade</h4>
      <p>Poderá acompanhar projetos, interagir, demonstrar interesse, apoiar iniciativas e participar das funcionalidades disponibilizadas.</p>
      <h4>Parceiro ou Empresa</h4>
      <p>Poderá encontrar projetos, demonstrar interesse, estabelecer conexões e oferecer diferentes formas de apoio.</p>
      <h4>Poder Público</h4>
      <p>Poderá acompanhar iniciativas, analisar informações, estabelecer conexões e participar de processos relacionados aos projetos.</p>
      <h4>Comunicação</h4>
      <p>Poderá acessar informações disponibilizadas publicamente ou às quais tenha recebido autorização de acesso.</p>
      <h3 id="tu-5"><span>05</span>Publicação de projetos</h3>
      <p>Os usuários poderão publicar projetos e iniciativas de acordo com as funcionalidades disponíveis.</p>
      <p>As publicações poderão conter:</p>
      <ul>
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
      <p>O usuário é responsável por garantir que possui os direitos e autorizações necessários para publicar essas informações.</p>
      <h3 id="tu-6"><span>06</span>Responsabilidade pelo conteúdo</h3>
      <p>O usuário é responsável pelo conteúdo que publicar.</p>
      <p>O DM Conecta não garante que todas as informações fornecidas por usuários sejam verdadeiras, completas ou atualizadas.</p>
      <p>A existência de um projeto na plataforma não significa que o DM Conecta esteja certificando sua legitimidade, viabilidade, qualidade ou resultado.</p>
      <h3 id="tu-7"><span>07</span>Conexões</h3>
      <p>O DM Conecta poderá facilitar conexões entre Agentes de Transformação, empresas, instituições, membros da comunidade e Poder Público.</p>
      <p>Uma conexão realizada pela plataforma não representa garantia de:</p>
      <ul>
      <li>financiamento;</li>
      <li>patrocínio;</li>
      <li>contratação;</li>
      <li>aprovação;</li>
      <li>execução;</li>
      <li>resultado;</li>
      <li>parceria;</li>
      <li>vínculo entre as partes.</li>
      </ul>
      <p>As condições de cada parceria ou apoio deverão ser definidas pelos participantes envolvidos.</p>
      <h3 id="tu-8"><span>08</span>Apoio a projetos</h3>
      <p>Quando disponível, a plataforma poderá permitir diferentes formas de apoio, incluindo:</p>
      <ul>
      <li>apoio financeiro;</li>
      <li>materiais;</li>
      <li>voluntariado;</li>
      <li>serviços;</li>
      <li>divulgação;</li>
      <li>parcerias;</li>
      <li>outras formas de colaboração.</li>
      </ul>
      <p>A participação ou demonstração de interesse não representa obrigação automática de apoio ou financiamento.</p>
      <h3 id="tu-9"><span>09</span>Inteligência artificial</h3>
      <p>O DM Conecta poderá utilizar inteligência artificial para auxiliar na organização e análise das informações.</p>
      <p>A IA poderá:</p>
      <ul>
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
      <p>As sugestões produzidas pela inteligência artificial possuem caráter auxiliar.</p>
      <p><b>A inteligência artificial não substitui a decisão humana.</b></p>
      <p>A decisão final sobre projetos, conexões, apoios, encaminhamentos e demais ações permanece sob responsabilidade das pessoas e instituições envolvidas.</p>
      <h3 id="tu-10"><span>10</span>Mapa e localização</h3>
      <p>A plataforma poderá apresentar projetos e iniciativas em mapas.</p>
      <p>As informações de localização poderão ser apresentadas de maneira aproximada ou detalhada, conforme a funcionalidade utilizada.</p>
      <p>O usuário deverá evitar publicar informações de localização de terceiros que possam comprometer sua privacidade ou segurança.</p>
      <h3 id="tu-11"><span>11</span>Fotos, vídeos e documentos</h3>
      <p>O usuário que publicar fotos, vídeos ou documentos deverá possuir autorização ou fundamento adequado para sua utilização.</p>
      <p>O usuário deverá evitar a publicação desnecessária de informações pessoais de terceiros.</p>
      <p>Documentos poderão possuir diferentes níveis de acesso conforme a finalidade e as funcionalidades da plataforma.</p>
      <h3 id="tu-12"><span>12</span>Conteúdo proibido</h3>
      <p>É proibida a utilização da plataforma para:</p>
      <ul>
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
      <h3 id="tu-13"><span>13</span>Moderação</h3>
      <p>O DM Conecta poderá analisar conteúdos denunciados ou identificados como incompatíveis com estes Termos.</p>
      <p>Quando necessário, poderá:</p>
      <ul>
      <li>solicitar esclarecimentos;</li>
      <li>solicitar correções;</li>
      <li>restringir conteúdos;</li>
      <li>remover conteúdos;</li>
      <li>suspender funcionalidades;</li>
      <li>suspender contas;</li>
      <li>encerrar contas.</li>
      </ul>
      <p>Sempre que adequado, o usuário poderá ser informado sobre a medida adotada.</p>
      <h3 id="tu-14"><span>14</span>Propriedade intelectual</h3>
      <p>A marca, identidade visual, interface, código, estrutura, funcionalidades, elementos gráficos e demais componentes próprios do DM Conecta são protegidos pela legislação aplicável.</p>
      <p>O uso da plataforma não transfere ao usuário qualquer direito de propriedade sobre esses elementos.</p>
      <h3 id="tu-15"><span>15</span>Conteúdo dos usuários</h3>
      <p>O usuário permanece titular dos direitos que possuir sobre seus conteúdos.</p>
      <p>Ao publicar um conteúdo, o usuário autoriza o DM Conecta a armazená-lo, processá-lo, organizá-lo e disponibilizá-lo dentro da plataforma conforme a finalidade da publicação e as configurações de acesso.</p>
      <p>Essa autorização não significa transferência de propriedade intelectual do conteúdo.</p>
      <h3 id="tu-16"><span>16</span>Disponibilidade da plataforma</h3>
      <p>O DM Conecta buscará manter seus serviços disponíveis, mas não garante funcionamento ininterrupto.</p>
      <p>A plataforma poderá ficar temporariamente indisponível por motivos como:</p>
      <ul>
      <li>manutenção;</li>
      <li>atualizações;</li>
      <li>falhas técnicas;</li>
      <li>problemas de infraestrutura;</li>
      <li>indisponibilidade de serviços de terceiros;</li>
      <li>incidentes de segurança;</li>
      <li>eventos fora do controle da plataforma.</li>
      </ul>
      <h3 id="tu-17"><span>17</span>Serviços de terceiros</h3>
      <p>A plataforma poderá utilizar serviços tecnológicos de terceiros, como:</p>
      <ul>
      <li>hospedagem;</li>
      <li>armazenamento;</li>
      <li>mapas;</li>
      <li>autenticação;</li>
      <li>comunicação;</li>
      <li>análise;</li>
      <li>inteligência artificial;</li>
      <li>outros serviços necessários ao funcionamento da plataforma.</li>
      </ul>
      <p>Esses serviços poderão possuir suas próprias condições de utilização e políticas.</p>
      <h3 id="tu-18"><span>18</span>Responsabilidade</h3>
      <p>O DM Conecta atua como infraestrutura digital de organização, conexão e acompanhamento.</p>
      <p>A plataforma não é responsável pela execução de projetos de terceiros, pela veracidade absoluta das informações fornecidas pelos usuários ou pelo cumprimento de acordos realizados diretamente entre participantes.</p>
      <p>Também não garante que uma iniciativa receberá apoio, financiamento, patrocínio ou execução.</p>
      <p>Isso não limita responsabilidades que não possam ser afastadas pela legislação aplicável.</p>
      <h3 id="tu-19"><span>19</span>Segurança</h3>
      <p>O DM Conecta adotará medidas técnicas e administrativas destinadas a proteger a plataforma e as informações tratadas.</p>
      <p>Nenhum ambiente digital pode ser considerado completamente livre de riscos.</p>
      <p>Em caso de incidentes relevantes, serão adotadas as providências aplicáveis.</p>
      <h3 id="tu-20"><span>20</span>Encerramento da conta</h3>
      <p>O usuário poderá solicitar o encerramento de sua conta.</p>
      <p>O encerramento não implica necessariamente a eliminação imediata de todas as informações, especialmente quando houver obrigação legal ou outra justificativa legítima para sua conservação.</p>
      <h3 id="tu-21"><span>21</span>Alterações dos termos</h3>
      <p>Estes Termos poderão ser atualizados para refletir mudanças na plataforma, nas funcionalidades ou na legislação.</p>
      <p>A versão mais recente estará disponível na plataforma.</p>
      <h3 id="tu-22"><span>22</span>Legislação</h3>
      <p>Estes Termos serão interpretados de acordo com as leis da República Federativa do Brasil.</p>
      <p className="tu-date">Última atualização: 01/10/2026</p>
      </div>
    </div>
  </div>
</div>

  );
}
