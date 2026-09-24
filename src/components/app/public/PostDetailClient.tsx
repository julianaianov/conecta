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
  type Comment,
  type Post,
  type SupportSummaryItem,
} from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { ShareButton } from "../ShareButton";
import { ReportButton } from "../ReportButton";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Card, StatusBadge, SupportPill, TypeBadge } from "../ui";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { gateStatusFrom, isInstitutionNotValidated, type GatedAction } from "@/lib/app/institution";
import type { InstitutionValidationStatus } from "@/lib/app/types";
import { demandPublicPath } from "@/lib/app/demand";
import { nextStepFor, relevanceLabel, territoryLabel, themeLabels, updatesLabel } from "@/lib/app/signal";

const LocationPicker = dynamic(
  () => import("../LocationPicker").then((module) => module.LocationPicker),
  { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-xl" style={{ background: "var(--th-card-alt)" }} /> },
);

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
  const [editingLocation, setEditingLocation] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(() => normalizeCoordinates(initialPost.latitude, initialPost.longitude));
  const [savingLocation, setSavingLocation] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  /** 403 `institution_not_validated` (Poder Público sem cadastro validado). */
  const [gate, setGate] = useState<{ action: GatedAction; status: InstitutionValidationStatus | null } | null>(null);

  const postHref = `/post/${encodeURIComponent(post.id)}`;
  const profileHref = `/perfil/${encodeURIComponent(post.authorId)}`;
  const returnTo = pathname || postHref;
  const supportTypes = allowedSupportTypes(user?.role, user?.profileType);
  const onlyShares = supportTypes.length === 1 && supportTypes[0] === "sharing";
  const isAuthor = user?.id === post.authorId;
  const territory = territoryLabel(post);
  const themes = themeLabels(post.tags, 8);
  // Visitante vê "Apoiar" e entra antes de registrar; o perfil logado vê o
  // que pode fazer. A reação nunca é o próximo passo.
  const nextStep = nextStepFor(post, { canSupport: !user || supportTypes.length > 0, onlyShares });
  const nextStepAction = nextStep.href === postHref ? (
    <a href="#atualizacoes" className="signal-action signal-focus mt-3 flex h-12 items-center justify-center gap-2 rounded-xl font-bold">
      <Icon name={nextStep.icon} size={18} /> {nextStep.label}
    </a>
  ) : !user && nextStep.kind === "support" ? (
    <div className="mt-3"><AuthPrompt action="registrar apoio" returnTo={`${postHref}/apoiar`} /></div>
  ) : (
    <>
      <Link href={nextStep.href} className="signal-action signal-focus mt-3 flex h-12 items-center justify-center gap-2 rounded-xl font-bold">
        <Icon name={nextStep.icon} size={18} /> {nextStep.label}
      </Link>
      {user && supportTypes.length === 0 && (
        <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Seu perfil pode acompanhar este sinal, mas não possui uma forma de apoio disponível.</p>
      )}
    </>
  );

  async function sendComment() {
    if (!user || !draft.trim()) return;
    setSending(true);
    setCommentError(null);
    setGate(null);
    try {
      const comment = await api.addComment(post.id, user, draft.trim());
      setComments((current) => [...current, comment]);
      setDraft("");
    } catch (err) {
      if (isInstitutionNotValidated(err)) setGate({ action: "comentar", status: gateStatusFrom(err) });
      else setCommentError("Não foi possível registrar a atualização agora. Tente de novo.");
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

  async function saveLocation() {
    if (!isAuthor || savingLocation) return;
    // O ponto pode mudar, nunca ser apagado: sem ele o sinal sai do mapa.
    if (!coordinates) {
      setActionError("Escolha o ponto no mapa antes de salvar: sem ele o sinal sai do mapa.");
      return;
    }
    setSavingLocation(true);
    setActionError(null);
    try {
      const updated = await api.updatePostLocation(post.id, coordinates.latitude, coordinates.longitude);
      if (updated) {
        setPost(updated);
        setCoordinates(normalizeCoordinates(updated.latitude, updated.longitude));
        setEditingLocation(false);
      }
    } catch (err) {
      if (isInstitutionNotValidated(err)) setGate({ action: "editar", status: gateStatusFrom(err) });
      else setActionError("Não foi possível atualizar o ponto no mapa agora.");
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
          {/* tipo, status e território na mesma leitura */}
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={post.type} />
            <StatusBadge status={post.status} />
            {territory ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--th-text)" }}>
                <Icon name="location" size={13} /> {territory}
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 text-2xl font-bold leading-tight" style={{ color: "var(--th-text)" }}>{post.title}</h1>
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed" style={{ color: "var(--th-text)" }}>{post.description}</p>
          {themes.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Temas do sinal">
              {themes.map((theme) => (
                <li key={theme} className="rounded-full border px-2.5 py-0.5 text-xs font-semibold" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)", color: "var(--th-text)" }}>{theme}</li>
              ))}
            </ul>
          )}
          {post.demandId && (
            <Link href={demandPublicPath(post.demandId)} className="signal-focus mt-4 flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-[var(--th-card-alt)]" style={{ borderColor: "var(--th-border)" }}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--th-card-alt)", color: "var(--th-link)" }}><Icon name="inventory" size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold" style={{ color: "var(--th-text)" }}>Ver a demanda estruturada</span>
                <span className="block text-xs" style={{ color: "var(--th-muted)" }}>Orçamento, composição financeira, cronograma, metas, recursos e linha do tempo.</span>
              </span>
              <Icon name="chevronRight" size={18} style={{ color: "var(--th-muted)" }} />
            </Link>
          )}

          {/* próximo passo: a ação que orienta a participação */}
          <section aria-labelledby="proximo-passo" className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--th-border)" }}>
            <h2 id="proximo-passo" className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--th-muted)" }}>Próximo passo</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>{nextStep.hint}</p>
            {nextStepAction}
          </section>

          {/* responsável em papel secundário */}
          <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--th-muted)" }}>
            <span>Responsável</span>
            <Link href={profileHref} className="signal-focus inline-flex items-center gap-1.5 font-semibold hover:underline" style={{ color: "var(--th-text)" }}>
              <Avatar name={post.authorName} src={post.authorAvatar} id={post.authorId} size={22} />
              {post.authorName}
            </Link>
            <span aria-hidden="true">·</span>
            <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
          </p>

          {/* contexto do sinal: atualizações, relevância, alcance e amplificação */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-2 text-xs" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}>
            <span className="inline-flex items-center gap-1.5"><Icon name="clock" size={14} /> {updatesLabel(comments.length)}</span>
            {user ? (
              <button type="button" onClick={toggleReaction} aria-pressed={reacted} aria-label={`${reacted ? "Desmarcar" : "Marcar"} este sinal como relevante para o bairro. ${relevanceLabel(reactions)}.`} title={relevanceLabel(reactions)} className="signal-focus inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 py-1 font-semibold transition-colors hover:bg-[var(--th-card-alt)]" style={{ borderColor: reacted ? "var(--th-text)" : "var(--th-border)", color: reacted ? "var(--th-text)" : "var(--th-muted)" }}>
                {reacted ? <Icon name="check" size={13} /> : null}
                <span>Relevante</span>
                <span className="font-numeric" aria-hidden="true">· {reactions}</span>
              </button>
            ) : (
              <Link href={loginHref(returnTo)} className="signal-focus inline-flex items-center gap-1.5 font-semibold hover:underline">{relevanceLabel(reactions)}</Link>
            )}
            <span className="inline-flex items-center gap-1.5"><Icon name="eye" size={14} /> <span className="font-numeric">{post.viewsCount}</span> visualizações</span>
            {/* Amplificação (T21): Web Share API com cópia do link como alternativa. */}
            <ShareButton
              targetKind="post"
              targetId={post.id}
              path={`/post/${encodeURIComponent(post.id)}`}
              title={post.title}
              text={`${post.title} — DM Conecta`}
              sharesCount={post.sharesCount ?? 0}
            />
            {/* Denúncia da publicação (T6.3). */}
            <ReportButton
              targetKind="publicacao"
              targetId={post.id}
              targetOwnerId={post.authorId}
              targetLabel="esta publicação"
            />
          </div>
          {supports.summary.length > 0 && <div className="mt-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Formas de apoio já registradas</p><div className="flex flex-wrap gap-2">{supports.summary.map((item) => <SupportPill key={item.type} type={item.type} count={item.count} />)}</div></div>}
          <div className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Ponto no território</p>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--th-text)" }}>{post.latitude != null && post.longitude != null ? `${post.neighborhood || "Território"}${post.city ? ` · ${post.city}` : ""}` : "Este registro ainda não possui localização pública."}</p>
              </div>
              {isAuthor && !post.demandId && !editingLocation && <Button type="button" variant="ghost" size="sm" icon="edit" onClick={() => setEditingLocation(true)}>Editar ponto</Button>}
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
            ) : <Link href="/mapa" className="mt-2 inline-flex text-sm font-bold" style={{ color: "var(--th-link)" }}>Explorar o mapa →</Link>}
          </div>
          {actionError && <p className="mt-3 text-sm font-semibold" style={{ color: "#d64545" }}>{actionError}</p>}
          {gate?.action === "editar" && <div className="mt-3"><InstitutionGateNotice action="editar" status={gate.status} /></div>}
        </div>
      </Card>

      <Card>
        <h2 id="atualizacoes" className="scroll-mt-24 text-sm font-bold" style={{ color: "var(--th-text)" }}>Atualizações do acompanhamento</h2>
        <div className="mt-3">{user ? <div className="flex items-start gap-2.5"><Avatar name={user.name} src={user.avatarUrl} id={user.id} size={36} /><div className="flex-1"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Registre uma atualização ou informação útil..." className="app-textarea" /><div className="mt-2 flex justify-end"><button type="button" onClick={sendComment} disabled={!draft.trim() || sending} className="rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: "#f4841a" }}>{sending ? "Enviando…" : "Registrar atualização"}</button></div>{gate?.action === "comentar" && <div className="mt-2"><InstitutionGateNotice action="comentar" status={gate.status} /></div>}{commentError && <p role="alert" className="mt-2 text-sm font-semibold" style={{ color: "#e53935" }}>{commentError}</p>}</div></div> : <AuthPrompt action="registrar uma atualização" returnTo={returnTo} />}</div>
        <div className="mt-5 space-y-4">{comments.length === 0 ? <p className="py-3 text-center text-sm" style={{ color: "var(--th-muted)" }}>Ainda não há atualizações neste acompanhamento.</p> : comments.map((comment) => <div key={comment.id} className="flex gap-2.5 border-l-2 pl-3" style={{ borderColor: "#2e7ba8" }}><Avatar name={comment.authorName} id={comment.authorId} size={36} /><div><div className="flex items-baseline gap-2"><span className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{comment.authorName}</span><span className="text-xs" style={{ color: "var(--th-muted)" }}>{timeAgo(comment.createdAt)}</span></div><p className="mt-0.5 text-sm" style={{ color: "var(--th-text)" }}>{comment.content}</p><div className="mt-0.5"><ReportButton variant="icon" targetKind="comentario" targetId={comment.id} targetOwnerId={comment.authorId} targetLabel="este comentário" /></div></div></div>)}</div>
      </Card>
    </div>
  );
}

interface PublicSupport {
  id: string;
  type: SupportSummaryItem["type"];
  createdAt: string;
}
