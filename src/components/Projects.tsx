"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

// Eixos de impacto: categorias editoriais e exemplos de tipos de projeto (não são projetos cadastrados).
const AXES = [
  {
    id: "edu",
    title: "Educação",
    icon: "i-book",
    img: "/images/landing/eixo-educacao.webp",
    alt: "Educador orienta jovens em aula de tecnologia com notebooks",
    desc: "Aprendizagem, formação e oportunidades para crianças, jovens, adultos e PCD.",
    tags: ["Reforço escolar", "Capacitação", "Formação profissional", "Inclusão digital", "Oficinas", "Formação de jovens"],
  },
  {
    id: "esp",
    title: "Esporte",
    icon: "i-ball",
    img: "/images/landing/eixo-esporte.webp",
    alt: "Jovens jogam basquete em cadeira de rodas em quadra comunitária",
    desc: "Inclusão, convivência e desenvolvimento por meio da prática esportiva.",
    tags: ["Escolinhas", "Projetos esportivos", "Inclusão pelo esporte", "Competições", "Atividades para crianças e jovens", "Equipamentos e materiais"],
  },
  {
    id: "cul",
    title: "Cultura",
    icon: "i-music",
    img: "/images/landing/eixo-cultura.webp",
    alt: "Jovens e professora em aula de dança em espaço cultural",
    desc: "Expressões artísticas e valorização da cultura local.",
    tags: ["Música", "Dança", "Teatro", "Audiovisual", "Arte", "Oficinas", "Manifestações culturais", "Valorização da cultura local"],
  },
  {
    id: "ani",
    title: "Proteção Animal",
    icon: "i-paw",
    img: "/images/landing/eixo-protecao-animal.webp",
    alt: "Voluntário abraça uma cadela em um abrigo de proteção animal",
    desc: "Cuidado, proteção e bem-estar dos animais.",
    tags: ["Resgate", "Adoção", "Castração", "Bem-estar animal", "Conscientização"],
  },
  {
    id: "amb",
    title: "Meio Ambiente",
    icon: "i-leaf",
    img: "/images/landing/eixo-meio-ambiente.webp",
    alt: "Voluntários recolhendo resíduos na areia durante uma ação ambiental",
    desc: "Preservação, sustentabilidade e iniciativas socioambientais.",
    tags: ["Educação ambiental", "Sustentabilidade", "Reciclagem", "Preservação", "Recuperação ambiental", "Conservação", "Iniciativas socioambientais"],
  },
  {
    id: "sau",
    title: "Saúde e Bem-estar",
    icon: "i-activity",
    img: "/images/landing/eixo-saude.webp",
    alt: "Ação de saúde comunitária com aferição de pressão e atividade física ao ar livre",
    desc: "Prevenção, promoção da saúde e qualidade de vida na comunidade.",
    tags: ["Prevenção", "Promoção da saúde", "Bem-estar", "Saúde comunitária", "Campanhas", "Qualidade de vida"],
  },
  {
    id: "ali",
    title: "Segurança Alimentar",
    icon: "i-meal",
    img: "/images/landing/eixo-seguranca-alimentar.webp",
    alt: "Voluntário entrega cesta básica a uma moradora e sua filha durante distribuição de alimentos",
    desc: "Combate à fome e acesso regular a uma alimentação adequada.",
    tags: ["Distribuição de alimentos", "Cestas básicas", "Cozinhas comunitárias", "Aproveitamento de alimentos", "Hortas comunitárias"],
  },
  {
    id: "rua",
    title: "População em Situação de Rua",
    icon: "i-shelter",
    img: "/images/landing/eixo-populacao-rua.webp",
    alt: "Voluntários servem refeições a pessoas em situação de rua em espaço de acolhimento",
    desc: "Acolhimento, cuidado e inclusão social de pessoas em situação de rua.",
    tags: ["Alimentação", "Higiene", "Documentação", "Saúde", "Capacitação profissional", "Geração de renda", "Acolhimento", "Reinserção social"],
  },
] as const;

const DOSSIER = [
  { icon: "i-target", title: "Identificação", fields: ["Nome", "Categoria", "Descrição", "Objetivo"] },
  { icon: "i-pin", title: "Público e território", fields: ["Público beneficiado", "Território"] },
  { icon: "i-cal", title: "Planejamento", fields: ["Metodologia", "Cronograma", "Orçamento", "Recursos", "Equipe"] },
  { icon: "i-bars", title: "Impacto esperado", fields: ["Indicadores", "Resultados esperados"] },
  { icon: "i-camera", title: "Registros e acompanhamento", fields: ["Fotos", "Vídeos", "Documentos", "Atualizações", "Evidências"] },
] as const;

const SUPPORT_FORMS = [
  { icon: "i-brief", label: "Patrocínio" },
  { icon: "i-target", label: "Investimento social" },
  { icon: "i-heart", label: "Doações financeiras" },
  { icon: "i-box", label: "Doação de materiais e equipamentos" },
  { icon: "i-bulb", label: "Apoio técnico e conhecimento especializado" },
  { icon: "i-park", label: "Cessão de espaço e infraestrutura" },
  { icon: "i-route", label: "Apoio logístico" },
  { icon: "i-people", label: "Voluntariado" },
  { icon: "i-mega", label: "Divulgação" },
  { icon: "i-link", label: "Apoio institucional e parcerias estratégicas" },
] as const;

const VISIBLE_TAGS = 3;

/** Exemplos do eixo: três à vista, o resto sob demanda. */
function AxisTags({ tags }: { tags: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const extra = tags.length - VISIBLE_TAGS;
  return (
    <ul className={open ? "tags open" : "tags"}>
      {tags.map((tag, index) => (
        <li key={tag} className={index >= VISIBLE_TAGS ? "tag-x" : undefined}>{tag}</li>
      ))}
      {extra > 0 ? (
        <li className="tag-more">
          <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? "ver menos" : `+${extra} exemplos`}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

export function Projects() {
  const [fieldsOpen, setFieldsOpen] = useState(false);

  return (
    <section className="sec" id="projetos">
      <div className="wrap">
        <div className="sec-head px-head">
          <span className="eyebrow"><i className="eb-n" aria-hidden="true">04</i>Projetos e apoio</span>
          <h2 className="h2">Projetos de impacto social e ambiental, organizados por eixo.</h2>
          <p className="lede">Cada projeto ganha um dossiê digital com tudo o que um apoiador precisa para conhecê-lo, apoiá-lo e acompanhá-lo.</p>
        </div>

        <div className="dgrid pgrid">
          {AXES.map((axis) => (
            <article key={axis.id} className="dcard pcard" data-ex={axis.id}>
              <div className="dart">
                <Image src={axis.img} alt={axis.alt} width={800} height={450} sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 25vw" />
              </div>
              <div className="dbody">
                <div className="lbl">
                  <span className="px-ic" style={{ "--ex": `var(--c-${axis.id})` } as CSSProperties}>
                    <svg className="ico"><use href={`#${axis.icon}`} /></svg>
                  </span>
                  <h3>{axis.title}</h3>
                </div>
                <p>{axis.desc}</p>
                <AxisTags tags={axis.tags} />
              </div>
            </article>
          ))}
        </div>
        <p className="px-note"><svg className="ico" aria-hidden="true"><use href="#i-camera" /></svg>Imagens ilustrativas, sem relação com projetos reais cadastrados no DM Conecta.</p>

        <div className="px-foot">
          <section className={fieldsOpen ? "dos" : "dos is-min"} aria-labelledby="dosT">
            <header className="dos-h">
              <span className="dos-badge"><svg className="ico" aria-hidden="true"><use href="#i-doc" /></svg></span>
              <div>
                <span className="dos-k">Dossiê digital do projeto</span>
                <h3 id="dosT">O que cada projeto reúne</h3>
              </div>
              <button type="button" className="dos-tg" id="dosTg" aria-expanded={fieldsOpen} onClick={() => setFieldsOpen((value) => !value)}>
                {fieldsOpen ? "Ocultar campos" : "Ver campos"}
              </button>
            </header>
            <ol className="dos-list">
              {DOSSIER.map((group, index) => (
                <li className="dos-i" key={group.title}>
                  <div className="dos-top">
                    <span className="dos-ic"><svg className="ico" aria-hidden="true"><use href={`#${group.icon}`} /></svg></span>
                    <span className="dos-n">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <b>{group.title}</b>
                  <ul>
                    {group.fields.map((field) => <li key={field}>{field}</li>)}
                  </ul>
                </li>
              ))}
            </ol>
          </section>

          <div className="ap2" id="apoio">
            <div className="ap2-t">
              <h3>Formas de apoiar</h3>
              <p>Cada projeto indica o que precisa. Quem apoia escolhe como contribuir.</p>
              <a className="btn btn-primary" href="#contato" data-cad="parceiro">Quero apoiar <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></a>
            </div>
            <ul className="ap2-l">
              {SUPPORT_FORMS.map((form) => (
                <li key={form.label}><svg className="ico"><use href={`#${form.icon}`} /></svg>{form.label}</li>
              ))}
            </ul>
          </div>
          <p className="px-more"><svg className="ico" aria-hidden="true"><use href="#i-spark" /></svg>Outros projetos de impacto social e ambiental alinhados ao propósito também são bem-vindos.</p>
        </div>
      </div>
    </section>
  );
}
