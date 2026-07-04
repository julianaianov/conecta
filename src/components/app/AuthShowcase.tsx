import Link from "next/link";
import { AppImage } from "@/components/AppImage";
import { DMLogo } from "@/components/app/DMLogo";
import { Icon } from "@/components/app/Icon";
import { BANNER_PHOTOS } from "@/lib/banner-photos";

/**
 * Vitrine das telas de auth (login/cadastro/recuperar) — inspirada no login
 * do Facebook, adaptada ao DM Conecta.
 *   • Desktop (lg+): painel lateral claro com título grande + colagem de cards.
 *   • Mobile (<lg): banner no topo do formulário com fotos da comunidade.
 * Manual de Marca: Petróleo #1B4F72 · Laranja #F4841A.
 */
export function AuthShowcase() {
  return (
    <>
      <MobileBanner />
      <DesktopPanel />
    </>
  );
}

/* ── Banner do topo (só mobile) ─────────────────────────────── */
function MobileBanner() {
  const photos = [BANNER_PHOTOS.surfSocial, BANNER_PHOTOS.horta, BANNER_PHOTOS.patrocinio];
  return (
    <div className="relative h-52 w-full overflow-hidden rounded-b-3xl lg:hidden">
      <div className="absolute inset-0 grid grid-cols-3 gap-1">
        {photos.map((src, i) => (
          <div key={src} className={`relative ${i === 0 ? "col-span-2" : ""}`}>
            <AppImage src={src} alt="Comunidade" fill className="object-cover" sizes="100vw" />
          </div>
        ))}
      </div>
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to top, rgba(13,45,66,0.95) 8%, rgba(13,45,66,0.55) 55%, rgba(27,79,114,0.25) 100%)" }}
      />
      <div className="relative z-10 flex h-full flex-col justify-between p-5">
        <Link href="/" aria-label="Início" className="self-start">
          <DMLogo size={30} tone="light" />
        </Link>
        <div>
          <p className="text-xl font-extrabold leading-tight text-white" style={{ letterSpacing: "-0.02em" }}>
            Conecte, participe,{" "}
            <span style={{ color: "#f4841a" }}>transforme</span> o seu bairro.
          </p>
          <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.75)" }}>
            Rede social de impacto local · do seu bairro à sua cidade
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Painel lateral (só desktop) ────────────────────────────── */
function DesktopPanel() {
  return (
    <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16" style={{ background: "var(--th-bg)" }}>
      <div className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full" style={{ background: "radial-gradient(circle, rgba(27,79,114,0.06), transparent 70%)" }} />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full" style={{ background: "radial-gradient(circle, rgba(244,132,26,0.07), transparent 70%)" }} />

      <Link href="/" aria-label="Voltar para a página inicial" className="relative z-10 self-start" style={{ color: "var(--th-text)" }}>
        <DMLogo size={40} tone="petroleo" />
      </Link>

      <h1 className="relative z-20 my-auto text-5xl font-extrabold leading-[0.95] xl:text-6xl" style={{ color: "var(--th-text)", letterSpacing: "-0.03em" }}>
        Conecte.
        <br />
        Participe.
        <br />
        <span style={{ color: "#f4841a" }}>Transforme</span>
        <br />
        o bairro.
      </h1>

      <Collage />

      <p className="relative z-10 text-sm font-medium" style={{ color: "var(--th-muted)" }}>
        Rede social de impacto local · do seu bairro à sua cidade
      </p>
    </div>
  );
}

/* ── Colagem de cards flutuantes (desktop) ──────────────────── */
function Collage() {
  return (
    <div className="pointer-events-none absolute right-2 top-1/2 z-10 hidden h-[30rem] w-[23rem] origin-right -translate-y-1/2 scale-[0.72] lg:block xl:right-6 xl:scale-90 2xl:right-16 2xl:scale-100">
      <figure
        className="absolute left-0 top-16 h-52 w-44 overflow-hidden rounded-3xl"
        style={{ transform: "rotate(-7deg)", boxShadow: "0 24px 50px rgba(13,45,66,0.20)", border: "5px solid #fff" }}
      >
        <AppImage src={BANNER_PHOTOS.horta} alt="Horta comunitária" fill className="object-cover" sizes="200px" />
        <span className="absolute left-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg,#0d2d42,#1b4f72)" }}>
          <Icon name="leaf" size={17} />
        </span>
      </figure>

      <figure
        className="absolute right-2 top-0 h-[22rem] w-60 overflow-hidden rounded-[1.75rem]"
        style={{ transform: "rotate(3deg)", boxShadow: "0 30px 60px rgba(13,45,66,0.28)", border: "6px solid #fff" }}
      >
        <AppImage src={BANNER_PHOTOS.patrocinio} alt="Parceria pelo bairro" fill className="object-cover" sizes="260px" />
        <div className="absolute inset-x-3 top-3 flex gap-1.5">
          <span className="h-1 flex-1 rounded-full" style={{ background: "#f4841a" }} />
          <span className="h-1 flex-1 rounded-full" style={{ background: "rgba(255,255,255,0.55)" }} />
          <span className="h-1 flex-1 rounded-full" style={{ background: "rgba(255,255,255,0.55)" }} />
        </div>
        <span className="absolute right-3 top-7 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold shadow-sm" style={{ color: "#1b4f72" }}>
          <Icon name="location" size={12} style={{ color: "#f4841a" }} /> Seu bairro
        </span>
        <figcaption className="absolute inset-x-0 bottom-0 p-3 text-white" style={{ background: "linear-gradient(to top, rgba(13,45,66,0.85), transparent)" }}>
          <p className="text-[13px] font-bold leading-tight">Parceria pelo bairro</p>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.85)" }}>+128 vizinhos participando</p>
        </figcaption>
      </figure>

      <figure
        className="absolute bottom-2 left-6 h-40 w-52 overflow-hidden rounded-3xl"
        style={{ transform: "rotate(4deg)", boxShadow: "0 24px 50px rgba(13,45,66,0.22)", border: "5px solid #fff" }}
      >
        <AppImage src={BANNER_PHOTOS.feira} alt="Feira verde e comércio local" fill className="object-cover" sizes="220px" />
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
          <span className="h-1.5 flex-1 rounded-full bg-white/50">
            <span className="block h-full w-2/3 rounded-full" style={{ background: "#f4841a" }} />
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#f4841a] shadow-sm">
            <Icon name="star" size={15} />
          </span>
        </div>
      </figure>

      <span className="absolute left-2 top-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#f4841a]" style={{ boxShadow: "0 14px 30px rgba(13,45,66,0.22)", transform: "rotate(-8deg)" }}>
        <Icon name="volunteer" size={26} />
      </span>

      <span className="absolute right-0 top-1/2 flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)", boxShadow: "0 14px 30px rgba(244,132,26,0.40)" }}>
        <Icon name="heart" size={22} />
      </span>

      <span className="absolute bottom-6 right-10 h-20 w-20 overflow-hidden rounded-full" style={{ border: "4px solid #fff", boxShadow: "0 16px 34px rgba(13,45,66,0.28)", outline: "3px solid #f4841a", outlineOffset: "-1px" }}>
        <AppImage src={BANNER_PHOTOS.avatarMaria} alt="Moradora participante" fill className="object-cover" sizes="80px" />
      </span>
    </div>
  );
}
