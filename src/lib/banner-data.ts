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

/** 6 stakeholders — fotos + textos do banner */
export const STAKEHOLDERS = [
  {
    title: "Associações de bairro",
    titleColor: "#F4841A",
    description: "Fortaleça seu bairro e conquiste melhorias coletivas.",
    image: BANNER_PHOTOS.stakeholderAssociacoes,
  },
  {
    title: "Projetos e coletivos",
    titleColor: "#F4841A",
    description: "Divulgue suas ações e amplie seu impacto nas suas conexões.",
    image: BANNER_PHOTOS.stakeholderProjetos,
  },
  {
    title: "Imprensa e mídia",
    titleColor: "#F4841A",
    description: "Cubra e amplifique as histórias do seu bairro.",
    image: BANNER_PHOTOS.stakeholderOngs,
  },
  {
    title: "Prefeituras e governo",
    titleColor: "#F4841A",
    description: "Gestão participativa e comunicação direta com a população.",
    image: BANNER_PHOTOS.stakeholderPrefeitura,
  },
  {
    title: "Empresas parceiras",
    titleColor: "#F4841A",
    description: "Invista em projetos, gere impacto e valorize sua marca.",
    image: BANNER_PHOTOS.stakeholderEmpresas,
  },
  {
    title: "Moradores e voluntários",
    titleColor: "#F4841A",
    description: "Participe, colabore e faça a diferença no seu bairro.",
    image: BANNER_PHOTOS.stakeholderVoluntarios,
  },
] as const;

export { BANNER_PHOTOS };
