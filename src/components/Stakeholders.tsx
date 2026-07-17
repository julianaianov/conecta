import { STAKEHOLDERS } from "@/lib/banner-data";
import { AppImage } from "./AppImage";
import { CountUp } from "./CountUp";
import { Reveal } from "./Reveal";

export function Stakeholders() {
  return (
    <section id="comunidade" className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <Reveal>
          <div className="mx-auto mb-12 max-w-xl text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-orange">
              Quem está na rede
            </span>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl" style={{ color: "var(--th-text)" }}>
              Uma plataforma
              <br />
              <span className="gradient-text">feita para todos</span>
            </h2>
            <p className="mt-4" style={{ color: "var(--th-muted)" }}>
              Cidadãos, associações, governo e empresas — qualquer bairro, qualquer cidade, um só propósito.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
          {STAKEHOLDERS.map((item, i) => (
            <Reveal key={item.title} delay={i * 60} className="h-full">
              <div
                style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
                className="group flex h-full flex-col rounded-2xl border overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-orange/40 hover:shadow-xl"
              >
                {/* Image — taller card */}
                <div className="relative h-36 w-full overflow-hidden sm:h-40">
                  <AppImage
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 200px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                </div>

                <div className="flex flex-col items-center px-4 py-4 text-center flex-1">
                  <h3
                    className="text-[11px] font-extrabold uppercase leading-snug tracking-wide"
                    style={{ color: item.titleColor }}
                  >
                    {item.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed" style={{ color: "var(--th-muted)" }}>
                    {item.description}
                  </p>
                  <button
                    type="button"
                    className="mt-3 rounded-full border border-orange/30 px-3 py-1 text-[10px] font-semibold text-orange transition-all hover:bg-orange/10 hover:border-orange/60"
                  >
                    Conectar
                  </button>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Stats bar */}
        <Reveal delay={400}>
          <div
            style={{ background: "var(--th-card-alt)", borderColor: "var(--th-border)" }}
            className="mt-10 grid grid-cols-2 gap-4 rounded-2xl border p-6 sm:grid-cols-4"
          >
            <StatItem value="+1.200" label="Membros ativos" />
            <StatItem value="165" label="Bairros suportados" />
            <StatItem value="50+" label="Projetos publicados" />
            <StatItem value="6" label="Tipos de perfil" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <CountUp value={value} className="block text-2xl font-extrabold text-orange" />
      <div className="mt-0.5 text-sm" style={{ color: "var(--th-muted)" }}>{label}</div>
    </div>
  );
}
