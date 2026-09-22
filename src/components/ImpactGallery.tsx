import Link from "next/link";
import { APP_URL } from "@/lib/constants";
import { POST_TYPE_COLORS, POST_TYPE_LABELS, type Post } from "@/lib/app/types";
import { AppImage } from "./AppImage";
import { Reveal } from "./Reveal";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Data não informada" : date.toLocaleDateString("pt-BR");
}

export function ImpactGallery({ posts }: { posts: Post[] }) {
  return (
    <section id="publicacoes" className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <Reveal>
          <div className="mb-12 flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-orange/30 bg-orange/10 px-4 py-1.5 text-sm font-medium text-orange">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange" />
                Sinais públicos da plataforma
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

        {posts.length === 0 ? (
          <div
            className="rounded-2xl border p-8 text-center text-sm"
            style={{ background: "var(--th-card)", borderColor: "var(--th-border)", color: "var(--th-muted)" }}
          >
            Nenhuma publicação pública está disponível neste momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, i) => {
              const image = post.images[0] ?? null;
              const typeColor = POST_TYPE_COLORS[post.type];
            return (
              <Reveal key={post.id} delay={i * 65}>
                <article
                  style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
                  className="group flex flex-col overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:border-orange/30 hover:shadow-lg"
                >
                  <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight" style={{ color: "var(--th-text)" }}>
                        {post.authorName}
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--th-muted)" }}>{formatDate(post.createdAt)}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white"
                      style={{ backgroundColor: typeColor }}
                    >
                      {POST_TYPE_LABELS[post.type]}
                    </span>
                  </div>

                  {image && (
                    <div className="relative h-44 overflow-hidden">
                      <AppImage
                        src={image}
                        alt={post.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  )}

                  {/* Body */}
                  <div className="flex-1 px-4 py-3">
                    <h3 className="font-semibold leading-snug" style={{ color: "var(--th-text)" }}>{post.title}</h3>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>
                      {[post.neighborhood, post.city].filter(Boolean).join(" · ") || "Localização não informada"}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="mx-4 mb-4 flex items-center pt-3" style={{ borderTop: "1px solid var(--th-border)" }}>
                    <button
                      type="button"
                      style={{ color: "var(--th-muted)" }}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-orange/10 hover:text-orange"
                    >
                      <SupportIcon />
                      {post.reactionsCount} reações · {post.commentsCount} comentários
                    </button>
                    <div className="flex-1" />
                    <Link
                      href={`${APP_URL}/post/${encodeURIComponent(post.id)}`}
                      style={{ color: "var(--th-muted)" }}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:text-orange"
                    >
                      Abrir sinal <ArrowIcon />
                    </Link>
                  </div>
                </article>
              </Reveal>
            );
            })}
          </div>
        )}

        <Reveal delay={250}>
          <div className="mt-8 text-center sm:hidden">
            <Link
              href={`${APP_URL}/feed`}
              style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}
              className="inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-medium transition-all hover:border-orange/40 hover:text-orange"
            >
              Ver mais sinais <ArrowIcon />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SupportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20.5c1.9-1.8 8-5.9 8-11A4.5 4.5 0 0 0 12 6.8 4.5 4.5 0 0 0 4 9.5c0 5.1 6.1 9.2 8 11Z" />
      <path d="M12 6.8V3M9.5 5.2 12 3l2.5 2.2" />
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
