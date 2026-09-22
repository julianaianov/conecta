"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import {
  INTEREST_CONNECTION_LABELS,
  INTEREST_KIND_LABELS,
  INTEREST_USER_CATEGORY_LABELS,
  OFFER_TYPE_LABELS,
  interestErrorMessage,
} from "@/lib/app/interest";
import {
  PROFILE_LABELS,
  type AgentDemandInterest,
  type DemandStatus,
  type InstitutionValidationStatus,
  type InterestSummary,
} from "@/lib/app/types";
import { formatDate } from "@/lib/app/format";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { FormAlert } from "../demand/fields";

/**
 * Interessados de uma demanda, na visão do Agente autor (T15): quem
 * manifestou, o que oferece, a mensagem e o pedido de conexão. Aceitar leva a
 * demanda a "Conectada" (o servidor faz a transição como `sistema`).
 */
export function DemandInterestsInbox({ demandId, onStatus }: { demandId: string; onStatus: (status: DemandStatus) => void }) {
  const [interests, setInterests] = useState<AgentDemandInterest[] | null>(null);
  const [summary, setSummary] = useState<InterestSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);

  useEffect(() => {
    let alive = true;
    api.agentDemandInterests(demandId)
      .then((data) => { if (alive) { setInterests(data.interests); setSummary(data.summary); } })
      .catch((err) => { if (alive) setError(interestErrorMessage(err, "Não foi possível carregar os interessados.")); });
    return () => { alive = false; };
  }, [demandId]);

  async function respond(interest: AgentDemandInterest, accept: boolean) {
    if (!interest.connectionId) return;
    setBusy(interest.id);
    setError(null);
    setNotice(null);
    setGate(null);
    try {
      if (accept) {
        const result = await api.acceptDemandConnection(demandId, interest.connectionId);
        onStatus(result.demand.status);
        setNotice(result.transitioned ? "Conexão aceita. A demanda agora está Conectada." : "Conexão aceita.");
        if (result.interest) setInterests((list) => list?.map((i) => (i.id === interest.id ? result.interest! : i)) ?? null);
      } else {
        const result = await api.declineDemandConnection(demandId, interest.connectionId);
        setNotice("Pedido de conexão recusado.");
        if (result.interest) setInterests((list) => list?.map((i) => (i.id === interest.id ? result.interest! : i)) ?? null);
      }
    } catch (err) {
      if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) });
      else setError(interestErrorMessage(err, "Não foi possível responder agora."));
    } finally {
      setBusy(null);
    }
  }

  if (!interests && !error) return <div className="flex justify-center py-4"><span className="app-spinner" aria-label="Carregando interessados" /></div>;

  const open = interests?.filter((i) => !i.withdrawnAt) ?? [];
  return (
    <div className="space-y-3">
      {summary && (
        <p className="text-xs" style={{ color: "var(--th-muted)" }}>
          {summary.apoio} em apoiar · {summary.participacao} em participar · {summary.voluntariado} voluntariado · {summary.acceptedConnections} conexões aceitas
        </p>
      )}
      {open.length === 0 && !error && (
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>
          Ainda ninguém demonstrou interesse. Marcar a demanda como &quot;Buscar parceiro&quot; ajuda a aparecer nas oportunidades de apoio.
        </p>
      )}
      <ul className="space-y-2">
        {open.map((interest) => (
          <li key={interest.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
            <div className="flex items-start gap-3">
              <Link href={`/perfil/${encodeURIComponent(interest.user.userId)}`} className="shrink-0">
                <Avatar name={interest.user.name ?? "Conta"} src={interest.user.avatarUrl} id={interest.user.userId} size={36} />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>
                  <Link href={`/perfil/${encodeURIComponent(interest.user.userId)}`} className="hover:underline">{interest.user.name ?? "Conta"}</Link>
                </p>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  {[INTEREST_USER_CATEGORY_LABELS[interest.user.category], interest.user.profileType ? PROFILE_LABELS[interest.user.profileType] : null].filter(Boolean).join(" · ")}
                  {" · "}{formatDate(interest.createdAt)}
                </p>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--th-text)" }}>{INTEREST_KIND_LABELS[interest.kind]}</p>
                {interest.offerTypes.length > 0 && (
                  <p className="text-xs" style={{ color: "var(--th-text)" }}>Oferece: {interest.offerTypes.map((o) => OFFER_TYPE_LABELS[o]).join(", ")}</p>
                )}
                {interest.message && <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{interest.message}</p>}
                {interest.connectionStatus && (
                  <p className="mt-1 text-xs font-semibold" style={{ color: interest.connectionStatus === "aceita" ? "#2e9e5b" : "var(--th-muted)" }}>
                    {INTEREST_CONNECTION_LABELS[interest.connectionStatus]}
                    {interest.connectionId && interest.connectionStatus !== "cancelada" && (
                      <> · <Link href={`/conexoes/${encodeURIComponent(interest.connectionId)}`} style={{ color: "#f4841a" }}>ver conexão</Link></>
                    )}
                  </p>
                )}
                {interest.connectionStatus === "pendente" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" icon="check" loading={busy === interest.id} disabled={busy !== null} onClick={() => void respond(interest, true)}>
                      Aceitar conexão
                    </Button>
                    <Button type="button" size="sm" variant="outline" icon="close" disabled={busy !== null} onClick={() => void respond(interest, false)}>
                      Recusar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {notice && <FormAlert tone="success" message={notice} />}
      {error && <FormAlert message={error} />}
      {gate && <InstitutionGateNotice action="mover_demanda" status={gate.status} kind="agente_transformacao" />}
    </div>
  );
}
