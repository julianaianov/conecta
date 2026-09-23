import Link from "next/link";
import type { ReactNode } from "react";
import { timeAgo } from "@/lib/app/format";
import { POST_TYPE_COLORS, type Post } from "@/lib/app/types";
import { signalPath, territoryLabel, themeLabels, updatesLabel, type NextStep } from "@/lib/app/signal";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { StatusBadge, TypeBadge } from "../ui";

/**
 * Card de sinal do pulso, compartilhado pela versão logada (`PostCard`) e pela
 * de visitante (`PublicPostCard`). Hierarquia: tipo e status, território,
 * título e descrição, temas, próximo passo; o responsável, as atualizações e a
 * marcação de relevância ficam no rodapé, como contexto.
 *
 * O título é um link "esticado" (`after:inset-0`) que cobre o card inteiro;
 * os demais controles ficam acima dele (`relative z-10`) e continuam
 * alcançáveis por teclado.
 */
export function SignalCardLayout({
  post,
  nextStep,
  relevance,
}: {
  post: Post;
  nextStep: NextStep;
  /** Controle (logado) ou texto (visitante) da marcação de relevância. */
  relevance?: ReactNode;
}) {
  const postHref = signalPath(post);
  const territory = territoryLabel(post);
  const themes = themeLabels(post.tags);
  const cover = post.images?.[0];
  const video = post.videos?.[0];
  const typeColor = POST_TYPE_COLORS[post.type] ?? "#1b4f72";
  const profileHref = post.authorId ? `/perfil/${encodeURIComponent(post.authorId)}` : null;
  const showDemandLink = !!post.demandId && !nextStep.href.startsWith("/demandas/");

  return (
    <article
      className="app-card relative overflow-hidden rounded-2xl transition-shadow hover:shadow-md"
      style={{ boxShadow: "0 4px 16px rgba(13,45,66,0.05)", borderLeft: `4px solid ${typeColor}` }}
    >
      <div className="p-4 sm:p-5">
        {/* tipo, status e território na mesma leitura */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <TypeBadge type={post.type} />
          <StatusBadge status={post.status} />
          {territory ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold" style={{ color: "var(--th-text)" }}>
              <Icon name="location" size={13} />
              <span className="truncate">{territory}</span>
            </span>
          ) : null}
          <time dateTime={post.createdAt} className="ml-auto shrink-0 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
            {timeAgo(post.createdAt)}
          </time>
        </div>

        <h2 className="mt-3 text-[17px] font-bold leading-snug" style={{ color: "var(--th-text)", letterSpacing: "-0.01em" }}>
          <Link href={postHref} className="signal-focus after:absolute after:inset-0 after:content-[''] hover:underline">
            {post.title}
          </Link>
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed clamp-3" style={{ color: "var(--th-muted)" }}>{post.description}</p>

        {themes.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Temas do sinal">
            {themes.map((theme) => (
              <li
                key={theme}
                className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)", color: "var(--th-text)" }}
              >
                {theme}
              </li>
            ))}
          </ul>
        )}
      </div>

      {video ? (
        <video
          src={video}
          poster={cover}
          controls
          playsInline
          preload="metadata"
          className="relative z-10 max-h-72 w-full bg-black object-cover"
        />
      ) : (
        cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="max-h-72 w-full object-cover" />
        )
      )}

      {/* próximo passo: a ação que orienta a participação */}
      <div className="border-t px-4 py-3 sm:px-5" style={{ borderColor: "var(--th-border)" }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--th-muted)" }}>Próximo passo</p>
        <div className="mt-1.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm" style={{ color: "var(--th-text)" }}>{nextStep.hint}</p>
          <div className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-2">
            {showDemandLink && (
              <Link
                href={`/demandas/${encodeURIComponent(post.demandId as string)}`}
                className="signal-focus inline-flex items-center gap-1.5 text-sm font-bold hover:underline"
                style={{ color: "var(--th-link)" }}
              >
                <Icon name="inventory" size={15} /> Ver a demanda estruturada
              </Link>
            )}
            <Link
              href={nextStep.href}
              className="signal-action signal-focus inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold"
            >
              <Icon name={nextStep.icon} size={16} /> {nextStep.label}
            </Link>
          </div>
        </div>
      </div>

      {/* contexto: responsável, atualizações e relevância */}
      <footer
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-2.5 text-xs sm:px-5"
        style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span>Responsável</span>
          {profileHref ? (
            <Link href={profileHref} className="signal-focus relative z-10 inline-flex min-w-0 items-center gap-1.5 font-semibold hover:underline" style={{ color: "var(--th-text)" }}>
              <Avatar name={post.authorName} src={post.authorAvatar} id={post.authorId} size={20} />
              <span className="truncate">{post.authorName}</span>
            </Link>
          ) : (
            <span className="truncate font-semibold" style={{ color: "var(--th-text)" }}>{post.authorName}</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="clock" size={14} /> {updatesLabel(post.commentsCount)}
        </span>
        {relevance ? <span className="relative z-10 sm:ml-auto">{relevance}</span> : null}
      </footer>
    </article>
  );
}
