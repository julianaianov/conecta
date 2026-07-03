"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/app/api";
import { timeAgo } from "@/lib/app/format";
import type { Post } from "@/lib/app/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { TypeBadge, StatusBadge } from "./ui";

export function PostCard({ post }: { post: Post }) {
  const router = useRouter();
  const [reactions, setReactions] = useState(post.reactionsCount);
  const [liked, setLiked] = useState(false);
  const cover = post.images?.[0];

  async function toggleLike(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !liked;
    setLiked(next);
    setReactions((r) => r + (next ? 1 : -1));
    try {
      await api.toggleReaction(post.id);
    } catch {
      setLiked(!next);
      setReactions((r) => r + (next ? -1 : 1));
    }
  }

  return (
    <article
      className="app-card cursor-pointer overflow-hidden rounded-2xl transition-shadow hover:shadow-md"
      style={{ boxShadow: "0 4px 16px rgba(13,45,66,0.05)" }}
      onClick={() => router.push(`/post/${post.id}`)}
    >
      <div className="p-4 sm:p-5">
        {/* cabeçalho */}
        <div className="flex items-center gap-3">
          <Link href={`/perfil/${post.authorId}`} onClick={(e) => e.stopPropagation()}>
            <Avatar name={post.authorName} src={post.authorAvatar} id={post.authorId} size={42} />
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/perfil/${post.authorId}`} onClick={(e) => e.stopPropagation()} className="block truncate text-sm font-bold hover:underline" style={{ color: "var(--th-text)" }}>
              {post.authorName}
            </Link>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--th-muted)" }}>
              <span className="font-numeric">{timeAgo(post.createdAt)}</span>
              {post.neighborhood && (
                <>
                  <span>·</span>
                  <Icon name="location" size={12} />
                  <span className="truncate">{post.neighborhood}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <TypeBadge type={post.type} />
            <StatusBadge status={post.status} />
          </div>
        </div>

        {/* corpo */}
        <h2 className="mt-3 text-[17px] font-bold leading-snug" style={{ color: "var(--th-text)", letterSpacing: "-0.01em" }}>{post.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed clamp-3" style={{ color: "var(--th-muted)" }}>{post.description}</p>

        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>#{t}</span>
            ))}
          </div>
        )}
      </div>

      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt={post.title} className="max-h-72 w-full object-cover" />
      )}

      {/* rodapé */}
      <div className="flex items-center gap-1 border-t px-2 py-1.5" style={{ borderColor: "var(--th-border)" }}>
        <ActionButton icon="heart" label={String(reactions)} active={liked} onClick={toggleLike} />
        <ActionButton icon="comment" label={String(post.commentsCount)} onClick={(e) => { e.stopPropagation(); router.push(`/post/${post.id}`); }} />
        <ActionButton icon="eye" label={String(post.viewsCount)} muted />
        <Link
          href={`/post/${post.id}/apoiar`}
          onClick={(e) => e.stopPropagation()}
          className="ml-auto mr-1 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)" }}
        >
          <Icon name="volunteer" size={16} /> Apoiar
        </Link>
      </div>
    </article>
  );
}

function ActionButton({ icon, label, active, muted, onClick }: { icon: "heart" | "comment" | "eye"; label: string; active?: boolean; muted?: boolean; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-[var(--th-card-alt)]"
      style={{ color: active ? "#e53935" : "var(--th-muted)", cursor: muted ? "default" : "pointer" }}
    >
      <Icon name={icon} size={17} fill={active} strokeWidth={active ? 0 : 1.9} />
      <span className="font-numeric">{label}</span>
    </button>
  );
}
