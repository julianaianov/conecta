"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import {
  INTEREST_CONNECTION_LABELS,
  INTEREST_KIND_ACTIONS,
  INTEREST_KIND_LABELS,
  OFFER_TYPES,
  OFFER_TYPE_LABELS,
  OPPORTUNITIES_PATH,
  canFilterOpportunities,
  interestErrorMessage,
} from "@/lib/app/interest";
import { MY_DEMANDS_PATH } from "@/lib/app/demand";
import {
  CONNECTION_TYPES,
  type ConnectionType,
  type DemandInterest,
  type DemandInterestContext,
  type InstitutionValidationStatus,
  type InterestKind,
  type InterestOfferType,
  type InterestSummary,
} from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { ReadSection } from "../demand/DemandParts";
import { Checkbox, FormAlert, SelectInput, TextArea } from "../demand/fields";
import { CompatibilityBadge, CompatibilityReasons } from "./CompatibilityCard";

function summaryText(summary: InterestSummary): string {
  const parts = [
    summary.apoio ? `${summary.apoio} ${summary.apoio === 1 ? "interessado" : "interessados"} em apoiar` : null,
    summary.participacao ? `${summary.participacao} ${summary.participacao === 1 ? "pessoa quer" : "pessoas querem"} participar` : null,
    summary.voluntariado ? `${summary.voluntariado} ${summary.voluntariado === 1 ? "oferta" : "ofertas"} de voluntariado` : null,
    summary.acceptedConnections ? `${summary.acceptedConnections} ${summary.acceptedConnections === 1 ? "conexão aceita" : "conexões aceitas"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Ainda sem manifestações.";
}

type Gate = { status: InstitutionValidationStatus | null } | null;

/** Formulário da manifestação (oferta só no apoio). */
function InterestForm({ kind, busy, onSubmit, onCancel }: {
  kind: InterestKind;
  busy: boolean;
  onSubmit: (offerTypes: InterestOfferType[], message: string) => void;
  onCancel: () => void;
}) {
  const [offers, setOffers] = useState<InterestOfferType[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toggle = (offer: InterestOfferType, on: boolean) => setOffers((list) => (on ? [...list, offer] : list.filter((o) => o !== offer)));

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border p-3"
      style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === "apoio" && offers.length === 0) {
          setError("Marque pelo menos uma forma de apoio.");
          return;
        }
        setError(null);
        onSubmit(offers, message);
      }}
    >
      {kind === "apoio" && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold" style={{ color: "var(--th-text)" }}>O que você pretende oferecer?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {OFFER_TYPES.map((offer) => (
              <Checkbox key={offer} name={`oferta-${offer}`} label={OFFER_TYPE_LABELS[offer]} checked={offers.includes(offer)} onChecked={(on) => toggle(offer, on)} />
            ))}
          </div>
        </fieldset>
      )}
      <TextArea
        name={`mensagem-${kind}`}
        label={kind === "voluntariado" ? "Como você pode ajudar (dias, horários, habilidades)" : "Mensagem para o Agente (opcional)"}
        value={message}
        onValue={setMessage}
        rows={3}
        maxLength={2000}
      />
      {error && <FormAlert message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" icon="check" loading={busy}>Registrar</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
      </div>
    </form>
  );
}

function ConnectionForm({ busy, onSubmit, onCancel }: {
  busy: boolean;
  onSubmit: (type: ConnectionType | undefined, message: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border p-3"
      style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!message.trim()) {
          setError("Escreva uma mensagem para o Agente de Transformação.");
          return;
        }
        setError(null);
        onSubmit((type || undefined) as ConnectionType | undefined, message.trim());
      }}
    >
      <SelectInput
        name="tipo-conexao"
        label="Tipo de conexão"
        value={type}
        onValue={setType}
        placeholder="Sugerido pelo que você ofereceu"
        options={CONNECTION_TYPES.map((c) => ({ value: c.type, label: c.label }))}
      />
      <TextArea name="mensagem-conexao" label="Mensagem" required value={message} onValue={setMessage} rows={3} maxLength={2000}
        hint="O Agente recebe o pedido em Conexões e em Minhas demandas e pode aceitar ou recusar." />
      {error && <FormAlert message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" icon="send" loading={busy}>Solicitar conexão</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
      </div>
    </form>
  );
}

function OwnInterestCard({ interest, busy, onConnect, onWithdraw, open }: {
  interest: DemandInterest;
  busy: boolean;
  open: boolean;
  onConnect: (type: ConnectionType | undefined, message: string) => void;
  onWithdraw: () => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const canConnect = open && (interest.connectionStatus === null || interest.connectionStatus === "recusada" || interest.connectionStatus === "cancelada");
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "rgba(46,158,91,0.4)", background: "rgba(46,158,91,0.06)" }}>
      <p className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
        <Icon name="check" size={15} style={{ color: "#2e9e5b" }} /> {INTEREST_KIND_LABELS[interest.kind]}
      </p>
      {interest.offerTypes.length > 0 && (
        <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>Oferta: {interest.offerTypes.map((o) => OFFER_TYPE_LABELS[o]).join(", ")}</p>
      )}
      {interest.connectionStatus && (
        <p className="mt-1 text-xs font-semibold" style={{ color: "var(--th-text)" }}>
          {INTEREST_CONNECTION_LABELS[interest.connectionStatus]}
          {interest.connectionId && (interest.connectionStatus === "pendente" || interest.connectionStatus === "aceita") && (
            <> · <Link href={`/conexoes/${encodeURIComponent(interest.connectionId)}`} style={{ color: "#f4841a" }}>ver conexão</Link></>
          )}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {canConnect && !connecting && (
          <Button type="button" size="sm" icon="link" onClick={() => setConnecting(true)}>Solicitar conexão</Button>
        )}
        <Button type="button" size="sm" variant="ghost" icon="close" disabled={busy} onClick={onWithdraw}>Retirar</Button>
      </div>
      {connecting && (
        <ConnectionForm
          busy={busy}
          onCancel={() => setConnecting(false)}
          onSubmit={(type, message) => { onConnect(type, message); setConnecting(false); }}
        />
      )}
    </div>
  );
}

/**
 * "Apoio e participação" na página pública da demanda (T15): contagens
 * públicas e, para quem tem a permissão da fonte, "Tenho interesse" (Parceiro,
 * Poder Público), "Quero participar" e "Quero ser voluntário" (Membro da
 * Comunidade), seguidos de "Solicitar conexão" com o Agente.
 */
export function DemandInterestPanel({ demandId, authorId, postId }: {
  demandId: string;
  authorId: string;
  postId: string | null;
}) {
  const { user, status: authStatus } = useAuth();
  const [summary, setSummary] = useState<InterestSummary | null>(null);
  const [context, setContext] = useState<DemandInterestContext | null>(null);
  const [opening, setOpening] = useState<InterestKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate>(null);

  const reload = useCallback(async () => {
    const [nextSummary, nextContext] = await Promise.all([
      api.demandInterestSummary(demandId).catch(() => null),
      user ? api.demandInterestContext(demandId).catch(() => null) : Promise.resolve(null),
    ]);
    setSummary(nextSummary);
    setContext(nextContext);
  }, [demandId, user]);

  useEffect(() => {
    if (authStatus !== "unknown") void reload();
  }, [authStatus, reload]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    setGate(null);
    try {
      await fn();
      setNotice(done);
      setOpening(null);
      await reload();
    } catch (err) {
      if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) });
      else setError(interestErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const active = (context?.interests ?? []).filter((i) => !i.withdrawnAt);
  const isAuthor = Boolean(user && user.id === authorId);
  const allowed = context?.allowedKinds ?? [];
  const open = context?.open ?? true;

  return (
    <ReadSection title="Apoio e participação" icon="volunteer">
      <p className="text-sm" style={{ color: "var(--th-muted)" }} aria-live="polite">{summary ? summaryText(summary) : " "}</p>
      <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
        Demanda publicada → interesse → conexão com o Agente de Transformação → apoio. Nomes e mensagens ficam só com o Agente.
      </p>

      {!user && authStatus !== "unknown" && (
        <div className="mt-3"><AuthPrompt action="demonstrar interesse, participar ou se conectar com esta demanda" returnTo={`/demandas/${encodeURIComponent(demandId)}`} /></div>
      )}

      {isAuthor && (
        <p className="mt-3 text-sm" style={{ color: "var(--th-text)" }}>
          Você publicou esta demanda. Veja quem se interessou e responda às conexões em{" "}
          <Link href={MY_DEMANDS_PATH} className="font-bold" style={{ color: "#f4841a" }}>Minhas demandas</Link>.
        </p>
      )}

      {user && !isAuthor && context && (
        <div className="mt-3 space-y-3">
          {context.compatibility && (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Compatibilidade com o seu perfil de apoio</p>
                <CompatibilityBadge compatibility={context.compatibility} />
              </div>
              <CompatibilityReasons compatibility={context.compatibility} />
            </div>
          )}

          {active.map((interest) => (
            <OwnInterestCard
              key={interest.id}
              interest={interest}
              busy={busy}
              open={open}
              onConnect={(type, message) => void act(
                () => api.requestInterestConnection(demandId, interest.id, { type, message }),
                "Conexão solicitada ao Agente de Transformação.",
              )}
              onWithdraw={() => void act(() => api.withdrawInterest(demandId, interest.id), "Manifestação retirada.")}
            />
          ))}

          {!open && <FormAlert tone="info" message="Esta demanda não recebe novas manifestações no estado atual." />}

          {open && allowed.filter((kind) => !active.some((i) => i.kind === kind)).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allowed.filter((kind) => !active.some((i) => i.kind === kind)).map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  size="sm"
                  variant={opening === kind ? "primary" : "secondary"}
                  icon={kind === "apoio" ? "volunteer" : kind === "voluntariado" ? "handyman" : "groups"}
                  aria-expanded={opening === kind}
                  onClick={() => setOpening(opening === kind ? null : kind)}
                >
                  {INTEREST_KIND_ACTIONS[kind]}
                </Button>
              ))}
            </div>
          )}
          {opening && (
            <InterestForm
              kind={opening}
              busy={busy}
              onCancel={() => setOpening(null)}
              onSubmit={(offerTypes, message) => void act(
                () => api.registerInterest(demandId, { kind: opening, offerTypes, message: message.trim() || null }),
                "Interesse registrado. Agora você pode solicitar a conexão com o Agente.",
              )}
            />
          )}

          {allowed.length === 0 && (
            <p className="text-sm" style={{ color: "var(--th-muted)" }}>
              Seu perfil acompanha e divulga as demandas; para falar com o Agente, use{" "}
              <Link href="/conexoes/nova" className="font-bold" style={{ color: "#f4841a" }}>Solicitar conexão</Link>.
            </p>
          )}

          {canFilterOpportunities(user.role, user.profileType) && (
            <Link href={OPPORTUNITIES_PATH} className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: "#f4841a" }}>
              <Icon name="filter" size={15} /> Ver outras oportunidades de apoio
            </Link>
          )}
          {allowed.includes("participacao") && postId && (
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>
              Para apoiar, comentar ou compartilhar, use a publicação no{" "}
              <Link href={`/post/${encodeURIComponent(postId)}`} className="font-bold" style={{ color: "#f4841a" }}>pulso</Link>.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 space-y-2" aria-live="polite">
        {notice && <FormAlert tone="success" message={notice} />}
        {error && <FormAlert message={error} />}
        {gate && <InstitutionGateNotice action="interesse" status={gate.status} />}
      </div>
    </ReadSection>
  );
}
