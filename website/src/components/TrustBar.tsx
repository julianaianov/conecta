import { TRUST_ROLES } from "@/lib/constants";
import { COMMUNITY_GRID, TRUST_ROLE_IMAGES } from "@/lib/images";
import { AppImage } from "./AppImage";
import { Reveal } from "./Reveal";

export function TrustBar() {
  return (
    <section className="border-y border-white/5 bg-navy-light/30 py-10">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <Reveal>
          <div className="mb-8 flex justify-center gap-2 overflow-hidden">
            {COMMUNITY_GRID.map((community, i) => (
              <div
                key={community.id}
                className={`relative overflow-hidden rounded-xl border border-white/10 ${
                  i === 0 ? "h-16 w-28 sm:h-20 sm:w-36" : "hidden h-16 w-24 sm:block sm:h-20 sm:w-28"
                }`}
              >
                <AppImage
                  src={community.src}
                  alt={community.name}
                  fill
                  className="object-cover"
                  sizes="144px"
                />
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={50}>
          <p className="mb-6 text-center text-sm uppercase tracking-widest text-blue-muted">
            Feito para quem transforma o bairro
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {TRUST_ROLES.map((role) => {
              const img = TRUST_ROLE_IMAGES[role as keyof typeof TRUST_ROLE_IMAGES];
              return (
                <span
                  key={role}
                  className="inline-flex items-center gap-2.5 rounded-full border border-steel/20 bg-steel/10 py-2 pl-2 pr-5 text-sm font-medium text-white/80 transition-colors hover:border-orange/30 hover:text-white"
                >
                  {img && (
                    <AppImage
                      src={img}
                      alt={role}
                      width={28}
                      height={28}
                      className="h-7 w-7 rounded-full object-cover ring-1 ring-white/20"
                    />
                  )}
                  {role}
                </span>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
