import { BANNER_PHOTOS } from "./banner-photos";

/** Cores dos pins — iguais ao app do banner */
export const PIN_COLORS = {
  problem: "#E53935",
  project: "#8DC63F",
  action: "#00AEEF",
  need: "#F7941D",
} as const;

export type PinCategory = keyof typeof PIN_COLORS;

export type MapActivity = {
  id: string;
  category: PinCategory;
  pinIcon: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeBg: string;
  badgeText: string;
  image: string;
  x: number;
  y: number;
};

/** Atividades do mockup "Mapa inteligente" + "Atividades próximas" */
export const MAP_ACTIVITIES: MapActivity[] = [
  {
    id: "iluminacao",
    category: "problem",
    pinIcon: "!",
    title: "Iluminação pública",
    subtitle: "Praça do Skate · Recreio",
    badge: "Problema",
    badgeBg: "#FFEBEE",
    badgeText: "#C62828",
    image: BANNER_PHOTOS.iluminacao,
    x: 38,
    y: 42,
  },
  {
    id: "surf-social",
    category: "project",
    pinIcon: "🌿",
    title: "Projeto Surf Social",
    subtitle: "Aulas para jovens",
    badge: "Projeto",
    badgeBg: "#F1F8E9",
    badgeText: "#558B2F",
    image: BANNER_PHOTOS.surfSocial,
    x: 58,
    y: 55,
  },
  {
    id: "mutirao",
    category: "action",
    pinIcon: "👥",
    title: "Mutirão de Limpeza",
    subtitle: "Praia do Pontal",
    badge: "Ação Ambiental",
    badgeBg: "#E1F5FE",
    badgeText: "#0277BD",
    image: BANNER_PHOTOS.mutiraoPraia,
    x: 48,
    y: 68,
  },
  {
    id: "patrocinio",
    category: "need",
    pinIcon: "🤝",
    title: "Patrocínio necessário",
    subtitle: "Equipamentos esportivos",
    badge: "Necessidade",
    badgeBg: "#FFF3E0",
    badgeText: "#E65100",
    image: BANNER_PHOTOS.patrocinio,
    x: 65,
    y: 38,
  },
];

/** 4 pilares — textos e cores do banner de features */
export const BANNER_FEATURES = [
  {
    icon: "map" as const,
    title: "Mapa inteligente",
    titleColor: "#F7941D",
    description: "Visualize no mapa problemas, projetos e oportunidades.",
  },
  {
    icon: "feed" as const,
    title: "Demandas e projetos",
    titleColor: "#00AEEF",
    description: "Publique e acompanhe demandas, projetos e ações do seu bairro.",
  },
  {
    icon: "support" as const,
    title: "Apoio e patrocínios",
    titleColor: "#8DC63F",
    description: "Conecte projetos a patrocinadores e voluntários.",
  },
  {
    icon: "shield" as const,
    title: "Transparência e resultados",
    titleColor: "#9E82C3",
    description: "Acompanhe resultados, metas e prestação de contas.",
  },
] as const;

/** 6 stakeholders — fotos + textos do banner */
export const STAKEHOLDERS = [
  {
    title: "Associações de bairro",
    titleColor: "#00AEEF",
    description: "Fortaleça seu bairro e conquiste melhorias coletivas.",
    image: BANNER_PHOTOS.stakeholderAssociacoes,
  },
  {
    title: "Projetos e coletivos",
    titleColor: "#8DC63F",
    description: "Divulgue suas ações e amplie seu impacto na comunidade.",
    image: BANNER_PHOTOS.stakeholderProjetos,
  },
  {
    title: "Imprensa e mídia",
    titleColor: "#8DC63F",
    description: "Cubra e amplifique as histórias do seu bairro.",
    image: BANNER_PHOTOS.stakeholderOngs,
  },
  {
    title: "Prefeituras e governo",
    titleColor: "#00AEEF",
    description: "Gestão participativa e comunicação direta com a população.",
    image: BANNER_PHOTOS.stakeholderPrefeitura,
  },
  {
    title: "Empresas parceiras",
    titleColor: "#F5C542",
    description: "Invista em projetos, gere impacto e valorize sua marca.",
    image: BANNER_PHOTOS.stakeholderEmpresas,
  },
  {
    title: "Moradores e voluntários",
    titleColor: "#00AEEF",
    description: "Participe, colabore e faça a diferença no seu bairro.",
    image: BANNER_PHOTOS.stakeholderVoluntarios,
  },
] as const;

export { BANNER_PHOTOS };
