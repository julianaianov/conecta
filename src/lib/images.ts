/** Reexporta o catálogo demo do sistema — use demo-catalog.ts como fonte única. */

import {

  DEMO_COMMUNITIES,

  DEMO_POSTS,

  DEMO_PROFILES,

  POST_IMAGES,

  POST_IDS,

  postImage,

  profileAvatar,

  TYPE_COLORS,

  type PostType,

} from "./demo-catalog";

import { BANNER_PHOTOS } from "./banner-photos";



export { DEMO_COMMUNITIES, DEMO_POSTS, DEMO_PROFILES, POST_IDS, postImage, profileAvatar, TYPE_COLORS, type PostType };



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

  stepPublish: BANNER_PHOTOS.iluminacao,

  stepConnect: BANNER_PHOTOS.mutiraoPraia,

  stepTransform: BANNER_PHOTOS.horta,

} as const;



export const AVATARS = {

  maria: BANNER_PHOTOS.avatarMaria,

  associacao: BANNER_PHOTOS.avatarAssociacao,

  subprefeitura: BANNER_PHOTOS.avatarPrefeitura,

  empresa: BANNER_PHOTOS.avatarEmpresa,

} as const;



export const COMMUNITY_GRID = DEMO_COMMUNITIES.map((c) => ({

  id: c.id,

  src: c.image,

  name: c.name,

}));



/** Publicações reais do demo — mesmas do app */

export const IMPACT_GALLERY = DEMO_POSTS.map((post) => ({

  src: post.image,

  alt: `${post.typeLabel}: ${post.title} — ${post.neighborhood}`,

  label: post.typeLabel,

  type: post.type,

  title: post.title,

  author: post.author,

}));



export const TRUST_ROLE_IMAGES = {

  Cidadãos: AVATARS.maria,

  ONGs: AVATARS.associacao,

  Associações: AVATARS.associacao,

  Prefeituras: AVATARS.subprefeitura,

  "Comércio local": AVATARS.empresa,

  Voluntários: AVATARS.maria,

} as const;

