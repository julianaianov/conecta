import { IMAGES } from "./images";

/** Rotas do app dentro do próprio site (string vazia → caminhos locais /login, /feed…). */
export const APP_URL = "";

export const NAV_LINKS = [
  { href: "#mapa", label: "Mapa" },
  { href: "#recursos", label: "Recursos" },
  { href: "#conexoes", label: "Conexões" },
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
