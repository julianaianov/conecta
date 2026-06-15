import { FEATURES } from "@/lib/constants";

import { AppImage } from "./AppImage";

import { FeatureIcon } from "./FeatureIcon";

import { Reveal } from "./Reveal";



export function Features() {

  return (

    <section id="recursos" className="py-24 lg:py-32">

      <div className="mx-auto max-w-6xl px-5 lg:px-8">

        <Reveal>

          <div className="mx-auto mb-16 max-w-2xl text-center">

            <span className="text-sm font-semibold uppercase tracking-widest text-orange">

              Recursos

            </span>

            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">

              Tudo que seu bairro precisa,

              <br />

              em uma plataforma

            </h2>

            <p className="mt-4 text-lg text-blue-muted">

              Do problema à solução — conectamos pessoas, recursos e ações com

              tecnologia simples e poderosa.

            </p>

          </div>

        </Reveal>



        <div className="features-bento grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

          {FEATURES.map((feature, i) => (

            <Reveal key={feature.title} delay={i * 80}>

              <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-navy-light/40 backdrop-blur-sm transition-all duration-300 hover:border-steel/30 hover:bg-navy-light/60">

                {"image" in feature && feature.image && (

                  <div className="relative h-36 overflow-hidden">

                    <AppImage

                      src={feature.image}

                      alt={feature.title}

                      fill

                      className="object-cover transition-transform duration-500 group-hover:scale-105"

                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"

                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-navy-light/90 via-navy-light/20 to-transparent" />
                    {"caption" in feature && feature.caption && (
                      <p className="absolute bottom-2 left-3 right-3 text-[11px] font-medium text-white/90">
                        {feature.caption}
                      </p>
                    )}
                  </div>

                )}



                <div className="flex flex-1 flex-col p-6 lg:p-8">

                  <div

                    className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${

                      feature.accent ? "bg-orange/15" : "bg-steel/15"

                    }`}

                  >

                    <FeatureIcon name={feature.icon} accent={feature.accent} />

                  </div>



                  <h3 className="text-xl font-bold text-white">{feature.title}</h3>

                  <p className="mt-3 leading-relaxed text-blue-muted">{feature.description}</p>



                  {"tags" in feature && feature.tags && (

                    <div className="mt-5 flex flex-wrap gap-2">

                      {feature.tags.map((tag) => (

                        <span

                          key={tag}

                          className="rounded-lg bg-steel/10 px-3 py-1 text-xs font-medium text-blue-muted"

                        >

                          {tag}

                        </span>

                      ))}

                    </div>

                  )}



                  {"roles" in feature && feature.roles && (

                    <div className="mt-5 flex flex-wrap gap-2">

                      {feature.roles.map((role, j) => (

                        <span

                          key={role}

                          className={`rounded-lg px-3 py-1 text-xs font-semibold ${

                            j === 0

                              ? "bg-steel/20 text-blue-light"

                              : j === 1

                                ? "bg-blue-light/20 text-blue-light"

                                : j === 2

                                  ? "bg-navy/40 text-blue-muted"

                                  : "bg-orange/20 text-orange-light"

                          }`}

                        >

                          {role}

                        </span>

                      ))}

                    </div>

                  )}

                </div>

              </article>

            </Reveal>

          ))}

        </div>

      </div>

    </section>

  );

}


