import { APP_URL, COMMUNITY_BENEFITS } from "@/lib/constants";
import { DEMO_COMMUNITIES, DEMO_PROFILES, IMAGES } from "@/lib/images";
import { AppImage } from "./AppImage";
import { Button } from "./Navbar";
import { Reveal } from "./Reveal";

export function Community() {
  return (
    <section id="comunidade" className="py-24 lg:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <Reveal>
          <div className="relative mb-8 grid grid-cols-2 gap-3 lg:mb-0">
            {DEMO_COMMUNITIES.map((community, i) => (
              <div
                key={community.id}
                className={`relative overflow-hidden rounded-2xl border border-white/10 ${
                  i === 0 ? "col-span-2 h-44" : "h-28"
                }`}
              >
                <AppImage
                  src={community.image}
                  alt={`${community.name} — ${community.description}`}
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                  sizes="(max-width: 1024px) 50vw, 400px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy/80 to-transparent" />
                <p className="absolute bottom-2 left-3 right-3 text-xs font-semibold text-white">
                  {community.name}
                </p>
              </div>
            ))}
            <div className="absolute -bottom-4 -right-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-navy-light/95 px-3 py-2 shadow-xl backdrop-blur-md sm:-right-4">
              <div className="flex -space-x-2">
                {DEMO_PROFILES.slice(0, 3).map((profile) => (
                  <AppImage
                    key={profile.id}
                    src={profile.avatar}
                    alt={profile.name}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full border-2 border-navy object-cover"
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-white">+120 no bairro</span>
            </div>
          </div>

          <span className="text-sm font-semibold uppercase tracking-widest text-orange">
            Comunidades
          </span>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Grupos do demo
            <br />
            no seu bairro
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-blue-muted">
            Moradores do bairro, Mutirão Bairro Verde, Ciclistas da Orla e Feira de
            Sustentabilidade — os mesmos grupos do app.
          </p>

          <ul className="mt-8 space-y-4">
            {COMMUNITY_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-white/90">
                <CheckIcon />
                {benefit}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={150}>
          <div className="relative overflow-hidden rounded-3xl border border-white/10">
            <AppImage
              src={IMAGES.communityCta}
              alt="Horta comunitária do bairro — projeto demo do dmconecta"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-navy/95 via-navy/85 to-steel/70" />
            <div className="relative p-8 lg:p-10">
              <h3 className="text-2xl font-bold text-white">Comece agora</h3>
              <p className="mt-2 text-blue-muted">
                Entre com a conta demo do bairro ou crie a sua
              </p>

              <div className="mt-8 space-y-4">
                <Button href={`${APP_URL}/register`} block size="lg">
                  Abrir plataforma web
                </Button>

                <div className="grid gap-3 sm:grid-cols-2">
                  <StoreButton label="Google Play" icon="play" ariaLabel="Google Play (em breve)" />
                  <StoreButton label="App Store" icon="apple" ariaLabel="App Store (em breve)" />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-orange" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function StoreButton({
  label,
  icon,
  ariaLabel,
}: {
  label: string;
  icon: "play" | "apple";
  ariaLabel: string;
}) {
  return (
    <a
      href="#"
      aria-label={ariaLabel}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-white/20 hover:bg-white/10"
    >
      {icon === "play" ? <PlayStoreIcon /> : <AppStoreIcon />}
      <div>
        <small className="block text-[10px] uppercase tracking-wide text-blue-muted">Em breve</small>
        <strong className="text-sm text-white">{label}</strong>
      </div>
    </a>
  );
}

function PlayStoreIcon() {
  return (
    <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.15L13.69 12L3.84 21.85C3.34 21.6 3 21.09 3 20.5Z" />
    </svg>
  );
}

function AppStoreIcon() {
  return (
    <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.82-3.29-.82-1.52 0-1.99.82-3.26.86-1.31.05-2.3-1.32-3.14-2.53-1.71-2.47-3.02-7.02-1.26-10.08.88-1.52 2.44-2.48 4.13-2.51 1.28-.02 2.5.87 3.29.87.79 0 2.27-.89 3.55-.85 1.65.03 3.21 1.06 4.08 2.78-3.6 2.07-3.02 7.9 1.05 9.87-.03.07-2.41 1.44-3.5 2.71Z" />
    </svg>
  );
}
