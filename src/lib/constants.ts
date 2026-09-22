import { IMAGES } from "./images";

/** Rotas do app dentro do próprio site (string vazia → caminhos locais /login, /feed…). */
export const APP_URL = "";

export const NAV_LINKS = [
  { href: "#mapa", label: "Mapa" },
  { href: "#recursos", label: "Recursos" },
  { href: "#conexoes", label: "Conexões" },
] as const;

export const TRUST_ROLES = [
  "Moradores",
  "ONGs",
  "Associações",
  "Prefeituras",
  "Comércio local",
  "Voluntários",
] as const;

export const FEATURES = [
  {
    title: "Pulso do território",
    description:
      "Demandas, projetos, necessidades, eventos e ações — filtre por tipo e acompanhe o que pede atenção no seu bairro.",
    tags: ["Problemas", "Projetos", "Eventos", "Ações"],
    large: true,
    accent: false,
    icon: "feed",
    image: IMAGES.feedFeature,
    caption: "Ex.: Buraco na Av. das Américas",
  },
  {
    title: "Mapa interativo",
    description:
      "Localize sinais do território e descubra o que pede atenção ao redor de você em tempo real.",
    large: false,
    accent: true,
    icon: "map",
    image: IMAGES.mapFeature,
    caption: "Ex.: Mutirão na praia do bairro",
  },
  {
    title: "Sistema de apoios",
    description:
      "PIX, voluntariado, materiais, equipamentos, transporte, mentoria — 10 formas de contribuir.",
    large: false,
    accent: false,
    icon: "support",
    image: IMAGES.supportFeature,
    caption: "Ex.: Doação de cestas básicas",
  },
  {
    title: "Conexões",
    description:
      "Encontre iniciativas por interesse, bairro ou causa. Articule apoio e acompanhe o andamento.",
    large: false,
    accent: false,
    icon: "community",
    image: IMAGES.communitiesFeature,
    caption: "Ex.: Mutirão Bairro Verde",
  },
  {
    title: "Perfis verificados",
    description:
      "Agentes de transformação, comunidade, parceiros, poder público e comunicação — cada perfil com sua função e credibilidade.",
    roles: ["Associação", "Morador", "Empresa", "Prefeitura", "Imprensa"],
    large: true,
    accent: true,
    icon: "shield",
    image: IMAGES.profilesFeature,
    caption: "Ex.: Horta comunitária do bairro",
  },
] as const;

export const STEPS = [
  {
    number: "01",
    title: "Acione",
    description:
      "Conte um problema, lance um projeto ou convoque uma ação. Adicione localização no mapa.",
    image: IMAGES.stepPublish,
    example: "Buraco na Av. das Américas",
  },
  {
    number: "02",
    title: "Articule",
    description:
      "Transforme investimento em impacto social e ambiental. Conecte sua empresa a projetos reais por meio de patrocínio, doações, voluntariado corporativo e ações ESG.",
    image: IMAGES.stepConnect,
    example: "Sua marca + Associação/Ong + conexões",
  },
  {
    number: "03",
    title: "Transforme",
    description:
      "Receba apoios de vizinhos, ONGs e parceiros. Voluntariado, doações ou expertise — você escolhe.",
    image: IMAGES.stepTransform,
    example: "Mutirão de limpeza da praia à regeneração da natureza",
  },
] as const;

export const COMMUNITY_BENEFITS = [
  "Gratuito para cidadãos e voluntários",
  "Web, Android e iOS",
  "Dados seguros e privacidade respeitada",
] as const;
