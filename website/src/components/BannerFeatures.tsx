import { BANNER_FEATURES } from "@/lib/banner-data";
import { FeatureIcon } from "./FeatureIcon";
import { Reveal } from "./Reveal";

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
                    className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border transition-all group-hover:border-orange/30"
                  >
                    <FeatureIcon name={feature.icon} accent={feature.icon === "map"} className="h-7 w-7" />
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
