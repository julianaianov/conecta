import Link from "next/link";
import { APP_URL } from "@/lib/constants";
import { DEMO_POSTS, TYPE_COLORS, profileAvatar } from "@/lib/images";
import { AppImage } from "./AppImage";
import { Reveal } from "./Reveal";

const POST_TIMES = ["há 2h", "há 4h", "há 6h", "ontem", "há 3 dias", "há 1 sem"];

export function ImpactGallery() {
  return (
    <section id="publicacoes-demo" className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <Reveal>
          <div className="mb-12 flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-orange/30 bg-orange/10 px-4 py-1.5 text-sm font-medium text-orange">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange" />
                Feed · publicações de demonstração
              </span>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl" style={{ color: "var(--th-text)" }}>
                O que acontece
                <br />
                <span className="gradient-text">em cada bairro</span>
              </h2>
            </div>
            <Link
              href={`${APP_URL}/feed`}
              style={{ color: "var(--th-muted)" }}
              className="hidden shrink-0 items-center gap-1.5 text-sm transition-colors hover:text-orange sm:flex"
            >
              Ver tudo <ArrowIcon />
            </Link>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_POSTS.map((post, i) => {
            const m = post.meta.match(/^(\d+)/);
            const apoios = m ? m[1] : null;
            const avatar = profileAvatar(post.authorId);
            return (
              <Reveal key={post.id} delay={i * 65}>
                <article
                  style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
                  className="group flex flex-col overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:border-orange/30 hover:shadow-lg"
                >
                  {/* Author */}
                  <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                    <AppImage
                      src={avatar}
                      alt={post.author}
                      width={36}
                      height={36}
                      style={{ border: "1px solid var(--th-border)" }}
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight" style={{ color: "var(--th-text)" }}>
                        {post.author}
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--th-muted)" }}>{POST_TIMES[i]}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white"
                      style={{ backgroundColor: TYPE_COLORS[post.type] }}
                    >
                      {post.typeLabel}
                    </span>
                  </div>

                  {/* Image */}
                  <div className="relative h-44 overflow-hidden">
                    <AppImage
                      src={post.image}
                      alt={post.title}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>

                  {/* Body */}
                  <div className="flex-1 px-4 py-3">
                    <h3 className="font-semibold leading-snug" style={{ color: "var(--th-text)" }}>{post.title}</h3>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>{post.neighborhood}</p>
                  </div>

                  {/* Actions */}
                  <div className="mx-4 mb-4 flex items-center pt-3" style={{ borderTop: "1px solid var(--th-border)" }}>
                    <button
                      type="button"
                      style={{ color: "var(--th-muted)" }}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-orange/10 hover:text-orange"
                    >
                      <HeartIcon />
                      {apoios ? `${apoios} apoios` : "Apoiar"}
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      style={{ color: "var(--th-muted)" }}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:text-orange"
                    >
                      <ShareIcon />
                      Compartilhar
                    </button>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={250}>
          <div className="mt-8 text-center sm:hidden">
            <Link
              href={`${APP_URL}/feed`}
              style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}
              className="inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-medium transition-all hover:border-orange/40 hover:text-orange"
            >
              Ver mais publicações <ArrowIcon />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HeartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
