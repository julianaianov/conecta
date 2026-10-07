"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

interface Role {
  key: string;
  icon: string;
  tag: string;
  title: string;
  photo: string;
  photoAlt: string;
  summary: React.ReactNode;
  who: string[];
  does: string[];
  /** Perfil pré-selecionado em `/register`. */
  register: string;
  cta: string;
}

// Arquitetura de Perfis §3: quem são e o que fazem na plataforma.
const ROLES: Role[] = [
  {
    key: "agentes",
    icon: "i-people",
    tag: "Realizadores",
    title: "Agentes de Transformação",
    photo: "/images/landing/quem-agentes.webp",
    photoAlt: "Agente de Transformação com colete e tablet em frente a um espaço comunitário ao entardecer",
    summary: <>Apresentam, <b>estruturam</b>, <b>executam</b> e atualizam projetos de impacto.</>,
    who: ["Associação", "ONG", "Instituto", "Coletivo", "Projeto social", "Organização comunitária", "Iniciativa socioambiental"],
    does: [
      "Criar e gerenciar o perfil da organização",
      "Cadastrar projetos e apresentar iniciativas",
      "Informar objetivos, público beneficiado e território",
      "Estruturar orçamento e apresentar cronograma",
      "Receber sugestões e solicitações de conexão",
      "Conversar com parceiros e formalizar apoios",
      "Registrar execução, evidências e atualizações",
      "Apresentar resultados e indicadores de impacto",
    ],
    register: "agent",
    cta: "Cadastrar projeto",
  },
  {
    key: "parceiros",
    icon: "i-brief",
    tag: "Apoiadores",
    title: "Parceiros",
    photo: "/images/landing/quem-parceiros.webp",
    photoAlt: "Representante de empresa e integrante de um instituto apertam as mãos em uma sala de reunião",
    summary: <><b>Apoiam</b> projetos com recursos, conhecimento, infraestrutura, divulgação ou parcerias.</>,
    who: ["Empresas", "Marcas", "Institutos", "Patrocinadores", "Organizações", "Investidores e financiadores (futuramente)"],
    does: [
      "Criar perfil institucional com causas e territórios de interesse",
      "Visualizar projetos por eixo, território, público e orçamento",
      "Receber sugestões de projetos compatíveis",
      "Demonstrar interesse e solicitar conexão",
      "Formalizar apoio",
      "Acompanhar execução, evidências e resultados",
      "Participar do reconhecimento de apoiadores",
    ],
    register: "partner",
    cta: "Quero apoiar",
  },
  {
    key: "poder-publico",
    icon: "i-gov",
    tag: "Articulação",
    title: "Poder Público",
    photo: "/images/landing/quem-poder-publico.webp",
    photoAlt: "Reunião em uma secretaria municipal, com mapa do território sobre a mesa",
    summary: <><b>Articula</b>, participa e apoia projetos de interesse público, dentro de sua competência.</>,
    who: ["Prefeituras", "Secretarias", "Órgãos públicos", "Instituições governamentais"],
    does: [
      "Criar perfil institucional",
      "Visualizar mapa de projetos e iniciativas",
      "Acompanhar iniciativas de interesse público",
      "Solicitar conexão",
      "Participar e apoiar projetos",
      "Divulgar programas, editais e oportunidades",
      "Integrar projetos a políticas públicas",
      "Acompanhar indicadores e resultados",
    ],
    register: "government",
    cta: "Acessar como gestor",
  },
  {
    key: "comunidade",
    icon: "i-heart",
    tag: "Participantes",
    title: "Comunidade",
    photo: "/images/landing/quem-comunidade.webp",
    photoAlt: "Voluntários recolhem resíduos em uma praia ao amanhecer",
    summary: <>Conhece, <b>participa</b>, apoia, divulga e acompanha os projetos do território.</>,
    who: ["Pessoas interessadas", "Voluntários", "Jovens", "Participantes"],
    does: [
      "Criar perfil",
      "Conhecer projetos por eixo de impacto e território",
      "Demonstrar interesse em participar",
      "Oferecer voluntariado",
      "Apoiar projetos",
      "Divulgar e compartilhar iniciativas",
      "Inscrever-se em atividades e eventos dos projetos",
      "Acompanhar resultados",
    ],
    register: "member",
    cta: "Quero participar",
  },
  {
    key: "comunicacao",
    icon: "i-mega",
    tag: "Amplificação",
    title: "Comunicação",
    photo: "/images/landing/quem-comunicacao.webp",
    photoAlt: "Cinegrafista registra uma entrevista em um evento comunitário",
    summary: <><b>Amplia a visibilidade</b> dos projetos e de seus resultados.</>,
    who: ["Veículos de comunicação", "Jornalistas", "Produtores e criadores de conteúdo", "Agentes de comunicação"],
    does: [
      "Criar perfil profissional ou institucional",
      "Visualizar projetos e resultados",
      "Solicitar conexão",
      "Identificar pautas de impacto",
      "Compartilhar iniciativas",
      "Divulgar projetos e resultados",
      "Acompanhar informações públicas dos projetos",
    ],
    register: "media",
    cta: "Acompanhar projetos",
  },
];

export function Stakeholders() {
  const [open, setOpen] = useState(-1);
  // Ordem do painel aberto: logo depois do último cartão da linha do cartão escolhido.
  const [panelOrder, setPanelOrder] = useState(1);
  const grid = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const place = useCallback((index: number) => {
    const el = grid.current;
    if (!el || index < 0) return;
    const columns = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    const lastInRow = Math.min(ROLES.length - 1, (Math.floor(index / columns) + 1) * columns - 1);
    setPanelOrder(lastInRow * 2 + 1);
  }, []);

  useEffect(() => {
    if (open < 0) return;
    const onResize = () => place(open);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, place]);

  const toggle = (index: number) => {
    const next = open === index ? -1 : index;
    setOpen(next);
    place(next);
  };

  const close = () => {
    const previous = open;
    setOpen(-1);
    if (previous >= 0) buttons.current[previous]?.focus();
  };

  return (
    <section className="sec cx-sec qx-sec" id="para-quem">
      <div className="wrap">
        <div className="qx-hero">
          <div className="qx-ht">
            <span className="eyebrow"><i className="eb-n" aria-hidden="true">02</i>Quem participa</span>
            <h2 className="h2">Quem participa do <span className="hl">DM Conecta?</span></h2>
            <p className="lede">Diferentes atores se conectam para transformar projetos sociais e ambientais em ações e resultados concretos.</p>
          </div>
        </div>

        <div className="qx-grid" id="qxGrid" ref={grid}>
          {ROLES.map((role, index) => {
            const on = open === index;
            return (
              <article key={role.key} className={on ? "qx-card is-on" : "qx-card"} style={{ "--o": index * 2 } as CSSProperties} id={`qxC${index}`}>
                <figure className="qx-ph">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={role.photo} alt={role.photoAlt} width={960} height={640} loading="lazy" decoding="async" />
                </figure>
                <header>
                  <span className="qx-ic"><svg className="ico" aria-hidden="true"><use href={`#${role.icon}`} /></svg></span>
                  <span className="qx-tag">{role.tag}</span>
                </header>
                <h3>{role.title}</h3>
                <p>{role.summary}</p>
                <button
                  type="button"
                  className="qx-more"
                  aria-expanded={on}
                  aria-controls={`qxD${index}`}
                  ref={(el) => { buttons.current[index] = el; }}
                  onClick={() => toggle(index)}
                >
                  <span>{on ? "Ver menos" : "Saiba mais"}</span>
                  <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg>
                </button>
              </article>
            );
          })}

          {ROLES.map((role, index) => (
            <div
              key={role.key}
              className="qx-d"
              id={`qxD${index}`}
              style={{ "--o": open === index ? panelOrder : index * 2 + 1 } as CSSProperties}
              role="region"
              aria-label={`${role.title}: papel na plataforma`}
              hidden={open !== index}
            >
              <div className="qx-dw">
                <h4>Quem são</h4>
                <ul className="qx-chips">
                  {role.who.map((item) => <li key={item}>{item}</li>)}
                </ul>
                {role.key === "parceiros" ? (
                  <p className="qx-lk"><a href="#apoio">Ver as formas de apoiar <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></a></p>
                ) : null}
              </div>
              <div className="qx-dm">
                <h4>O que fazem na plataforma</h4>
                <ul className="qx-list">
                  {role.does.map((item) => <li key={item}>{item}</li>)}
                </ul>
                {role.key === "comunidade" ? (
                  <p className="qx-note">
                    <svg className="ico" aria-hidden="true"><use href="#i-shield" /></svg>
                    Membros da comunidade não cadastram projetos em nome de uma organização sem vínculo ou autorização.
                  </p>
                ) : null}
              </div>
              <div className="qx-dc">
                <Link className="btn btn-primary" href={`/register?perfil=${role.register}`}>{role.cta} <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></Link>
                <button type="button" className="qx-x" onClick={close}>Fechar</button>
              </div>
            </div>
          ))}
        </div>

        <p className="qx-iln"><svg className="ico" aria-hidden="true"><use href="#i-camera" /></svg>Imagens ilustrativas.</p>
        <div className="qx-end" id="conexao">
          <span className="qx-ek" aria-hidden="true"><i /><i /><i /></span>
          <p className="qx-q">Quando diferentes atores se conectam, projetos ganham força para <em>gerar impacto.</em></p>
          <a className="btn btn-primary" href="#participar">Encontre seu papel <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></a>
        </div>
      </div>
    </section>
  );
}
