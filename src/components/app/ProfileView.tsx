"use client";

// Perfil de atuação territorial ("Meu sinal").
//
// O perfil responde "o que esta pessoa ou organização faz no território":
// identificação e selo institucional, demandas com status e bairro, sinais
// registrados, apoios recebidos e realizados, selos de impacto e resultados.
// Não há espaço para terceiros escreverem no perfil, grade de fotos de
// contatos nem contador de relevância (identidade visual "Sinal do bairro",
// "O que muda na experiência", item 4, e "Regras de linguagem própria").
//
// Tudo vem de registro persistido. Sem dado, o estado vazio diz isso.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate } from "@/lib/app/format";
import { formatCents } from "@/lib/app/accountability";
import { DEMAND_STATUS_COLORS } from "@/lib/app/demand";
import { SUPPORT_MODALITY_LABELS, RECEIPT_STATUS_LABELS, SUPPORT_ROLES } from "@/lib/app/support";
import {
  CONNECTION_STATUS_LABELS, CONNECTION_TYPE_META, DEMAND_CATEGORY_LABELS, DEMAND_STATUS_LABELS,
  POST_STATUS_LABELS, POST_TYPE_LABELS, PROFILE_LABELS, ROLE_LABELS,
  normalizePostStatus, normalizeRole,
  type Post, type Profile, type ProfileType, type PublicInstitution, type UserRole,
} from "@/lib/app/types";
import type { ProfileImpact } from "@/lib/app/ranking";
import {
  RESULT_STATUSES, collaborationLinks, placeLabel, profileSignals,
  type CollaborationLink, type ProfileActivity,
} from "@/lib/app/profile";
import { INSTITUTION_HUB_PATH } from "@/lib/app/institution";
import { PROFILE_EDIT_PATH } from "@/lib/app/profile-edit";
import { InstitutionSeal, PublicInstitutionCard } from "./institution/PublicInstitutionCard";
import { InstitutionStatusBadge } from "./institution/InstitutionStatus";
import { useInstitutionAccess } from "./institution/useInstitutionAccess";
import { ImpactBadges } from "./ImpactBadges";
import { DeclaredProfileSection } from "./DeclaredProfileSection";
import { ReportButton } from "./ReportButton";
import { AuthPrompt } from "./AuthPrompt";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { Button } from "./Button";

/** Dados carregados no servidor (perfil público com SSR). */
export interface ProfileInitialData {
  profile: Profile;
  posts: Post[];
  institution: PublicInstitution | null;
  impact: ProfileImpact | null;
  activity: ProfileActivity | null;
}

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4841a]";

export function ProfileView({ userId, initial }: { userId: string; initial?: ProfileInitialData }) {
  const { user } = useAuth();
  const router = useRouter();
  const isOwn = user?.id === userId;

  const [profile, setProfile] = useState<Profile | null>(initial?.profile ?? null);
  const [posts, setPosts] = useState<Post[]>(initial?.posts ?? []);
  const [activity, setActivity] = useState<ProfileActivity | null>(initial?.activity ?? null);
  const [activityFailed, setActivityFailed] = useState(false);
  const [loading, setLoading] = useState(!initial);
  /** Instituição validada vinculada ao perfil (selo público). */
  const [institution, setInstitution] = useState<PublicInstitution | null>(initial?.institution ?? null);
  const { access: ownAccess, applicable: ownApplicable, loading: ownAccessLoading } = useInstitutionAccess();
  /** já existe pedido em aberto entre as duas contas? */
  const [pendente, setPendente] = useState(false);
  /** Vínculos de colaboração: só o titular vê os próprios. */
  const [links, setLinks] = useState<CollaborationLink[] | null>(null);

  useEffect(() => {
    if (initial) return;
    let alive = true;
    setLoading(true);
    Promise.all([api.getProfile(userId), api.postsByAuthor(userId).catch(() => [] as Post[])])
      .then(([pr, po]) => {
        if (!alive) return;
        setProfile(pr); setPosts(po);
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, initial]);

  useEffect(() => {
    if (initial?.activity) return;
    let alive = true;
    api.profileActivity(userId)
      .then((next) => { if (alive) { setActivity(next); setActivityFailed(false); } })
      .catch(() => { if (alive) setActivityFailed(true); });
    return () => { alive = false; };
  }, [userId, initial?.activity]);

  useEffect(() => {
    if (initial) return;
    let alive = true;
    api.getPublicInstitution(userId)
      .then((value) => { if (alive) setInstitution(value); })
      .catch(() => { if (alive) setInstitution(null); });
    return () => { alive = false; };
  }, [userId, initial]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api.connectionsFor(user.id).then((list) => {
      if (!alive) return;
      if (user.id === userId) setLinks(collaborationLinks(list, user.id));
      else setPendente(list.some((c) => c.status === "pending" && (c.from.userId === userId || c.to.userId === userId)));
    }).catch(() => { if (alive && user.id === userId) setLinks([]); });
    return () => { alive = false; };
  }, [user, userId]);

  const signals = useMemo(() => profileSignals(posts), [posts]);

  if (loading) return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  if (!profile) return <p className="py-20 text-center" style={{ color: "var(--th-muted)" }}>Perfil não encontrado.</p>;

  const role = normalizeRole(profile.role, profile.profileType);
  const firstName = profile.name.split(" ")[0] || profile.name;
  const places = territories(profile, activity);

  return (
    <div>
      <button type="button" onClick={() => router.back()} className={`mb-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold md:hidden ${FOCUS}`} style={{ color: "var(--th-muted)" }}>
        <Icon name="arrowLeft" size={18} /> Voltar
      </button>
      <div className="mx-auto grid max-w-2xl grid-cols-1 items-start gap-4 lg:mx-0 lg:max-w-none lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <IdentityCard
            profile={profile} role={role} institution={institution} places={places}
            isOwn={isOwn} signedIn={Boolean(user)} userId={userId} pendente={pendente}
            ownInstitution={isOwn && ownApplicable && !ownAccessLoading ? ownAccess.status ?? null : undefined}
          />
          {institution && <PublicInstitutionCard institution={institution} />}
          <DeclaredProfileSection userId={userId} role={role} isOwn={isOwn} />
          <ImpactBadges userId={userId} initial={initial?.impact ?? null} own={isOwn} role={role} />
          {isOwn && <OwnShortcuts role={role} />}
        </div>

        <div className="min-w-0 space-y-4">
          <ActivitySummary role={role} activity={activity} failed={activityFailed} signals={signals.length} />
          <DemandsPanel role={role} activity={activity} failed={activityFailed} isOwn={isOwn} firstName={firstName} />
          <SignalsPanel signals={signals} isOwn={isOwn} />
          <SupportsPanel role={role} activity={activity} failed={activityFailed} isOwn={isOwn} />
          {isOwn && <CollaborationPanel links={links} />}
        </div>
      </div>
    </div>
  );
}

// ── Identificação ─────────────────────────────────────────────────────────

function IdentityCard({
  profile, role, institution, places, isOwn, signedIn, userId, pendente, ownInstitution,
}: {
  profile: Profile; role: UserRole; institution: PublicInstitution | null; places: string[];
  isOwn: boolean; signedIn: boolean; userId: string; pendente: boolean;
  /** Estado do cadastro institucional do titular; `undefined` quando não se aplica. */
  ownInstitution: Parameters<typeof InstitutionStatusBadge>[0]["status"] | null | undefined;
}) {
  const subprofile = profile.profileType ? PROFILE_LABELS[profile.profileType as ProfileType] : null;
  const home = [profile.neighborhood, profile.city].filter(Boolean).join(", ");
  return (
    <section className="app-card rounded-2xl p-4" aria-labelledby="perfil-nome" style={{ borderTop: "3px solid #1b4f72" }}>
      <div className="flex items-start gap-3">
        <Avatar name={profile.name} src={profile.avatarUrl} id={profile.userId} size={56} />
        <div className="min-w-0 flex-1">
          <h1 id="perfil-nome" className="text-lg font-bold leading-tight break-words" style={{ color: "var(--th-text)" }}>{profile.name}</h1>
          <p className="mt-0.5 text-xs font-semibold" style={{ color: "var(--th-muted)" }}>
            {[ROLE_LABELS[role], subprofile].filter(Boolean).join(" · ")}
          </p>
          {institution && <div className="mt-1.5"><InstitutionSeal institution={institution} /></div>}
        </div>
      </div>

      {profile.bio && <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--th-text)" }}>{profile.bio}</p>}

      <dl className="mt-3 space-y-1.5 text-sm" style={{ color: "var(--th-muted)" }}>
        {home && <InfoLine icon="location" label="Bairro e cidade">{home}</InfoLine>}
        {places.length > 0 && <InfoLine icon="map" label="Territórios de atuação">{places.join(" · ")}</InfoLine>}
        {profile.memberSince && <InfoLine icon="calendar" label="Na plataforma">Participante desde {formatDate(profile.memberSince)}</InfoLine>}
        {profile.website && <InfoLine icon="globe" label="Site">{profile.website}</InfoLine>}
      </dl>

      {ownInstitution !== undefined && (
        <Link href={INSTITUTION_HUB_PATH} className={`mt-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors hover:bg-[var(--th-card-alt)] ${FOCUS}`} style={{ borderColor: "var(--th-border)" }}>
          <span className="font-semibold" style={{ color: "var(--th-text)" }}>Cadastro institucional</span>
          {ownInstitution ? <InstitutionStatusBadge status={ownInstitution} /> : <span className="text-xs font-bold" style={{ color: "var(--th-muted)" }}>Não iniciado</span>}
        </Link>
      )}

      {isOwn && (
        <div className="mt-4 space-y-2">
          {!profile.bio && !home && (
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>
              Seu perfil ainda não tem apresentação nem bairro. Preencha para que parceiros, órgãos e a comunidade saibam onde você atua.
            </p>
          )}
          <Button block size="sm" variant="outline" icon="edit" href={PROFILE_EDIT_PATH}>Editar perfil</Button>
        </div>
      )}

      {!isOwn && (
        <div className="mt-4 space-y-2">
          {signedIn ? (
            <>
              {/* leva ao fluxo real com o destinatário já escolhido (ver /conexoes/nova) */}
              <Button block size="sm" icon="link" href={`/conexoes/nova?para=${encodeURIComponent(userId)}`}>
                Solicitar conexão
              </Button>
              {pendente && (
                <p className="text-center text-xs" style={{ color: "var(--th-muted)" }}>
                  Já existe um pedido em aberto com este perfil.
                </p>
              )}
              {/* Denúncia de perfil (T6.3): discreta, sem revelar nada ao denunciado. */}
              <div className="flex justify-center">
                <ReportButton targetKind="perfil" targetId={userId} targetOwnerId={userId} targetLabel="este perfil" />
              </div>
            </>
          ) : (
            <AuthPrompt action="solicitar uma conexão" returnTo={`/perfil/${encodeURIComponent(userId)}`} />
          )}
        </div>
      )}
    </section>
  );
}

function OwnShortcuts({ role }: { role: UserRole }) {
  const items: { href: string; label: string; icon: IconName }[] = [];
  if (role === "agent") items.push({ href: "/minhas-demandas", label: "Minhas demandas, inclusive em análise", icon: "document" });
  if (SUPPORT_ROLES.includes(role)) items.push({ href: "/meus-apoios", label: "Meus apoios e o andamento", icon: "volunteer" });
  items.push({ href: "/minhas-inscricoes", label: "Minhas inscrições em eventos", icon: "calendar" });
  items.push({ href: "/perfil/privacidade", label: "Privacidade e meus dados", icon: "shield" });
  return (
    <Panel title="Acompanhar" icon="chevronRight" accent="#2e7ba8">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold transition-colors hover:bg-[var(--th-card-alt)] ${FOCUS}`} style={{ color: "var(--th-text)" }}>
              <Icon name={item.icon} size={15} style={{ color: "#2e7ba8" }} aria-hidden />
              <span className="flex-1">{item.label}</span>
              <Icon name="chevronRight" size={14} style={{ color: "var(--th-muted)" }} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── Atuação ───────────────────────────────────────────────────────────────

function ActivitySummary({ role, activity, failed, signals }: { role: UserRole; activity: ProfileActivity | null; failed: boolean; signals: number }) {
  if (failed || !activity) return null;
  const results = activity.demands.filter((d) => RESULT_STATUSES.includes(d.status)).length;
  const more = (n: number, truncated: boolean) => (truncated ? `${n}+` : String(n));
  const items: { label: string; value: string }[] = [];
  if (role === "agent" || activity.demands.length > 0) {
    items.push({ label: "Demandas publicadas", value: more(activity.demands.length, activity.demandsTruncated) });
    items.push({ label: "Com resultado ou prestação de contas", value: String(results) });
  }
  items.push({ label: "Sinais registrados", value: String(signals) });
  if (role === "agent" || activity.supportsReceived.total > 0) {
    items.push({ label: "Apoios confirmados às demandas", value: String(activity.supportsReceived.confirmed) });
  }
  if (SUPPORT_ROLES.includes(role) || activity.supportsGiven.length > 0) {
    items.push({ label: "Apoios realizados (públicos)", value: more(activity.supportsGiven.length, activity.supportsGivenTruncated) });
  }
  return (
    <section className="app-card rounded-2xl p-4" aria-labelledby="perfil-resumo">
      <h2 id="perfil-resumo" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Atuação no território</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col-reverse rounded-xl p-3" style={{ background: "var(--th-card-alt)" }}>
            <dt className="text-xs leading-snug" style={{ color: "var(--th-muted)" }}>{item.label}</dt>
            <dd className="font-numeric text-lg font-bold" style={{ color: "var(--th-text)" }}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DemandsPanel({ role, activity, failed, isOwn, firstName }: { role: UserRole; activity: ProfileActivity | null; failed: boolean; isOwn: boolean; firstName: string }) {
  const demands = activity?.demands ?? [];
  if (!failed && activity && demands.length === 0 && role !== "agent") return null;
  return (
    <Panel title="Demandas e resultados" icon="flag" accent="#1b4f72">
      {failed ? (
        <Empty>Não foi possível carregar as demandas agora. Tente novamente mais tarde.</Empty>
      ) : !activity ? (
        <Loading />
      ) : demands.length === 0 ? (
        <Empty>
          {isOwn
            ? "Nenhuma demanda publicada ainda. Demandas em rascunho ou em análise ficam em Minhas demandas."
            : `${firstName} ainda não tem demanda publicada.`}
        </Empty>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--th-border)" }}>
          {demands.map((demand) => {
            const place = placeLabel(demand);
            const hasResult = RESULT_STATUSES.includes(demand.status);
            return (
              <li key={demand.id} className="py-2.5 first:pt-0 last:pb-0" style={{ borderColor: "var(--th-border)" }}>
                <Link href={`/demandas/${encodeURIComponent(demand.id)}`} className={`block rounded-lg p-1.5 transition-colors hover:bg-[var(--th-card-alt)] ${FOCUS}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusPill color={DEMAND_STATUS_COLORS[demand.status] ?? "#868e96"} label={DEMAND_STATUS_LABELS[demand.status] ?? "Status desconhecido"} />
                    <span className="text-xs" style={{ color: "var(--th-muted)" }}>{DEMAND_CATEGORY_LABELS[demand.category] ?? ""}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold break-words" style={{ color: "var(--th-text)" }}>{demand.title}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs" style={{ color: "var(--th-muted)" }}>
                    {place && <span className="inline-flex items-center gap-1"><Icon name="location" size={12} aria-hidden />{place}</span>}
                    {demand.publishedAt && <span>Publicada em {formatDate(demand.publishedAt)}</span>}
                  </p>
                  {hasResult && (
                    <p className="mt-1 text-xs font-semibold" style={{ color: "#2e9e5b" }}>
                      {demand.status === "encerrada"
                        ? "Concluído — encerrado · registro final na página da demanda"
                        : demand.status === "prestacao_de_contas" ? "Prestação de contas publicada" : "Concluída · resultado na página da demanda"}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {activity?.demandsTruncated && <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Mostrando as 50 demandas mais recentes.</p>}
    </Panel>
  );
}

function SignalsPanel({ signals, isOwn }: { signals: Post[]; isOwn: boolean }) {
  return (
    <Panel title="Sinais registrados" icon="bolt" accent="#2e7ba8">
      {signals.length === 0 ? (
        <Empty>{isOwn ? "Você ainda não registrou sinais no território." : "Nenhum sinal registrado ainda."}</Empty>
      ) : (
        <ul className="space-y-1">
          {signals.map((post) => {
            const status = normalizePostStatus(post.status);
            const place = [post.neighborhood, post.city].filter(Boolean).join(", ");
            return (
              <li key={post.id}>
                <Link href={`/post/${encodeURIComponent(post.id)}`} className={`block rounded-lg p-1.5 transition-colors hover:bg-[var(--th-card-alt)] ${FOCUS}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: "var(--th-muted)" }}>
                    <span className="font-semibold">{POST_TYPE_LABELS[post.type] ?? "Sinal"}</span>
                    {status && <span>· {POST_STATUS_LABELS[status]}</span>}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold break-words" style={{ color: "var(--th-text)" }}>{post.title}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs" style={{ color: "var(--th-muted)" }}>
                    {place && <span className="inline-flex items-center gap-1"><Icon name="location" size={12} aria-hidden />{place}</span>}
                    {post.createdAt && <span>{formatDate(post.createdAt)}</span>}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function SupportsPanel({ role, activity, failed, isOwn }: { role: UserRole; activity: ProfileActivity | null; failed: boolean; isOwn: boolean }) {
  const receivesSupport = role === "agent" || (activity?.supportsReceived.total ?? 0) > 0;
  const givesSupport = SUPPORT_ROLES.includes(role) || (activity?.supportsGiven.length ?? 0) > 0;
  if (!receivesSupport && !givesSupport) return null;
  return (
    <Panel title="Apoios" icon="volunteer" accent="#f4841a">
      {failed ? (
        <Empty>Não foi possível carregar os apoios agora. Tente novamente mais tarde.</Empty>
      ) : !activity ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          {receivesSupport && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Recebidos pelas demandas</h3>
              {activity.supportsReceived.total === 0 ? (
                <Empty>Nenhum apoio registrado nas demandas publicadas.</Empty>
              ) : (
                <>
                  <p className="mt-1.5 text-sm" style={{ color: "var(--th-text)" }}>
                    <span className="font-numeric font-bold">{activity.supportsReceived.total}</span> apoio(s) registrado(s),{" "}
                    <span className="font-numeric font-bold">{activity.supportsReceived.confirmed}</span> confirmado(s) pelo Agente.
                  </p>
                  {activity.supportsReceived.byModality.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {activity.supportsReceived.byModality.map((item) => (
                        <li key={item.modality} className="rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
                          {SUPPORT_MODALITY_LABELS[item.modality] ?? item.modality} · <span className="font-numeric">{item.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>O histórico de cada apoio está na página da demanda.</p>
                </>
              )}
            </div>
          )}
          {givesSupport && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Realizados</h3>
              {activity.supportsGiven.length === 0 ? (
                <Empty>
                  {isOwn
                    ? "Nenhum apoio exibido publicamente. Apoios sem consentimento de exibição aparecem só em Meus apoios."
                    : "Nenhum apoio realizado exibido publicamente."}
                </Empty>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {activity.supportsGiven.map((support) => {
                    const place = placeLabel(support);
                    return (
                      <li key={support.id}>
                        <Link href={`/demandas/${encodeURIComponent(support.demandId)}`} className={`block rounded-lg p-1.5 transition-colors hover:bg-[var(--th-card-alt)] ${FOCUS}`}>
                          <p className="text-sm font-semibold break-words" style={{ color: "var(--th-text)" }}>{support.demandTitle}</p>
                          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs" style={{ color: "var(--th-muted)" }}>
                            {support.modality && <span>{SUPPORT_MODALITY_LABELS[support.modality] ?? support.modality}</span>}
                            {support.amountCents !== null && <span className="font-numeric">{formatCents(support.amountCents)}</span>}
                            <span>{RECEIPT_STATUS_LABELS[support.receiptStatus] ?? ""}</span>
                            {place && <span>{place}</span>}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Aparecem aqui só os apoios que o apoiador consentiu exibir com o nome.</p>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function CollaborationPanel({ links }: { links: CollaborationLink[] | null }) {
  return (
    <Panel title="Vínculos de colaboração" icon="link" accent="#1b4f72">
      {links === null ? (
        <Loading />
      ) : links.length === 0 ? (
        <Empty>Nenhuma conexão aceita ainda. Conexões nascem de um pedido aceito pelas duas partes.</Empty>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--th-border)" }}>
          {links.map((link) => {
            const partyRole = link.party.role ? ROLE_LABELS[normalizeRole(link.party.role, link.party.profileType ?? null)] : null;
            const partyProfile = link.party.profileType ? PROFILE_LABELS[link.party.profileType] : null;
            return (
              <li key={link.connectionId} className="py-2.5 first:pt-0 last:pb-0" style={{ borderColor: "var(--th-border)" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <Link href={`/perfil/${encodeURIComponent(link.party.userId)}`} className={`rounded text-sm font-semibold hover:underline ${FOCUS}`} style={{ color: "var(--th-text)" }}>
                    {link.party.name}
                  </Link>
                  <span className="text-xs" style={{ color: "var(--th-muted)" }}>{CONNECTION_STATUS_LABELS[link.status]}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  {[partyRole, partyProfile].filter(Boolean).join(" · ")}
                  {(partyRole || partyProfile) && " — "}
                  {CONNECTION_TYPE_META[link.type]?.label ?? "Conexão"}
                </p>
                {link.subject && (
                  <Link href={link.subject.href} className={`mt-0.5 inline-block rounded text-xs font-semibold hover:underline ${FOCUS}`} style={{ color: "#2e7ba8" }}>
                    {link.subject.title}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs" style={{ color: "var(--th-muted)" }}>
        Só você vê esta lista: conexões ficam entre as duas partes. <Link href="/conexoes" className={`rounded font-semibold underline ${FOCUS}`} style={{ color: "var(--th-text)" }}>Ver conexões</Link>
      </p>
    </Panel>
  );
}

// ── Peças ─────────────────────────────────────────────────────────────────

/** Bairros e municípios em que a atuação pública aconteceu (sem repetição). */
function territories(profile: Profile, activity: ProfileActivity | null): string[] {
  if (!activity) return [];
  const seen = new Set<string>();
  const home = [profile.neighborhood, profile.city].filter(Boolean).join(", ");
  for (const item of [...activity.demands, ...activity.supportsGiven]) {
    const label = placeLabel(item);
    if (label && label !== home) seen.add(label);
    if (seen.size >= 6) break;
  }
  return [...seen];
}

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Panel({ accent, icon, title, children }: { accent: string; icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <section className="app-card overflow-hidden rounded-2xl" aria-label={title}>
      <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--th-border)", borderLeft: `3px solid ${accent}` }}>
        <Icon name={icon} size={15} style={{ color: accent }} aria-hidden />
        <h2 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm" style={{ color: "var(--th-muted)" }}>{children}</p>;
}

function Loading() {
  return <div className="flex justify-center py-4"><span className="app-spinner" style={{ width: 22, height: 22 }} /></div>;
}

function InfoLine({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon name={icon} size={14} style={{ color: "#2e7ba8", marginTop: 3 }} aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
