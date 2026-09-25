import { FLOW_ROLES, STEPS } from "@/lib/constants";
import { AppImage } from "./AppImage";
import { Reveal } from "./Reveal";

export function Steps() {
  return (
    <section id="como-funciona" className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <Reveal>
          <div className="mx-auto mb-16 max-w-xl text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-orange">
              Como funciona
            </span>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl" style={{ color: "var(--th-text)" }}>
              Fluxo principal do DM Conecta
              <br />
              <span className="gradient-text">da demanda ao impacto, em 9 etapas</span>
            </h2>
            <ul className="mt-4 space-y-1 text-sm" style={{ color: "var(--th-muted)" }}>
              {FLOW_ROLES.map((role) => (
                <li key={role}>{role}</li>
              ))}
            </ul>
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
                  {/* véu leve: as imagens agora são telas do app (claras), o degradê forte de foto escurecia a UI */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />

                  <div
                    style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
                    className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border font-mono text-sm font-bold text-orange backdrop-blur-sm"
                  >
                    {step.number}
                  </div>
                </div>

                <div className="flex flex-1 flex-col">
                  <h3 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>{step.title}</h3>
                  <ol className="mt-3 space-y-3">
                    {step.stages.map((stage) => (
                      <li key={stage.number} className="text-sm leading-relaxed" style={{ color: "var(--th-muted)" }}>
                        <span className="font-semibold text-orange">
                          <span className="font-mono">{stage.number}</span> · {stage.name}
                        </span>
                        <br />
                        {stage.description}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={400}>
          <div className="mt-14 flex flex-col items-center gap-3 text-center">
            <p className="text-sm" style={{ color: "var(--th-muted)" }}>Pronto para começar?</p>
            <div className="flex flex-wrap justify-center gap-3">
              {["Gratuito para sempre", "Sem anúncios", "Web · Android"].map((label) => (
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
