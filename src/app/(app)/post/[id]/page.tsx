"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate, timeAgo } from "@/lib/app/format";
import {
  POST_STATUS_LABELS, type Comment, type Post, type PostStatus,
  type SupportRecord, type SupportSummaryItem,
} from "@/lib/app/types";
import { Avatar } from "@/components/app/Avatar";
import { Icon } from "@/components/app/Icon";
import { Button } from "@/components/app/Button";
import { Card, EmptyState, StatusBadge, SupportPill, TypeBadge } from "@/components/app/ui";

const STATUSES: PostStatus[] = ["active", "in_progress", "resolved", "cancelled"];

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([api.getPost(id), api.listComments(id), api.postSupports(id)]).then(([p, c, s]) => {
      if (!alive) return;
      setPost(p);
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

  if (loading) return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  if (!post) return <EmptyState icon="info" title="Publicação não encontrada" hint="Ela pode ter sido removida." />;

  const isAuthor = user?.id === post.authorId;
  const cover = post.images?.[0];

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
        <Icon name="arrowLeft" size={18} /> Voltar
      </button>

      <Card padded={false} className="overflow-hidden">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={post.title} className="max-h-80 w-full object-cover" />
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
      <div className="sticky bottom-20 z-20 mt-4 md:bottom-4">
        <Link href={`/post/${post.id}/apoiar`} className="flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-white shadow-lg" style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)", boxShadow: "0 10px 24px rgba(244,132,26,0.35)" }}>
          <Icon name="volunteer" size={20} /> Apoiar esta causa
          {supports.length > 0 && <span className="font-numeric">· {supports.length}</span>}
        </Link>
      </div>
    </div>
  );
}
