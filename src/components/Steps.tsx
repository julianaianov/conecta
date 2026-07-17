import { STEPS } from "@/lib/constants";
import { AppImage } from "./AppImage";
import { Reveal } from "./Reveal";

export function Steps() {
  return (
    <section id="como-funciona" className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <Reveal>
          <div className="mx-auto mb-16 max-w-xl text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-orange">
              Como a rede funciona
            </span>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl" style={{ color: "var(--th-text)" }}>
              Da ideia ao impacto
              <br />
              <span className="gradient-text">em 3 passos</span>
            </h2>
            <p className="mt-4" style={{ color: "var(--th-muted)" }}>
              Publique, conecte e transforme o seu bairro — é simples e gratuito.
            </p>
          </div>
        </Reveal>

        <div className="relative grid items-stretch gap-8 md:grid-cols-3 md:gap-6 lg:gap-8">
          <div
            className="absolute left-0 right-0 top-[88px] hidden h-px md:block"
            style={{ background: "linear-gradient(to right, transparent, var(--th-border), transparent)" }}
            aria-hidden="true"
          />

          {STEPS.map((step, i) => (
            <Reveal key={step.number} delay={i * 120} className="h-full">
              <div className="group relative flex h-full flex-col">
                <div
                  style={{ borderColor: "var(--th-border)" }}
                  className="relative mb-6 h-48 w-full overflow-hidden rounded-2xl border"
                >
                  <AppImage
                    src={step.image}
                    alt={step.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                  <div
                    style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
                    className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border font-mono text-sm font-bold text-orange backdrop-blur-sm"
                  >
                    {step.number}
                  </div>
                </div>

                <div className="flex flex-1 flex-col">
                  <h3 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>{step.title}</h3>
                  {/* min-h reserva 2 linhas: sem isso os destaques mais longos quebram e desalinham as descrições entre as colunas */}
                  <p className="mt-1 text-xs font-semibold leading-4 text-orange md:min-h-8">{step.example}</p>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--th-muted)" }}>{step.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={400}>
          <div className="mt-14 flex flex-col items-center gap-3 text-center">
            <p className="text-sm" style={{ color: "var(--th-muted)" }}>Pronto para começar?</p>
            <div className="flex flex-wrap justify-center gap-3">
              {["Gratuito para sempre", "Sem anúncios", "Web · Android · iOS"].map((label) => (
                <span
                  key={label}
                  style={{ borderColor: "var(--th-border)", background: "var(--th-surface)", color: "var(--th-muted)" }}
                  className="rounded-full border px-4 py-1.5 text-sm"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
