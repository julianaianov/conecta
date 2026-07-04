/**
 * Catálogo visual do dmconecta — espelha os dados demo do app (seu bairro).
 * Cada imagem está ligada a uma publicação, perfil ou comunidade do sistema.
 */

import { BANNER_PHOTOS } from "./banner-photos";

export const POST_IDS = {
  buracoAmericas: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  mutiraoPraia: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  iluminacaoBarreto: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  hortaComunitaria: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  cestasBasicas: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  feiraSustentabilidade: "ffffffff-ffff-ffff-ffff-ffffffffffff",
  plantioMudas: "10101010-1010-1010-1010-101010101010",
  alagamentoGuignard: "20202020-2020-2020-2020-202020202020",
  futebolComunitario: "30303030-3030-3030-3030-303030303030",
  reforcoEscolar: "40404040-4040-4040-4040-404040404040",
} as const;

export const USER_IDS = {
  maria: "11111111-1111-1111-1111-111111111111",
  associacao: "22222222-2222-2222-2222-222222222222",
  subprefeitura: "33333333-3333-3333-3333-333333333333",
  empresa: "44444444-4444-4444-4444-444444444444",
} as const;

export const COMMUNITY_IDS = {
  moradores: "c1",
  mutiraoVerde: "c2",
  ciclistasOrla: "c3",
  feiraSustentabilidade: "c4",
} as const;

/** Fotos reais por publicação — inspiradas no banner */
export const POST_IMAGES: Record<string, string> = {
  [POST_IDS.buracoAmericas]: BANNER_PHOTOS.buracoRua,
  [POST_IDS.mutiraoPraia]: BANNER_PHOTOS.mutiraoPraia,
  [POST_IDS.iluminacaoBarreto]: BANNER_PHOTOS.iluminacao,
  [POST_IDS.hortaComunitaria]: BANNER_PHOTOS.horta,
  [POST_IDS.cestasBasicas]: BANNER_PHOTOS.cestas,
  [POST_IDS.feiraSustentabilidade]: BANNER_PHOTOS.feira,
  [POST_IDS.plantioMudas]: BANNER_PHOTOS.plantio,
  [POST_IDS.alagamentoGuignard]: BANNER_PHOTOS.alagamento,
  [POST_IDS.futebolComunitario]: BANNER_PHOTOS.futebol,
  [POST_IDS.reforcoEscolar]: BANNER_PHOTOS.reforco,
};

export type PostType = "problem" | "project" | "need" | "event" | "action";

export type DemoPost = {
  id: string;
  type: PostType;
  typeLabel: string;
  title: string;
  author: string;
  authorId: string;
  neighborhood: string;
  meta: string;
  image: string;
};

export const DEMO_POSTS: DemoPost[] = [
  {
    id: POST_IDS.buracoAmericas,
    type: "problem",
    typeLabel: "Problema",
    title: "Buraco na Av. das Américas",
    author: "Maria Silva",
    authorId: USER_IDS.maria,
    neighborhood: "Jardim América",
    meta: "12 apoios · shopping do bairro",
    image: POST_IMAGES[POST_IDS.buracoAmericas],
  },
  {
    id: POST_IDS.mutiraoPraia,
    type: "project",
    typeLabel: "Projeto",
    title: "Mutirão de limpeza da praia",
    author: "Associação Bairro Verde",
    authorId: USER_IDS.associacao,
    neighborhood: "Vila do Mar",
    meta: "28 apoios · mutirão aos sábados",
    image: POST_IMAGES[POST_IDS.mutiraoPraia],
  },
  {
    id: POST_IDS.hortaComunitaria,
    type: "project",
    typeLabel: "Projeto",
    title: "Horta comunitária do bairro",
    author: "Associação Bairro Verde",
    authorId: USER_IDS.associacao,
    neighborhood: "Centro",
    meta: "35 apoios · em andamento",
    image: POST_IMAGES[POST_IDS.hortaComunitaria],
  },
  {
    id: POST_IDS.iluminacaoBarreto,
    type: "problem",
    typeLabel: "Problema",
    title: "Iluminação precária na Av. Gen. Barreto",
    author: "Maria Silva",
    authorId: USER_IDS.maria,
    neighborhood: "Boa Vista",
    meta: "19 apoios · segurança",
    image: POST_IMAGES[POST_IDS.iluminacaoBarreto],
  },
  {
    id: POST_IDS.cestasBasicas,
    type: "need",
    typeLabel: "Necessidade",
    title: "Doação de cestas básicas — famílias afetadas",
    author: "Subprefeitura Regional",
    authorId: USER_IDS.subprefeitura,
    neighborhood: "Vila Nova",
    meta: "40 famílias · doação de alimentos",
    image: POST_IMAGES[POST_IDS.cestasBasicas],
  },
  {
    id: POST_IDS.feiraSustentabilidade,
    type: "event",
    typeLabel: "Evento",
    title: "Feira de Sustentabilidade do bairro",
    author: "Construtora Nova Ltda",
    authorId: USER_IDS.empresa,
    neighborhood: "Parque das Árvores",
    meta: "shopping do bairro · dia 15",
    image: POST_IMAGES[POST_IDS.feiraSustentabilidade],
  },
];

export type DemoProfile = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  cover: string;
};

export const DEMO_PROFILES: DemoProfile[] = [
  {
    id: USER_IDS.maria,
    name: "Maria Silva",
    role: "Cidadã / Moradora",
    avatar: BANNER_PHOTOS.avatarMaria,
    cover: BANNER_PHOTOS.iluminacao,
  },
  {
    id: USER_IDS.associacao,
    name: "Associação Bairro Verde",
    role: "Associação de bairro",
    avatar: BANNER_PHOTOS.avatarAssociacao,
    cover: BANNER_PHOTOS.mutiraoPraia,
  },
  {
    id: USER_IDS.subprefeitura,
    name: "Subprefeitura Regional",
    role: "Governo / Prefeitura",
    avatar: BANNER_PHOTOS.avatarPrefeitura,
    cover: BANNER_PHOTOS.stakeholderPrefeitura,
  },
  {
    id: USER_IDS.empresa,
    name: "Construtora Nova Ltda",
    role: "Empresa / Patrocinador",
    avatar: BANNER_PHOTOS.avatarEmpresa,
    cover: BANNER_PHOTOS.stakeholderEmpresas,
  },
];

export type DemoCommunity = {
  id: string;
  name: string;
  description: string;
  category: string;
  memberCount: number;
  image: string;
};

export const DEMO_COMMUNITIES: DemoCommunity[] = [
  {
    id: COMMUNITY_IDS.moradores,
    name: "Moradores do bairro",
    description: "Grupo oficial de moradores do seu bairro.",
    category: "Bairro",
    memberCount: 1247,
    image: BANNER_PHOTOS.communityBairro,
  },
  {
    id: COMMUNITY_IDS.mutiraoVerde,
    name: "Mutirão Bairro Verde",
    description: "Voluntários de limpeza e sustentabilidade na orla.",
    category: "Ambiental",
    memberCount: 389,
    image: BANNER_PHOTOS.communityOrla,
  },
  {
    id: COMMUNITY_IDS.ciclistasOrla,
    name: "Ciclistas da Orla",
    description: "Pedal, segurança e mobilidade no bairro.",
    category: "Mobilidade",
    memberCount: 156,
    image: BANNER_PHOTOS.communityMobilidade,
  },
  {
    id: COMMUNITY_IDS.feiraSustentabilidade,
    name: "Feira de Sustentabilidade",
    description: "Organização do evento anual no shopping do bairro.",
    category: "Eventos",
    memberCount: 78,
    image: BANNER_PHOTOS.communityEvento,
  },
];

export function postImage(id: string, type?: PostType): string {
  return POST_IMAGES[id] ?? POST_IMAGES[POST_IDS.buracoAmericas];
}

export function profileAvatar(id: string): string {
  return DEMO_PROFILES.find((p) => p.id === id)?.avatar ?? DEMO_PROFILES[0].avatar;
}

export const TYPE_COLORS: Record<PostType, string> = {
  problem: "#F66B0E",
  project: "#205375",
  need: "#F8833A",
  event: "#5483A9",
  action: "#112B3C",
};
