import { ROLE_ECOSYSTEM_ROLES } from "./app/types";
import { BANNER_PHOTOS } from "./banner-photos";

/** 4 pilares — textos e cores do banner de features */
export const BANNER_FEATURES = [
  {
    icon: "map" as const,
    title: "Mapa inteligente",
    titleColor: "#F4841A",
    description: "Visualize no mapa problemas, projetos e oportunidades.",
  },
  {
    icon: "feed" as const,
    title: "Demandas e projetos",
    titleColor: "#F4841A",
    description: "Publique e acompanhe demandas, projetos e ações do seu bairro.",
  },
  {
    icon: "support" as const,
    title: "Apoio e patrocínios",
    titleColor: "#F4841A",
    description: "Conecte projetos a patrocinadores e voluntários.",
  },
  {
    icon: "shield" as const,
    title: "Transparência e resultados",
    titleColor: "#F4841A",
    description: "Acompanhe resultados, metas e prestação de contas.",
  },
] as const;

/**
 * As 5 categorias do ecossistema — título e papel da Arquitetura de Perfis §2
 * (fonte da verdade), com as fotos do banner.
 */
export const STAKEHOLDERS = [
  {
    title: "Agentes de Transformação",
    titleColor: "#F4841A",
    description: ROLE_ECOSYSTEM_ROLES.agent,
    image: BANNER_PHOTOS.stakeholderAssociacoes,
  },
  {
    title: "Membros da Comunidade",
    titleColor: "#F4841A",
    description: ROLE_ECOSYSTEM_ROLES.member,
    image: BANNER_PHOTOS.stakeholderVoluntarios,
  },
  {
    title: "Parceiros",
    titleColor: "#F4841A",
    description: ROLE_ECOSYSTEM_ROLES.partner,
    image: BANNER_PHOTOS.stakeholderEmpresas,
  },
  {
    title: "Poder Público",
    titleColor: "#F4841A",
    description: ROLE_ECOSYSTEM_ROLES.government,
    image: BANNER_PHOTOS.stakeholderPrefeitura,
  },
  {
    title: "Comunicação",
    titleColor: "#F4841A",
    description: ROLE_ECOSYSTEM_ROLES.media,
    image: BANNER_PHOTOS.stakeholderOngs,
  },
] as const;

export { BANNER_PHOTOS };
