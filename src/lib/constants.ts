import { IMAGES } from "./images";

/** Rotas do app dentro do próprio site (string vazia → caminhos locais /login, /feed…). */
export const APP_URL = "";

export const NAV_LINKS = [
  { href: "#mapa", label: "Mapa" },
  { href: "#recursos", label: "Recursos" },
  { href: "#conexoes", label: "Conexões" },
] as const;

/**
 * Fluxo principal do DM Conecta (Apresentação, slides 13 a 15): as 9 etapas,
 * agrupadas em três blocos para a landing, com os textos da fonte.
 */
export const STEPS = [
  {
    number: "01",
    title: "Demanda → Projeto → Conexão",
    image: IMAGES.stepPublish,
    stages: [
      { number: 1, name: "Demanda", description: "Um Agente de Transformação identifica e registra uma necessidade do território." },
      { number: 2, name: "Estruturação", description: "A demanda é organizada em um projeto, com objetivo, público, localização, recursos necessários e informações de apoio." },
      { number: 3, name: "Conexão", description: "O DM Conecta identifica potenciais parceiros, instituições, poder público e outros atores que podem contribuir." },
    ],
  },
  {
    number: "02",
    title: "Apoio → Articulação → Amplificação",
    image: IMAGES.stepConnect,
    stages: [
      { number: 4, name: "Apoio", description: "Empresas, marcas, comércio, patrocinadores, poder público ou comunidade demonstram interesse e oferecem recursos, serviços, divulgação ou articulação." },
      { number: 5, name: "Articulação", description: "O Poder Público pode responder, encaminhar, conectar programas e serviços ou apoiar a viabilização." },
      { number: 6, name: "Amplificação", description: "A Comunicação dá visibilidade a demandas, projetos e resultados." },
    ],
  },
  {
    number: "03",
    title: "Execução → Resultado → Impacto",
    image: IMAGES.stepTransform,
    stages: [
      { number: 7, name: "Execução", description: "O projeto é realizado pelo Agente de Transformação com os parceiros envolvidos." },
      { number: 8, name: "Resultado", description: "O Agente atualiza resultados, evidências e indicadores de impacto." },
      { number: 9, name: "Mensuração", description: "O DM Conecta organiza os dados para demonstrar impacto, histórico de apoios e resultados territoriais." },
    ],
  },
] as const;

/** Slide 15: quem faz o quê no fluxo. */
export const FLOW_ROLES = [
  "Agentes de Transformação = publicam",
  "Poder Público e Parceiros = viabilizam e articulam",
  "Comunicação = amplifica",
  "Membros da Comunidade = participam",
] as const;
