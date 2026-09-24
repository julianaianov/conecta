"use client";

/**
 * "Equipe da instituição" (T29): o titular do cadastro institucional (ou um
 * gestor por vínculo) convida contas, define o nível de permissão delegada,
 * muda o nível e remove. Fonte: Arquitetura de Perfis §4/§5; Modelo de
 * Conexão §32 (vários usuários por instituição).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate } from "@/lib/app/format";
import {
  DELEGATED_PERMISSION_LABELS, LEVEL_PERMISSIONS, MEMBERSHIP_STATUS_COLORS, MEMBERSHIP_STATUS_LABELS, MEMBER_LEVELS,
  MEMBER_LEVEL_LABELS, TEAM_PATH, membershipErrorMessage, type MembershipStatus, type OrganizationMemberLevel,
} from "@/lib/app/organization";
import {
  INSTITUTION_KIND_LABELS, INSTITUTION_STATUS_LABELS, PROFILE_LABELS, ROLE_LABELS, normalizeRole,
  type MemberCandidate, type OrganizationMember, type OrganizationTeam,
} from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { Card, EmptyState } from "../ui";
import { FormAlert, SelectInput, TextInput } from "../demand/fields";

const LEVEL_OPTIONS = MEMBER_LEVELS.map((level) => ({ value: level, label: MEMBER_LEVEL_LABELS[level] }));

function StatusBadge({ status }: { status: string }) {
  const color = MEMBERSHIP_STATUS_COLORS[status as MembershipStatus] ?? "#868e96";
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}1a`, color }}>
      {MEMBERSHIP_STATUS_LABELS[status as MembershipStatus] ?? status}
    </span>
  );
}

function partyLabel(m: { role: string | null; profileType: string | null }): string {
  return [m.role && ROLE_LABELS[normalizeRole(m.role, m.profileType)], m.profileType && PROFILE_LABELS[m.profileType as keyof typeof PROFILE_LABELS]]
    .filter(Boolean).join(" · ");
}

export function TeamClient() {
  const { user, status } = useAuth();
  const [team, setTeam] = useState<OrganizationTeam | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<MemberCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [inviteLevel, setInviteLevel] = useState<OrganizationMemberLevel>("publicador");

  const load = useCallback(async () => {
    try {
      setTeam(await api.organizationTeam());
      setForbidden(false);
      setError(null);
    } catch (err) {
      if ((err as { code?: string }).code === "not_organization_manager") setForbidden(true);
      else setError(membershipErrorMessage(err, "Não foi possível carregar a equipe."));
      setTeam(null);
    }
  }, []);

  useEffect(() => { if (status === "authenticated") void load(); }, [status, load]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setCandidates(await api.memberCandidates(q.trim()));
    } catch (err) {
      setError(membershipErrorMessage(err, "Não foi possível buscar contas."));
    } finally {
      setSearching(false);
    }
  }

  async function invite(c: MemberCandidate) {
    setBusy(c.userId);
    setError(null);
    setNotice(null);
    try {
      await api.inviteMember({ userId: c.userId, level: inviteLevel });
      setNotice(`Convite enviado a ${c.name} como ${MEMBER_LEVEL_LABELS[inviteLevel]}.`);
      setCandidates((list) => list?.filter((x) => x.userId !== c.userId) ?? null);
      await load();
    } catch (err) {
      setError(membershipErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function changeLevel(m: OrganizationMember, level: string) {
    if (level === m.level) return;
    setBusy(m.id);
    setError(null);
    try {
      await api.changeMemberLevel(m.id, level);
      await load();
    } catch (err) {
      setError(membershipErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(m: OrganizationMember) {
    if (!window.confirm(`Remover ${m.name} da equipe? A pessoa deixa de atuar em nome da instituição.`)) return;
    setBusy(m.id);
    setError(null);
    try {
      await api.removeMember(m.id);
      await load();
    } catch (err) {
      setError(membershipErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (status === "unknown") return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Equipe da instituição</h1>
          <div className="mt-4"><AuthPrompt action="gerir a equipe da instituição" returnTo={TEAM_PATH} /></div>
        </Card>
      </div>
    );
  }
  if (forbidden) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <EmptyState icon="users" title="Equipe da instituição" hint="A equipe é gerida pelo titular do cadastro institucional ou por um gestor da instituição. Se você foi convidado, veja Meus vínculos." />
        <div className="mt-4 text-center"><Link href="/vinculos" className="text-sm font-semibold underline" style={{ color: "#f4841a" }}>Meus vínculos</Link></div>
      </div>
    );
  }

  const active = team?.members.filter((m) => m.status === "ativo") ?? [];
  const invited = team?.members.filter((m) => m.status === "convidado") ?? [];
  const past = team?.members.filter((m) => !["ativo", "convidado"].includes(m.status)) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <Link href="/cadastro-institucional" className="text-sm font-semibold" style={{ color: "var(--th-muted)" }}>← Cadastro institucional</Link>
        <h1 className="mt-2 text-2xl font-bold" style={{ color: "var(--th-text)" }}>Equipe da instituição</h1>
        {team && (
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
            {team.organization.name} · {INSTITUTION_KIND_LABELS[team.organization.kind]} · {INSTITUTION_STATUS_LABELS[team.organization.validationStatus]}
            {team.managerRole === "gestor" ? " · você gere a equipe como Gestor" : ""}
          </p>
        )}
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Quem entra na equipe passa a atuar em nome da instituição com as permissões do nível. Uma conta atua em nome de uma instituição por vez.
        </p>
      </header>
      {error && <FormAlert message={error} />}
      {notice && <FormAlert message={notice} tone="success" />}

      <Card>
        <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>Níveis de permissão</h2>
        <dl className="mt-2 grid gap-3 sm:grid-cols-3">
          {MEMBER_LEVELS.map((level) => (
            <div key={level}>
              <dt className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{MEMBER_LEVEL_LABELS[level]}</dt>
              <dd className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--th-muted)" }}>
                {LEVEL_PERMISSIONS[level].map((p) => <p key={p}>{DELEGATED_PERMISSION_LABELS[p]}</p>)}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>Convidar</h2>
        <form onSubmit={search} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <TextInput name="team-search" label="Nome da conta" value={q} onValue={setQ} minLength={2} placeholder="Busque pelo nome" />
          <SelectInput name="team-level" label="Nível" value={inviteLevel} onValue={(v) => setInviteLevel(v as OrganizationMemberLevel)} options={LEVEL_OPTIONS} />
          <Button type="submit" icon="search" loading={searching} disabled={q.trim().length < 2}>Buscar</Button>
        </form>
        {candidates && (
          candidates.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>Nenhuma conta disponível com esse nome. Contas com cadastro institucional próprio ou já vinculadas a outra instituição não aparecem.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {candidates.map((c) => (
                <li key={c.userId} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: "var(--th-card-alt)" }}>
                  <Avatar name={c.name} src={c.avatarUrl} id={c.userId} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>{c.name}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--th-muted)" }}>{partyLabel(c)}</span>
                  </span>
                  <Button size="sm" icon="plus" loading={busy === c.userId} onClick={() => invite(c)}>Convidar como {MEMBER_LEVEL_LABELS[inviteLevel]}</Button>
                </li>
              ))}
            </ul>
          )
        )}
      </Card>

      {team === null && !error ? (
        <div className="flex justify-center py-10"><span className="app-spinner" style={{ width: 28, height: 28 }} /></div>
      ) : team && (
        <>
          <MemberSection title="Equipe ativa" members={active} busy={busy} onLevel={changeLevel} onRemove={remove} emptyHint="Ninguém atua em nome da instituição além de você." />
          <MemberSection title="Convites em aberto" members={invited} busy={busy} onLevel={changeLevel} emptyHint="Nenhum convite aguardando resposta." />
          {past.length > 0 && <MemberSection title="Histórico" members={past} busy={busy} />}
        </>
      )}
    </div>
  );
}

function MemberSection({ title, members, busy, onLevel, onRemove, emptyHint }: {
  title: string;
  members: OrganizationMember[];
  busy: string | null;
  onLevel?: (m: OrganizationMember, level: string) => void;
  onRemove?: (m: OrganizationMember) => void;
  emptyHint?: string;
}) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{title}</h2>
      {members.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>{emptyHint}</p>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="app-card flex flex-wrap items-center gap-3 rounded-2xl p-3">
              <Link href={`/perfil/${encodeURIComponent(m.userId)}`}><Avatar name={m.name} src={m.avatarUrl} id={m.userId} size={40} /></Link>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold" style={{ color: "var(--th-text)" }}>{m.name}</span>
                <span className="block truncate text-xs" style={{ color: "var(--th-muted)" }}>{partyLabel(m)} · {formatDate(m.respondedAt ?? m.invitedAt)}</span>
              </span>
              <StatusBadge status={m.status} />
              {onLevel ? (
                <label className="text-xs" style={{ color: "var(--th-muted)" }}>
                  <span className="sr-only">Nível de {m.name}</span>
                  <select className="app-input" value={m.level} disabled={busy === m.id} onChange={(e) => onLevel(m, e.target.value)}>
                    {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              ) : (
                <span className="text-xs font-semibold" style={{ color: "var(--th-muted)" }}>{MEMBER_LEVEL_LABELS[m.level as OrganizationMemberLevel] ?? m.level}</span>
              )}
              {onRemove && <Button size="sm" variant="outline" icon="close" loading={busy === m.id} onClick={() => onRemove(m)}>Remover</Button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
