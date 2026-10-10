/** Conteúdo público da jornada e dos gráficos da landing. */

export type LandingActorId = "agt" | "par" | "pp" | "com" | "cmn" | "dm";

export interface LandingJourneyStep {
  title: string;
  panelTitle?: string;
  phase: string;
  actors: readonly LandingActorId[];
  text: string;
  ai?: boolean;
}

export const LANDING_JOURNEY_STEPS: readonly LandingJourneyStep[] = [
  {
    title: "Projeto",
    phase: "Estruturar",
    actors: ["agt"],
    text: "Após o cadastro institucional e a validação, o Agente de Transformação cadastra a iniciativa e apresenta seu objetivo.",
  },
  {
    title: "Estruturação",
    phase: "Estruturar",
    actors: ["agt", "dm"],
    text: "O projeto é organizado com orçamento, cronograma, público beneficiado e resultados esperados.",
  },
  {
    title: "Publicação",
    panelTitle: "Publicação no mapa",
    phase: "Estruturar",
    actors: ["dm"],
    text: "O projeto é publicado na plataforma e passa a integrar o Mapa Territorial, com sua localização visível e mais visibilidade para parceiros, apoiadores e instituições interessadas em contribuir.",
  },
  {
    title: "Conexão",
    phase: "Conectar",
    actors: ["dm"],
    text: "O DM Conecta identifica possíveis parceiros e apoiadores para o projeto.",
    ai: true,
  },
  {
    title: "Apoio",
    phase: "Conectar",
    actors: ["par", "pp", "com"],
    text: "Parceiros, poder público e comunidade oferecem recursos financeiros, materiais, técnicos, institucionais ou humanos.",
  },
  {
    title: "Execução",
    phase: "Executar",
    actors: ["agt", "par"],
    text: "O projeto é realizado no território pelo Agente de Transformação com os parceiros envolvidos.",
  },
  {
    title: "Acompanhamento",
    phase: "Executar",
    actors: ["agt", "dm"],
    text: "Etapas, evidências e atualizações são registradas.",
  },
  {
    title: "Resultados",
    phase: "Mensurar",
    actors: ["agt"],
    text: "O Agente apresenta os resultados alcançados.",
  },
  {
    title: "Impacto",
    phase: "Mensurar",
    actors: ["dm", "cmn"],
    text: "O DM Conecta mensura e dá visibilidade à transformação gerada.",
  },
];

export const LANDING_ANALYTICS_PANELS = [
  { id: "month", question: "Como os projetos evoluem?", title: "Projetos cadastrados por mês" },
  { id: "territory", question: "Onde estão e em que estágio?", title: "Projetos por território" },
  { id: "resources", question: "Quanto já foi mobilizado?", title: "Recursos por eixo de impacto" },
] as const;
