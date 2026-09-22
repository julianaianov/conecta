import { BANNER_PHOTOS } from "./banner-photos";
import type { PostType } from "./app/types";

/** Atalhos para seções da landing — fotos reais inspiradas no banner */

export const IMAGES = {

  heroCover: BANNER_PHOTOS.rioSunset,

  communityCta: BANNER_PHOTOS.horta,

  footerCover: BANNER_PHOTOS.communityMobilidade,

  feedFeature: BANNER_PHOTOS.iluminacao,

  mapFeature: BANNER_PHOTOS.mapCoastal,

  supportFeature: BANNER_PHOTOS.cestas,

  communitiesFeature: BANNER_PHOTOS.communityOrla,

  profilesFeature: BANNER_PHOTOS.horta,

  // Os 3 passos mostram telas reais do app (capturadas em /perfil, /post/[id]/apoiar e /ranking)
  // em vez de fotos de banco — quem chega na landing já vê o produto.
  stepPublish: "/images/screens/app-publique.jpg",

  stepConnect: "/images/screens/app-conecte.jpg",

  stepTransform: "/images/screens/app-transforme.jpg",

} as const;



export const AVATARS = {

  maria: BANNER_PHOTOS.avatarMaria,

  associacao: BANNER_PHOTOS.avatarAssociacao,

  subprefeitura: BANNER_PHOTOS.avatarPrefeitura,

  empresa: BANNER_PHOTOS.avatarEmpresa,

} as const;



export const COMMUNITY_GRID = [
  { id: "associacoes", src: BANNER_PHOTOS.communityMobilidade, name: "Associações" },
  { id: "projetos", src: BANNER_PHOTOS.communityOrla, name: "Projetos e coletivos" },
  { id: "voluntariado", src: BANNER_PHOTOS.communityEvento, name: "Voluntariado" },
];



export const TRUST_ROLE_IMAGES = {

  Moradores: AVATARS.maria,

  ONGs: AVATARS.associacao,

  Associações: AVATARS.associacao,

  Prefeituras: AVATARS.subprefeitura,

  "Comércio local": AVATARS.empresa,

  Voluntários: AVATARS.maria,

} as const;

export type { PostType };
