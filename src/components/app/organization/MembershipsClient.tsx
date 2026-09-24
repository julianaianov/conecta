"use client";

/**
 * "Meus vínculos" (T29): convites para atuar em nome de uma instituição e o
 * vínculo ativo, com as permissões do nível em texto. Aceitar passa a conta a
 * agir em nome da instituição (Arquitetura de Perfis §4/§5: vínculo e
 * permissões delegadas); sair encerra a delegação.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate } from "@/lib/app/format";
import {
  DELEGATED_PERMISSION_LABELS, MEMBERSHIPS_PATH, MEMBER_LEVEL_LABELS, membershipErrorMessage,
  type DelegatedPermission, type OrganizationMemberLevel,
} from "@/lib/app/organization";
import { INSTITUTION_KIND_LABELS, INSTITUTION_STATUS_LABELS, type Membership, type MyMemberships } from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Card, EmptyState } from "../ui";
import { FormAlert } from "../demand/fields";
import { invalidateInstitutionAccess } from "../institution/useInstitutionAccess";

function PermissionList({ permissions }: { permissions: string[] }) {
  return (
    <ul className="mt-2 space-y-1" aria-label="O que este vínculo permite">
      {permissions.map((p) => (
        <li key={p} className="flex items-start gap-2 text-sm" style={{ color: "var(--th-text)" }}>
          <Icon name="check" size={14} className="mt-0.5 shrink-0" style={{ color: "#2e9e5b" }} />
          <span>{DELEGATED_PERMISSION_LABELS[p as DelegatedPermission] ?? p}</span>
        </li>
      ))}
    </ul>
  );
}

function OrganizationLine({ membership: m }: { membership: Membership }) {
  return (
    <p className="text-xs" style={{ color: "var(--th-muted)" }}>
      {INSTITUTION_KIND_LABELS[m.organization.kind]} · {INSTITUTION_STATUS_LABELS[m.organization.validationStatus]} · nível {MEMBER_LEVEL_LABELS[m.level as OrganizationMemberLevel] ?? m.level}
    </p>
  );
}

export function MembershipsClient() {
  const { user, status } = useAuth();
  const [data, setData] = useState<MyMemberships | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.myMemberships());
      setError(null);
    } catch (err) {
      setError(membershipErrorMessage(err, "Não foi possível carregar seus vínculos."));
      setData({ active: null, invites: [] });
    }
  }, []);

  useEffect(() => { if (status === "authenticated") void load(); }, [status, load]);

  async function respond(m: Membership, action: "accept" | "decline" | "leave") {
    setBusy(m.id);
    setError(null);
    setNotice(null);
    try {
      await api.respondMembership(m.id, action);
      invalidateInstitutionAccess();
      setNotice(action === "accept"
        ? `Agora você atua em nome de ${m.organization.name}.`
        : action === "decline" ? "Convite recusado." : `Você saiu da equipe de ${m.organization.name}.`);
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
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Meus vínculos</h1>
          <div className="mt-4"><AuthPrompt action="ver seus vínculos" returnTo={MEMBERSHIPS_PATH} /></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Meus vínculos</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Uma instituição pode convidar você para atuar em nome dela, com permissões delegadas pelo nível. Uma conta atua em nome de uma instituição por vez.
        </p>
      </header>
      {error && <FormAlert message={error} />}
      {notice && <FormAlert message={notice} tone="success" />}
      {data === null ? (
        <div className="flex justify-center py-16"><span className="app-spinner" style={{ width: 28, height: 28 }} /></div>
      ) : (
        <>
          <section aria-labelledby="vinculo-ativo">
            <h2 id="vinculo-ativo" className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Vínculo ativo</h2>
            {data.active ? (
              <Card>
                <p className="text-base font-bold" style={{ color: "var(--th-text)" }}>{data.active.organization.name}</p>
                <OrganizationLine membership={data.active} />
                <PermissionList permissions={data.active.permissions} />
                <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Desde {formatDate(data.active.respondedAt ?? data.active.invitedAt)}</p>
                {data.active.organization.validationStatus !== "validada" && (
                  <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>A instituição ainda não foi validada pela equipe: as ações em nome dela ficam liberadas depois da validação.</p>
                )}
                <div className="mt-3">
                  <Button size="sm" variant="outline" icon="logout" loading={busy === data.active.id} onClick={() => respond(data.active!, "leave")}>Sair da equipe</Button>
                </div>
              </Card>
            ) : (
              <p className="text-sm" style={{ color: "var(--th-muted)" }}>Você não atua em nome de nenhuma instituição.</p>
            )}
          </section>

          <section aria-labelledby="convites">
            <h2 id="convites" className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Convites</h2>
            {data.invites.length === 0 ? (
              <EmptyState icon="building" title="Nenhum convite em aberto" hint="Quando uma instituição convidar você, o convite aparece aqui e no sino." />
            ) : (
              <ul className="space-y-3">
                {data.invites.map((m) => (
                  <li key={m.id}>
                    <Card>
                      <p className="text-base font-bold" style={{ color: "var(--th-text)" }}>{m.organization.name}</p>
                      <OrganizationLine membership={m} />
                      <PermissionList permissions={m.permissions} />
                      <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Convite em {formatDate(m.invitedAt)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" icon="check" loading={busy === m.id} disabled={Boolean(data.active)} onClick={() => respond(m, "accept")}>Aceitar</Button>
                        <Button size="sm" variant="outline" icon="close" disabled={busy === m.id} onClick={() => respond(m, "decline")}>Recusar</Button>
                      </div>
                      {data.active && <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Para aceitar, saia primeiro da equipe atual.</p>}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-xs" style={{ color: "var(--th-muted)" }}>
            Tem cadastro institucional próprio? A equipe da sua instituição é gerida em <Link href="/cadastro-institucional/equipe" className="font-semibold underline">Equipe da instituição</Link>.
          </p>
        </>
      )}
    </div>
  );
}
