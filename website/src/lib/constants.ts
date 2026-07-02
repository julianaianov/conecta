import { DEMO_POSTS, IMAGES, profileAvatar } from "./images";

/** Rotas do app dentro do próprio site (string vazia → caminhos locais /login, /feed…). */
export const APP_URL = "";

export const NAV_LINKS = [
  { href: "#mapa", label: "Mapa" },
  { href: "#recursos", label: "Recursos" },
  { href: "#comunidade", label: "Comunidade" },
] as const;

export const TRUST_ROLES = [
  "Cidadãos",
  "ONGs",
  "Associações",
  "Prefeituras",
  "Comércio local",
  "Voluntários",
] as const;

export const FEATURES = [
  {
    title: "Feed comunitário",
    description:
      "Problemas, projetos, necessidades, eventos e ações — filtre por tipo e acompanhe o que importa no seu bairro.",
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
      "Visualize publicações geolocalizadas e descubra o que acontece ao redor de você em tempo real.",
    large: false,
    accent: true,
    icon: "map",
    image: IMAGES.mapFeature,
    caption: "Ex.: Mutirão na Praia do Recreio",
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
    title: "Comunidades",
    description:
      "Organize grupos por interesse, bairro ou causa. Construa rede e engajamento duradouro.",
    large: false,
    accent: false,
    icon: "community",
    image: IMAGES.communitiesFeature,
    caption: "Ex.: Mutirão Recreio Verde",
  },
  {
    title: "Perfis verificados",
    description:
      "Cidadãos, associações, governo e comércio local — cada perfil com identidade visual e credibilidade.",
    roles: ["Cidadão", "Associação", "Governo", "Comércio"],
    large: true,
    accent: true,
    icon: "shield",
    image: IMAGES.profilesFeature,
    caption: "Ex.: Horta comunitária do Recreio",
  },
] as const;

export const STEPS = [
  {
    number: "01",
    title: "Publique",
    description:
      "Conte um problema, lance um projeto ou convoque uma ação. Adicione localização no mapa.",
    image: IMAGES.stepPublish,
    example: "Buraco na Av. das Américas",
  },
  {
    number: "02",
    title: "Conecte",
    description:
      "Receba apoios de vizinhos, ONGs e parceiros. Voluntariado, doações ou expertise — você escolhe.",
    image: IMAGES.stepConnect,
    example: "Mutirão de limpeza da praia",
  },
  {
    number: "03",
    title: "Transforme",
    description:
      "Acompanhe o progresso, celebre resultados e inspire outras iniciativas no bairro.",
    image: IMAGES.stepTransform,
    example: "Horta comunitária do Recreio",
  },
] as const;

export const COMMUNITY_BENEFITS = [
  "Gratuito para cidadãos e voluntários",
  "Web, Android e iOS",
  "Dados seguros e privacidade respeitada",
] as const;

/** Posts exibidos no mockup do celular — mesmos do app demo */
export const MOCK_POSTS = DEMO_POSTS.slice(0, 3).map((post) => ({
  type: post.typeLabel,
  title: post.title,
  meta: post.meta,
  variant: post.type as "problem" | "project" | "need" | "event" | "action",
  image: post.image,
  author: post.author.split(" ")[0],
  authorId: post.authorId,
  avatar: profileAvatar(post.authorId),
}));
