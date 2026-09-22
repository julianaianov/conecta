import Link from "next/link";
import { timeAgo } from "@/lib/app/format";
import type { Post } from "@/lib/app/types";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { StatusBadge, TypeBadge } from "../ui";

export function PublicPostCard({ post }: { post: Post }) {
  const profileHref = post.authorId ? `/perfil/${encodeURIComponent(post.authorId)}` : null;
  const postHref = `/post/${encodeURIComponent(post.id)}`;
  const cover = post.images?.[0];

  return (
    <article className="app-card overflow-hidden rounded-2xl" style={{ boxShadow: "0 4px 16px rgba(13,45,66,0.05)" }}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          {profileHref ? (
            <Link href={profileHref} aria-label={`Ver perfil de ${post.authorName}`}>
              <Avatar name={post.authorName} src={post.authorAvatar} id={post.authorId} size={34} />
          </Link>
          ) : <Avatar name={post.authorName} src={post.authorAvatar} size={42} />}
          <div className="min-w-0 flex-1">
            {profileHref ? (
              <Link href={profileHref} className="block truncate text-sm font-bold hover:underline" style={{ color: "var(--th-text)" }}>
                {post.authorName}
              </Link>
            ) : <p className="truncate text-sm font-bold" style={{ color: "var(--th-text)" }}>{post.authorName}</p>}
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--th-muted)" }}>
              <span>Responsável</span><span>·</span>
              <span>{timeAgo(post.createdAt)}</span>
              {post.neighborhood && <><span>·</span><Icon name="location" size={12} /><span className="truncate">{post.neighborhood}</span></>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1"><TypeBadge type={post.type} /><StatusBadge status={post.status} /></div>
        </div>

        <Link href={postHref} className="block">
          <h2 className="mt-3 text-[17px] font-bold leading-snug" style={{ color: "var(--th-text)" }}>{post.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed clamp-3" style={{ color: "var(--th-muted)" }}>{post.description}</p>
        </Link>

        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>#{tag}</span>)}
          </div>
        )}
      </div>

      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt={post.title} className="max-h-72 w-full object-cover" />
      )}

      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2 text-sm" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}>
        <Link href={postHref} className="inline-flex items-center gap-1.5 font-semibold hover:underline"><Icon name="comment" size={17} /> {post.commentsCount} atualizações</Link>
        <span className="inline-flex items-center gap-1.5"><Icon name="eye" size={17} /> {post.viewsCount} visualizações</span>
        <Link href={postHref} className="ml-auto inline-flex items-center gap-1.5 font-bold" style={{ color: "#2e7ba8" }}><Icon name="map" size={16} /> Acompanhar sinal</Link>
        <Link href={`${postHref}/apoiar`} className="inline-flex items-center gap-1.5 font-bold" style={{ color: "#f4841a" }}><Icon name="volunteer" size={16} /> Registrar apoio</Link>
      </div>
    </article>
  );
}
