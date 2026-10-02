import Link from "next/link";
import { InDevelopment } from "./app/InDevelopment";

/** Ficha pública do app Android na Google Play. */
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=org.dmconecta.app";

const PLATFORM_LINKS = [
  { href: "#solucao", label: "O DM Conecta" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#projetos", label: "Projetos e eixos" },
  { href: "#para-quem", label: "Quem participa" },
  { href: "#impacto", label: "Transparência" },
  { href: "#faq", label: "Perguntas frequentes" },
];

const INSTITUTIONAL_LINKS = [
  { href: "#governanca", label: "Governança" },
  { href: "#governanca", label: "LGPD" },
  { href: "/termos-de-uso", label: "Termos de uso" },
  { href: "/politica-de-privacidade", label: "Política de privacidade" },
  { href: "/seguranca-infantil", label: "Segurança infantil" },
];

export function Footer() {
  return (
    <footer id="contato">
      <div className="wrap">
        <div className="fgrid2">
          <div>
            <Link className="logo" href="#top" aria-label="DM Conecta — início">
              <svg className="logo-mark" width="30" height="33" aria-hidden="true">
                <use href="#logo-mark" />
              </svg>
              <span>
                DM <small>Conecta</small>
              </span>
            </Link>
            <p>Infraestrutura digital de impacto social e ambiental. Conecte-se. Participe. Transforme.</p>
          </div>

          <div>
            <h4>Plataforma</h4>
            <ul>
              {PLATFORM_LINKS.map((item) => (
                <li key={item.label}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Institucional</h4>
            <ul>
              {INSTITUTIONAL_LINKS.map((item) => (
                <li key={item.label}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Fale conosco</h4>
            <ul className="ft-contact">
              <li>
                <a href="mailto:contato@dmconecta.org">
                  <svg className="ico" aria-hidden="true">
                    <use href="#i-doc" />
                  </svg>
                  <span>contato@dmconecta.org</span>
                </a>
              </li>
              <li>
                <a
                  href="https://www.instagram.com/dmconectainfradigital/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Instagram · @dmconectainfradigital
                </a>
              </li>
              <li>
                <span className="ft-soon">Canais institucionais em breve</span>
              </li>
              <li className="pt-2">
                <a
                  href={GOOGLE_PLAY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-petro-600 dark:text-orange"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3.18 23.76c.36.2.8.2 1.16 0L14.5 12 4.34.24c-.36-.2-.8-.2-1.16 0C2.46.64 2 1.32 2 2.08v19.84c0 .76.46 1.44 1.18 1.84z" />
                    <path d="M17.5 15.02L5.66 21.9l9.12-9.12 2.72 2.24zM5.66 2.1l11.84 6.88-2.72 2.24L5.66 2.1zM20.5 10.4l-2.28-1.32-3.04 2.52 3.04 2.52 2.28-1.32c.82-.48.82-1.92 0-2.4z" />
                  </svg>
                  Google Play (Android)
                </a>
              </li>
              <li>
                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  iOS
                  <InDevelopment as="inline" />
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="fbot">
          <span>&copy; {new Date().getFullYear()} DM Conecta</span>
          <span>Dados, mapas e imagens desta página são ilustrativos. Funcionalidades em desenvolvimento estão identificadas.</span>
        </div>
      </div>
    </footer>
  );
}
