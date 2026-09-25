import Link from "next/link";
import { APP_URL } from "@/lib/constants";
import type { RankEntry } from "@/lib/app/types";
import { AppImage } from "./AppImage";
import { CountUp } from "./CountUp";

const SHOWCASE = [
  {
    src: "/images/stakeholders/voluntarios.png",
    alt: "Moradores e voluntários se unindo",
    label: "Voluntários",
  },
  {
    src: "/images/stakeholders/projetos.png",
    alt: "Projetos comunitários em ação",
    label: "Projetos",
  },
  {
    src: "/images/stakeholders/prefeituras.png",
    alt: "Governo e prefeituras conectadas",
    label: "Governo",
  },
];

export function Hero({ profiles, stats }: { profiles: RankEntry[]; stats: { value: string; label: string }[] }) {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden pb-24 pt-24 lg:pt-28">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div
          className="absolute left-1/2 top-0 h-[600px] w-[1000px] -translate-x-1/2 rounded-full blur-[120px]"
          style={{ background: "rgba(246,107,14,0.07)" }}
        />
        <div
          className="absolute -right-40 bottom-0 h-[400px] w-[600px] rounded-full blur-[90px]"
          style={{ background: "rgba(32,83,117,0.07)" }}
        />
        <div
          className="absolute -left-40 top-1/2 h-[300px] w-[500px] -translate-y-1/2 rounded-full blur-[80px]"
          style={{ background: "rgba(32,83,117,0.04)" }}
        />
      </div>

      {/* ── Text content ── */}
      <div className="mx-auto w-full max-w-4xl px-5 text-center lg:px-8">
        {/* Badge: posicionamento literal da Apresentação Institucional, slide 1 */}
        <div className="mb-8 flex justify-center">
          <span className="hero-pill inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange" />
            Infraestrutura Digital de Impacto Local
          </span>
        </div>

        {/* Headline */}
        <h1
          className="hero-text font-extrabold leading-[1.1] tracking-tight"
          style={{ fontSize: "clamp(2.4rem, 6vw, 4.5rem)" }}
        >
          {/* Lema literal da Apresentação Institucional, slides 1 e 29 */}
          Conecte-se · Participe ·
          <br />
          <span className="gradient-text">Transforme</span>
        </h1>

        {/* Sub-headline: slide 2 da Apresentação Institucional */}
        <p
          className="hero-muted mx-auto mt-6 max-w-2xl text-lg leading-relaxed sm:text-xl"
        >
          O DM Conecta identifica demandas reais das comunidades, estrutura projetos e conecta
          empresas, organizações e poder público para transformar recursos em impacto local
          mensurável.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={`${APP_URL}/register`}
            className="w-full rounded-xl bg-orange px-8 py-4 text-base font-bold text-white shadow-lg shadow-orange/20 transition-all hover:bg-orange-light hover:-translate-y-0.5 active:scale-[.98] sm:w-auto"
          >
            Criar conta gratuita
          </Link>
          <Link
            href={`${APP_URL}/login`}
            style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}
            className="w-full rounded-xl border px-8 py-4 text-base font-semibold transition-all hover:border-orange/40 hover:bg-orange/5 sm:w-auto"
          >
            Entrar na conta
          </Link>
        </div>

        {/* Participação no território */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <div className="flex -space-x-2.5">
            {profiles.filter((profile) => profile.avatarUrl).slice(0, 4).map((profile) => (
              <AppImage
                key={profile.userId}
                src={profile.avatarUrl}
                alt={profile.name}
                width={32}
                height={32}
                className="hero-avatar-border h-8 w-8 rounded-full border-2 object-cover"
              />
            ))}
          </div>
          <p className="text-sm leading-tight">
            <strong className="hero-text font-semibold">{stats[0]?.value ?? "0"} perfis publicados</strong>{" "}
            <span className="hero-muted">na plataforma pública</span>
          </p>
        </div>
      </div>

      {/* ── Photo showcase ── */}
      <div className="mx-auto mt-16 w-full max-w-5xl px-5 lg:px-8">
        <div className="grid grid-cols-3 items-stretch gap-3 sm:gap-5">
          {SHOWCASE.map((photo) => (
            <div
              key={photo.src}
              className="relative overflow-hidden rounded-2xl"
              style={{
                aspectRatio: "4/3",
                border: "2.5px solid rgba(255,255,255,0.85)",
                boxShadow: "0 8px 36px rgba(17,43,60,0.16), 0 2px 8px rgba(17,43,60,0.06)",
              }}
            >
              <AppImage
                src={photo.src}
                alt={photo.alt}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 30vw, 320px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              <span className="absolute bottom-2.5 left-2.5 rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold text-navy shadow backdrop-blur-sm">
                {photo.label}
              </span>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div
          className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl sm:grid-cols-4"
          style={{ background: "var(--th-border)" }}
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center py-5"
              style={{ background: "var(--th-card-alt)" }}
            >
              <CountUp value={stat.value} className="text-2xl font-extrabold text-orange" />
              <span className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
