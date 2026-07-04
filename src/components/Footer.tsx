import Link from "next/link";
import { APP_URL } from "@/lib/constants";
import { DMLogo } from "./app/DMLogo";

export function Footer() {
  return (
    <footer style={{ background: "var(--th-bg-alt)", borderColor: "var(--th-border)" }} className="border-t">
      <div className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center" style={{ color: "var(--th-text)" }}>
              <DMLogo size={32} tone="petroleo" />
            </Link>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--th-muted)" }}>
              A rede social de impacto local. Conectando bairros, transformando realidades.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xl font-extrabold text-orange">+1.200</span>
              <span className="text-sm" style={{ color: "var(--th-muted)" }}>membros ativos</span>
            </div>
          </div>

          <FooterLinks
            title="Plataforma"
            links={[
              { href: `${APP_URL}/register`, label: "Criar conta" },
              { href: `${APP_URL}/login`, label: "Entrar" },
              { href: "#mapa", label: "Mapa inteligente" },
              { href: "#recursos", label: "Recursos" },
            ]}
          />

          <FooterLinks
            title="Legal"
            links={[
              { href: "#", label: "Política de privacidade" },
              { href: "#", label: "Termos de uso" },
              { href: "#", label: "Cookies" },
            ]}
          />

          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text)" }}>
              Contato
            </h4>
            <ul className="mb-6 space-y-2.5">
              <li>
                <a href="mailto:contato@dmconecta.org" style={{ color: "var(--th-muted)" }}
                  className="text-sm transition-colors hover:text-orange">
                  contato@dmconecta.org
                </a>
              </li>
            </ul>

            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text)" }}>
              Baixar o app
            </h4>
            <div className="flex flex-col gap-2">
              {[
                { label: "Google Play", icon: <GooglePlayIcon /> },
                { label: "App Store", icon: <AppleIcon /> },
              ].map(({ label, icon }) => (
                <a
                  key={label}
                  href="#"
                  style={{ borderColor: "var(--th-border)", background: "var(--th-surface)", color: "var(--th-muted)" }}
                  className="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm transition-all hover:border-orange/30 hover:text-orange"
                >
                  {icon}
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderColor: "var(--th-border)" }} className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-sm sm:flex-row lg:px-8"
          style={{ color: "var(--th-muted)" }}>
          <p>&copy; {new Date().getFullYear()} DM Conecta. Todos os direitos reservados.</p>
          <p className="text-xs">Feito com ♥ para comunidades de todo o Brasil</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--th-text)" }}>
        {title}
      </h4>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href} style={{ color: "var(--th-muted)" }}
              className="text-sm transition-colors hover:text-orange">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GooglePlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.18 23.76c.36.2.8.2 1.16 0L14.5 12 4.34.24c-.36-.2-.8-.2-1.16 0C2.46.64 2 1.32 2 2.08v19.84c0 .76.46 1.44 1.18 1.84z" />
      <path d="M17.5 15.02L5.66 21.9l9.12-9.12 2.72 2.24zM5.66 2.1l11.84 6.88-2.72 2.24L5.66 2.1zM20.5 10.4l-2.28-1.32-3.04 2.52 3.04 2.52 2.28-1.32c.82-.48.82-1.92 0-2.4z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}
