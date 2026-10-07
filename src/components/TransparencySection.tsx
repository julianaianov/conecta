"use client";

import Link from "next/link";
import { useLandingData } from "@/components/LandingData";
import { publishedDateLabel } from "@/lib/app/landing";
import { DEMAND_STATUS_LABELS } from "@/lib/app/types";

export function TransparencySection() {
  const { intelligence, recovering } = useLandingData();
  const demand = intelligence?.recentDemand ?? null;

  // Os sete rankings da plataforma (Apresentação Institucional, slide 22), publicados em /ranking.
  const rankings = [
    { label: "Usuários mais ativos", icon: "i-activity" },
    { label: "Maiores apoiadores", icon: "i-heart" },
    { label: "Empresas em destaque", icon: "i-spark" },
    { label: "Voluntários mais participativos", icon: "i-people" },
    { label: "Maiores patrocinadores", icon: "i-brief" },
    { label: "Bairros mais engajados", icon: "i-map" },
    { label: "Projetos mais apoiados", icon: "i-check" },
  ];

  return (
    <section className="sec" id="impacto">
      <div className="wrap trans">
        <div>
          <span className="eyebrow"><i className="eb-n" aria-hidden="true">08</i>Transparência e reconhecimento</span>
          <h2 className="h2" style={{ marginTop: 16 }}>Resultados documentados. Apoio efetivo reconhecido.</h2>
          <p className="lede" style={{ marginTop: 16 }}>
            Quem apoiou, quem executou e o que mudou no território ficam
            registrados em cada projeto. Quem participa e entrega resultados
            ganha visibilidade.
          </p>

          <div className="tr-eng">
            <span className="er-k">Engajamento</span>
            <ul className="er-eng-list">
              <li>
                <span className="er-ic">
                  <svg className="ico" aria-hidden="true"><use href="#i-people" /></svg>
                </span>
                Participação em projetos
              </li>
              <li>
                <span className="er-ic">
                  <svg className="ico" aria-hidden="true"><use href="#i-heart" /></svg>
                </span>
                Voluntariado
              </li>
              <li>
                <span className="er-ic">
                  <svg className="ico" aria-hidden="true"><use href="#i-mega" /></svg>
                </span>
                Compartilhamentos
              </li>
              <li>
                <span className="er-ic">
                  <svg className="ico" aria-hidden="true"><use href="#i-shield" /></svg>
                </span>
                Selos de impacto social
              </li>
            </ul>
          </div>
        </div>

        <article className="ficha" aria-label="Ficha de impacto da demanda pública mais recente">
          <div className="ficha-h">
            <div className="k">
              <span>Ficha de impacto</span>
              <span className="tag-ex">Dados públicos</span>
            </div>
            {demand ? (
              <>
                <h3>{demand.title}</h3>
                <span className="status">{DEMAND_STATUS_LABELS[demand.status]}</span>
              </>
            ) : (
              <h3>
                {intelligence
                  ? "Nenhuma demanda pública cadastrada"
                  : recovering ? "Carregando dados públicos…" : "Dados públicos indisponíveis"}
              </h3>
            )}
          </div>

          {demand ? (
            <>
              <div className="fgrid">
                <div className="fcell">
                  <span className="k">Localização</span>
                  <span className="v">{demand.territory || "Território não informado"}</span>
                </div>
                <div className="fcell">
                  <span className="k">Publicada em</span>
                  <span className="v">{publishedDateLabel(demand.publishedAt) || "—"}</span>
                </div>
              </div>

              <div className="evid">
                <span className="k">Evidências e histórico</span>
                <p className="legend-note">
                  Fotos, documentos, registros de execução e a linha do tempo desta demanda ficam na página
                  pública dela, sempre a partir do que foi registrado na plataforma.
                </p>
                <Link className="btn btn-primary" href={`/demandas/${demand.id}`}>
                  Ver a demanda completa
                  <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg>
                </Link>
              </div>
            </>
          ) : (
            <div className="evid">
              <p className="legend-note">
                A ficha de impacto aparece aqui quando houver uma demanda pública publicada, com os registros
                e as evidências enviados pelo Agente de Transformação.
              </p>
            </div>
          )}
        </article>
      </div>

      <div className="wrap tr-rank" id="reconhecimento">
        <article className="er-card er-rec">
          <header>
            <div className="er-rk">
              <span className="er-k">Reconhecimento</span>
            </div>
            <h3>Ranking de impacto</h3>
            <p className="er-sub">
              O DM Conecta destaca quem mais transforma os territórios, com o critério de cada ranking à vista:
            </p>
          </header>
          <ol className="er-rec-list er7">
            {rankings.map((item, index) => (
              <li key={item.label}>
                <span className="er-n">{String(index + 1).padStart(2, "0")}</span>
                <span className="er-ic">
                  <svg className="ico" aria-hidden="true"><use href={`#${item.icon}`} /></svg>
                </span>
                <b>{item.label}</b>
              </li>
            ))}
          </ol>
          <p style={{ marginTop: 18 }}>
            <Link className="btn btn-light" href="/ranking">
              Ver os rankings
              <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg>
            </Link>
          </p>
        </article>
        <p className="er-note">
          <svg className="ico" aria-hidden="true"><use href="#i-scale" /></svg>
          O reconhecimento prioriza o apoio efetivo e o impacto comprovado.
          Órgãos públicos não entram em rankings competitivos: para o Poder
          Público, são usados indicadores de participação, articulação e
          resultados.
        </p>
      </div>
    </section>
  );
}
