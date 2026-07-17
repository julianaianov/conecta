import { BANNER_FEATURES } from "@/lib/banner-data";
import { Icon, type IconName } from "./app/Icon";
import { Reveal } from "./Reveal";

/** Mapeia os ícones do banner para o conjunto unificado do app (Manual §02). */
const FEATURE_ICONS: Record<string, IconName> = {
  map: "map",
  feed: "megaphone",
  support: "volunteer",
  shield: "shield",
};

export function BannerFeatures() {
  return (
    <section id="recursos" className="py-10 lg:py-14">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <Reveal>
          <div
            style={{ background: "var(--th-card-alt)", borderColor: "var(--th-border)" }}
            className="overflow-hidden rounded-2xl border"
          >
            <div className="grid grid-cols-2 lg:grid-cols-4">
              {BANNER_FEATURES.map((feature, i) => (
                <article
                  key={feature.title}
                  style={{ borderColor: "var(--th-border)" }}
                  className={[
                    "group relative flex flex-col items-center px-6 py-8 text-center transition-colors hover:bg-black/[0.02]",
                    i < 2 ? "border-b lg:border-b-0" : "",
                    i % 2 === 0 ? "border-r" : "",
                    i < 3 ? "lg:border-r" : "lg:border-r-0",
                  ].filter(Boolean).join(" ")}
                >
                  <div
                    style={{ background: "var(--th-surface)", borderColor: "var(--th-border)" }}
                    className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:border-orange/40 group-hover:bg-orange/10 group-hover:shadow-lg group-hover:shadow-orange/20 group-active:translate-y-0 group-active:scale-95 sm:h-14 sm:w-14 lg:h-16 lg:w-16"
                  >
                    <Icon
                      name={FEATURE_ICONS[feature.icon]}
                      className="h-6 w-6 transition-transform duration-300 ease-out group-hover:scale-110 sm:h-7 sm:w-7 lg:h-8 lg:w-8"
                      style={{ color: "#f4841a" }}
                    />
                  </div>
                  <h3
                    className="text-xs font-extrabold uppercase tracking-wide sm:text-sm"
                    style={{ color: feature.titleColor }}
                  >
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed sm:text-sm" style={{ color: "var(--th-muted)" }}>
                    {feature.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
