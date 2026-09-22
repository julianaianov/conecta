"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loginHref } from "@/lib/app/access";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate, timeAgo } from "@/lib/app/format";
import { normalizeCoordinates, type Coordinates } from "@/lib/app/location";
import {
  allowedSupportTypes,
  POST_STATUS_LABELS,
  type Comment,
  type Post,
  type PostStatus,
  type SupportSummaryItem,
} from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Card, StatusBadge, SupportPill, TypeBadge } from "../ui";

const LocationPicker = dynamic(
  () => import("../LocationPicker").then((module) => module.LocationPicker),
  { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-xl" style={{ background: "var(--th-card-alt)" }} /> },
);

const STATUS_OPTIONS: PostStatus[] = ["active", "in_progress", "resolved", "cancelled"];

export function PostDetailClient({
  initialPost,
  initialComments,
  initialSupports,
}: {
  initialPost: Post;
  initialComments: Comment[];
  initialSupports: { summary: SupportSummaryItem[]; supports: PublicSupport[] };
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [post, setPost] = useState(initialPost);
  const [comments, setComments] = useState(initialComments);
  const [supports] = useState(initialSupports);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reactions, setReactions] = useState(initialPost.reactionsCount);
  const [reacted, setReacted] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(() => normalizeCoordinates(initialPost.latitude, initialPost.longitude));
  const [savingLocation, setSavingLocation] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const postHref = `/post/${encodeURIComponent(post.id)}`;
  const profileHref = `/perfil/${encodeURIComponent(post.authorId)}`;
  const returnTo = pathname || postHref;
  const supportTypes = allowedSupportTypes(user?.role, user?.profileType);
  const onlyShares = supportTypes.length === 1 && supportTypes[0] === "sharing";
  const isAuthor = user?.id === post.authorId;

  async function sendComment() {
    if (!user || !draft.trim()) return;
    setSending(true);
    try {
      const comment = await api.addComment(post.id, user, draft.trim());
      setComments((current) => [...current, comment]);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  async function toggleReaction() {
    if (!user) return;
    const next = !reacted;
    setReacted(next);
    setReactions((current) => current + (next ? 1 : -1));
    try {
      const result = await api.toggleReaction(post.id);
      setReactions(result.reactions_count);
    } catch {
      setReacted(!next);
      setReactions((current) => current + (next ? -1 : 1));
    }
  }

  async function changeStatus(status: PostStatus) {
    if (!isAuthor || status === post.status) {
      setStatusMenuOpen(false);
      return;
    }
    setStatusMenuOpen(false);
    setActionError(null);
    try {
      const updated = await api.updatePostStatus(post.id, status);
      if (updated) setPost(updated);
    } catch {
      setActionError("Não foi possível atualizar o status agora.");
    }
  }

  async function saveLocation() {
    if (!isAuthor || savingLocation) return;
    setSavingLocation(true);
    setActionError(null);
    try {
      const updated = await api.updatePostLocation(post.id, coordinates?.latitude ?? null, coordinates?.longitude ?? null);
      if (updated) {
        setPost(updated);
        setCoordinates(normalizeCoordinates(updated.latitude, updated.longitude));
        setEditingLocation(false);
      }
    } catch {
      setActionError("Não foi possível atualizar o ponto no mapa agora.");
    } finally {
      setSavingLocation(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card padded={false} className="overflow-hidden">
        {post.videos?.[0] ? <video src={post.videos[0]} poster={post.images?.[0]} controls playsInline preload="metadata" className="max-h-80 w-full bg-black object-cover" /> : post.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.images[0]} alt={post.title} className="max-h-80 w-full object-cover" />
        ) : null}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={post.type} />
            <StatusBadge status={post.status} />
            {isAuthor && (
              <div className="relative ml-auto">
                <Button type="button" variant="outline" size="sm" icon="edit" onClick={() => setStatusMenuOpen((open) => !open)} aria-expanded={statusMenuOpen}>
                  Atualizar status
                </Button>
                {statusMenuOpen && (
                  <div className="absolute right-0 top-full z-10 mt-2 min-w-44 rounded-xl border p-1.5 shadow-lg" style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}>
                    {STATUS_OPTIONS.map((status) => (
                      <button key={status} type="button" onClick={() => changeStatus(status)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[var(--th-card-alt)]" style={{ color: "var(--th-text)" }}>
                        {POST_STATUS_LABELS[status]}
                        {status === post.status && <Icon name="check" size={15} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-bold leading-tight" style={{ color: "var(--th-text)" }}>{post.title}</h1>
          <div className="mt-3 flex items-center gap-3"><Link href={profileHref}><Avatar name={post.authorName} src={post.authorAvatar} id={post.authorId} size={40} /></Link><div><Link href={profileHref} className="text-sm font-bold hover:underline" style={{ color: "var(--th-text)" }}>{post.authorName}</Link><p className="text-xs" style={{ color: "var(--th-muted)" }}>{formatDate(post.createdAt)}{post.neighborhood ? ` · ${post.neighborhood}` : ""}</p></div></div>
          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed" style={{ color: "var(--th-text)" }}>{post.description}</p>
          {post.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{post.tags.map((tag) => <span key={tag} className="rounded-md px-2 py-1 text-xs font-semibold" style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>#{tag}</span>)}</div>}
          <div className="mt-5 flex flex-wrap items-center gap-3 border-y py-2 text-sm" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}>
            {user ? (
              <button type="button" onClick={toggleReaction} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold transition-colors hover:bg-[var(--th-card-alt)]" style={{ color: reacted ? "#f4841a" : "var(--th-muted)" }} aria-label={reacted ? "Remover sinal de apoio" : "Sinalizar apoio"}>
                <Icon name="volunteer" size={16} strokeWidth={reacted ? 2.5 : 1.9} /> {reactions} sinais de apoio
              </button>
            ) : (
              <Link href={loginHref(returnTo)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold hover:bg-[var(--th-card-alt)]"><Icon name="volunteer" size={16} /> {reactions} sinais de apoio</Link>
            )}
            <span className="inline-flex items-center gap-1.5"><Icon name="comment" size={16} /> {comments.length} atualizações</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="eye" size={16} /> {post.viewsCount} visualizações</span>
          </div>
          {supports.summary.length > 0 && <div className="mt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Formas de apoio já registradas</p><div className="flex flex-wrap gap-2">{supports.summary.map((item) => <SupportPill key={item.type} type={item.type} count={item.count} />)}</div></div>}
          <div className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Ponto no território</p>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--th-text)" }}>{post.latitude != null && post.longitude != null ? `${post.neighborhood || "Território"}${post.city ? ` · ${post.city}` : ""}` : "Este registro ainda não possui localização pública."}</p>
              </div>
              {isAuthor && !editingLocation && <Button type="button" variant="ghost" size="sm" icon="edit" onClick={() => setEditingLocation(true)}>Editar ponto</Button>}
            </div>
            {editingLocation ? (
              <div className="mt-3 space-y-3">
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>Escolha um ponto aproximado para orientar a próxima ação.</p>
                <LocationPicker value={coordinates} onChange={setCoordinates} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setCoordinates(normalizeCoordinates(post.latitude, post.longitude)); setEditingLocation(false); }}>Cancelar</Button>
                  <Button type="button" size="sm" icon="check" loading={savingLocation} onClick={saveLocation}>Salvar ponto</Button>
                </div>
              </div>
            ) : <Link href="/mapa" className="mt-2 inline-flex text-sm font-bold" style={{ color: "#f4841a" }}>Explorar o mapa →</Link>}
          </div>
          {actionError && <p className="mt-3 text-sm font-semibold" style={{ color: "#d64545" }}>{actionError}</p>}
          {user && supportTypes.length > 0 ? <Link href={onlyShares ? `${postHref}/apoiar?type=sharing` : `${postHref}/apoiar`} className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl font-bold text-white" style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)" }}><Icon name={onlyShares ? "share" : "volunteer"} size={18} /> {onlyShares ? "Divulgar sinal" : "Registrar apoio"}</Link> : user ? <p className="mt-5 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}>Seu perfil pode acompanhar este registro, mas não possui uma forma de apoio disponível.</p> : <div className="mt-5"><AuthPrompt action="registrar apoio" returnTo={`${postHref}/apoiar`} /></div>}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Atualizações do acompanhamento</h2>
        <div className="mt-3">{user ? <div className="flex items-start gap-2.5"><Avatar name={user.name} src={user.avatarUrl} id={user.id} size={36} /><div className="flex-1"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Registre uma atualização ou informação útil..." className="app-textarea" /><div className="mt-2 flex justify-end"><button type="button" onClick={sendComment} disabled={!draft.trim() || sending} className="rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: "#f4841a" }}>{sending ? "Enviando…" : "Registrar atualização"}</button></div></div></div> : <AuthPrompt action="registrar uma atualização" returnTo={returnTo} />}</div>
        <div className="mt-5 space-y-4">{comments.length === 0 ? <p className="py-3 text-center text-sm" style={{ color: "var(--th-muted)" }}>Ainda não há atualizações neste acompanhamento.</p> : comments.map((comment) => <div key={comment.id} className="flex gap-2.5 border-l-2 pl-3" style={{ borderColor: "#2e7ba8" }}><Avatar name={comment.authorName} id={comment.authorId} size={36} /><div><div className="flex items-baseline gap-2"><span className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{comment.authorName}</span><span className="text-xs" style={{ color: "var(--th-muted)" }}>{timeAgo(comment.createdAt)}</span></div><p className="mt-0.5 text-sm" style={{ color: "var(--th-text)" }}>{comment.content}</p></div></div>)}</div>
      </Card>
    </div>
  );
}

interface PublicSupport {
  id: string;
  type: SupportSummaryItem["type"];
  createdAt: string;
}
