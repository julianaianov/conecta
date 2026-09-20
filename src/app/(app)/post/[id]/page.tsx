"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate, timeAgo } from "@/lib/app/format";
import { type Coordinates, normalizeCoordinates } from "@/lib/app/location";
import {
  POST_STATUS_LABELS, allowedSupportTypes, type Comment, type Post, type PostStatus,
  type SupportRecord, type SupportSummaryItem,
} from "@/lib/app/types";
import { Avatar } from "@/components/app/Avatar";
import { Icon } from "@/components/app/Icon";
import { Button } from "@/components/app/Button";
import { Card, EmptyState, StatusBadge, SupportPill, TypeBadge } from "@/components/app/ui";

const LocationPicker = dynamic(
  () => import("@/components/app/LocationPicker").then((mod) => mod.LocationPicker),
  { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-2xl" style={{ background: "var(--th-card-alt)" }} /> },
);

const STATUSES: PostStatus[] = ["active", "in_progress", "resolved", "cancelled"];

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const supportTypes = allowedSupportTypes(user?.role, user?.profileType);
  const onlyShares = supportTypes.length === 1 && supportTypes[0] === "sharing";
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [summary, setSummary] = useState<SupportSummaryItem[]>([]);
  const [supports, setSupports] = useState<SupportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reactions, setReactions] = useState(0);
  const [statusMenu, setStatusMenu] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api.getPost(id), api.listComments(id), api.postSupports(id)]).then(([p, c, s]) => {
      if (!alive) return;
      setPost(p);
      setCoordinates(normalizeCoordinates(p?.latitude, p?.longitude));
      setReactions(p?.reactionsCount ?? 0);
      setComments(c);
      setSummary(s.summary);
      setSupports(s.supports);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [id]);

  async function toggleLike() {
    if (!post) return;
    const next = !liked;
    setLiked(next);
    setReactions((r) => r + (next ? 1 : -1));
    try { await api.toggleReaction(post.id); } catch { setLiked(!next); setReactions((r) => r + (next ? -1 : 1)); }
  }

  async function sendComment() {
    if (!draft.trim() || !post || !user) return;
    setSending(true);
    try {
      const c = await api.addComment(post.id, user, draft.trim());
      setComments((list) => [...list, c]);
      setDraft("");
    } finally { setSending(false); }
  }

  async function changeStatus(s: PostStatus) {
    if (!post) return;
    setStatusMenu(false);
    const updated = await api.updatePostStatus(post.id, s);
    if (updated) setPost(updated);
  }

  async function saveLocation() {
    if (!post || !coordinates) return;
    setSavingLocation(true);
    setLocationFeedback(null);
    try {
      const updated = await api.updatePostLocation(post.id, coordinates.latitude, coordinates.longitude);
      if (updated) {
        setPost(updated);
        setCoordinates(normalizeCoordinates(updated.latitude, updated.longitude));
        setEditingLocation(false);
        setLocationFeedback("Localização atualizada com sucesso! Esta publicação agora está visível no mapa.");
      }
    } catch {
      setLocationFeedback("Não foi possível salvar a localização. Tente novamente.");
    } finally {
      setSavingLocation(false);
    }
  }

  function cancelEditLocation() {
    setEditingLocation(false);
    setCoordinates(normalizeCoordinates(post?.latitude, post?.longitude));
    setLocationFeedback(null);
  }

  if (loading) return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  if (!post) return <EmptyState icon="info" title="Publicação não encontrada" hint="Ela pode ter sido removida." />;

  const isAuthor = user?.id === post.authorId;
  const hasCoordinates = post.latitude != null && post.longitude != null;
  const cover = post.images?.[0];
  const video = post.videos?.[0];

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
        <Icon name="arrowLeft" size={18} /> Voltar
      </button>

      <Card padded={false} className="overflow-hidden">
        {video ? (
          <video src={video} poster={cover} controls playsInline preload="metadata" className="max-h-80 w-full bg-black object-cover" />
        ) : (
          cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={post.title} className="max-h-80 w-full object-cover" />
          )
        )}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={post.type} />
            <StatusBadge status={post.status} />
            {isAuthor && (
              <div className="relative ml-auto">
                <button onClick={() => setStatusMenu((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}>
                  Status <Icon name="chevronRight" size={13} className="rotate-90" />
                </button>
                {statusMenu && (
                  <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border shadow-xl" style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}>
                    {STATUSES.map((s) => (
                      <button key={s} onClick={() => changeStatus(s)} className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--th-card-alt)]" style={{ color: post.status === s ? "#f4841a" : "var(--th-text)" }}>
                        {POST_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <h1 className="mt-3 text-2xl font-bold leading-tight" style={{ color: "var(--th-text)", letterSpacing: "-0.02em" }}>{post.title}</h1>

          <div className="mt-3 flex items-center gap-3">
            <Link href={`/perfil/${post.authorId}`}><Avatar name={post.authorName} src={post.authorAvatar} id={post.authorId} size={40} /></Link>
            <div className="min-w-0">
              <Link href={`/perfil/${post.authorId}`} className="text-sm font-bold hover:underline" style={{ color: "var(--th-text)" }}>{post.authorName}</Link>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--th-muted)" }}>
                <span>{formatDate(post.createdAt)}</span>
                {post.neighborhood && <><span>·</span><Icon name="location" size={12} /><span>{post.neighborhood}</span></>}
              </div>
            </div>
          </div>

          <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed" style={{ color: "var(--th-text)" }}>{post.description}</p>

          {post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {post.tags.map((t) => <span key={t} className="rounded-md px-2 py-1 text-xs font-semibold" style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>#{t}</span>)}
            </div>
          )}

          {/* stats */}
          <div className="mt-5 flex items-center gap-1 border-y py-2" style={{ borderColor: "var(--th-border)" }}>
            <button onClick={toggleLike} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-[var(--th-card-alt)]" style={{ color: liked ? "#e53935" : "var(--th-muted)" }}>
              <Icon name="heart" size={18} fill={liked} strokeWidth={liked ? 0 : 1.9} /> <span className="font-numeric">{reactions}</span>
            </button>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}><Icon name="comment" size={18} /> <span className="font-numeric">{comments.length}</span></span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}><Icon name="eye" size={18} /> <span className="font-numeric">{post.viewsCount}</span></span>
          </div>

          {/* apoios */}
          {summary.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Apoios recebidos</p>
              <div className="flex flex-wrap gap-2">{summary.map((s) => <SupportPill key={s.type} type={s.type} count={s.count} />)}</div>
            </div>
          )}

          {/* Localização no mapa e fluxo de reparo */}
          <div className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "#f4841a1a", color: "#f4841a" }}>
                  <Icon name="location" size={16} />
                </span>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--th-muted)" }}>Localização no mapa</span>
                  <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>
                    {hasCoordinates
                      ? `${post.neighborhood || "Bairro"}${post.city ? ` · ${post.city}` : ""}`
                      : "Sem localização no mapa"}
                  </p>
                </div>
              </div>
              {isAuthor && !editingLocation && (
                <Button
                  size="sm"
                  variant="outline"
                  icon="edit"
                  onClick={() => {
                    setEditingLocation(true);
                    setCoordinates(normalizeCoordinates(post.latitude, post.longitude));
                    setLocationFeedback(null);
                  }}
                >
                  {hasCoordinates ? "Alterar no mapa" : "Marcar no mapa"}
                </Button>
              )}
            </div>

            {!hasCoordinates && !editingLocation && (
              <p className="mt-2.5 text-xs font-medium" style={{ color: isAuthor ? "#d64545" : "var(--th-muted)" }}>
                {isAuthor
                  ? "Esta publicação ainda não possui coordenadas e não aparece no mapa de demandas. Clique em \"Marcar no mapa\" para posicioná-la."
                  : "Esta publicação não possui coordenadas geográficas registradas."}
              </p>
            )}

            {locationFeedback && (
              <p className="mt-2.5 text-xs font-semibold" style={{ color: "#16a34a" }}>
                {locationFeedback}
              </p>
            )}

            {editingLocation && (
              <div className="mt-3.5 space-y-3">
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  Clique no mapa ou use sua localização para indicar o ponto exato da demanda:
                </p>
                <LocationPicker
                  value={coordinates}
                  onChange={(c) => setCoordinates(c)}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={cancelEditLocation}>Cancelar</Button>
                  <Button size="sm" loading={savingLocation} disabled={!coordinates} onClick={saveLocation} icon="check">
                    Salvar localização
                  </Button>
                </div>
              </div>
            )}

            {hasCoordinates && !editingLocation && (
              <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-xs" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}>
                <span>Coordenadas: {post.latitude?.toFixed(4)}, {post.longitude?.toFixed(4)}</span>
                <Link href="/mapa" className="font-semibold hover:underline" style={{ color: "#f4841a" }}>
                  Ver no mapa geral →
                </Link>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Comentários */}
      <Card className="mt-4">
        <p className="mb-3 text-sm font-bold" style={{ color: "var(--th-text)" }}>Comentários</p>
        <div className="flex items-start gap-2.5">
          <Avatar name={user?.name ?? ""} src={user?.avatarUrl} id={user?.id} size={36} />
          <div className="flex-1">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escreva um comentário..." className="app-textarea" style={{ minHeight: "3.5rem" }} />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={sendComment} loading={sending} icon="send" disabled={!draft.trim()}>Comentar</Button>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {comments.length === 0 && <p className="py-4 text-center text-sm" style={{ color: "var(--th-muted)" }}>Seja o primeiro a comentar.</p>}
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar name={c.authorName} id={c.authorId} size={36} />
              <div className="flex-1 rounded-2xl rounded-tl-sm px-3.5 py-2.5" style={{ background: "var(--th-card-alt)" }}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{c.authorName}</span>
                  <span className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>{timeAgo(c.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm" style={{ color: "var(--th-text)" }}>{c.content}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Barra inferior de apoio */}
      {supportTypes.length > 0 && (
        <div className="sticky bottom-20 z-20 mt-4 md:bottom-4">
          <Link href={onlyShares ? `/post/${post.id}/apoiar?type=sharing` : `/post/${post.id}/apoiar`} className="flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white shadow-lg" style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)", boxShadow: "0 10px 24px rgba(244,132,26,0.35)" }}>
            <Icon name={onlyShares ? "share" : "volunteer"} size={20} /> {onlyShares ? "Divulgar esta causa" : "Apoiar esta causa"}
            {supports.length > 0 && <span className="font-numeric">· {supports.length}</span>}
          </Link>
        </div>
      )}
    </div>
  );
}
