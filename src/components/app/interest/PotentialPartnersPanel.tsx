"use client";

/**
 * Potenciais parceiros e instituições para a demanda do Agente (T30):
 * "O DM Conecta identifica potenciais parceiros, instituições e outros atores
 * que podem contribuir" (Arquitetura de Perfis §6, etapa 3). Os perfis de
 * apoio compatíveis, pontuados pela mesma compatibilidade da T15, com o pedido
 * de conexão direto daqui ("Receber solicitações de conexão" tem o outro lado:
 * o Agente também pede).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { interestErrorMessage } from "@/lib/app/interest";
import {
  CONNECTION_TYPES, PROFILE_LABELS, ROLE_LABELS, normalizeRole,
  type ConnectionType, type Demand, type PotentialPartner,
} from "@/lib/app/types";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { FormAlert, SelectInput, TextArea } from "../demand/fields";
import { CompatibilityBadge, CompatibilityReasons } from "./CompatibilityCard";

const MIN_MESSAGE = 10;

export function PotentialPartnersPanel({ demand }: { demand: Pick<Demand, "id" | "title" | "postId" | "status"> }) {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<PotentialPartner[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    setCandidates(null);
    api.potentialPartners(demand.id)
      .then((data) => { if (alive) { setCandidates(data.candidates); setAvailable(data.available); } })
      .catch((err) => { if (alive) { setError(interestErrorMessage(err, "Não foi possível identificar parceiros agora.")); setCandidates([]); } });
    return () => { alive = false; };
  }, [demand.id, demand.status]);

  return (
    <section className="mt-5" aria-labelledby={`pp-${demand.id}`}>
      <h3 id={`pp-${demand.id}`} className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Potenciais parceiros e instituições</h3>
      <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>
        Perfis de apoio compatíveis com o território, a categoria e os recursos desta demanda. A pontuação mostra os motivos; a conexão só acontece se o outro lado aceitar.
      </p>
      {error && <div className="mt-2"><FormAlert message={error} /></div>}
      {candidates === null ? (
        <div className="flex justify-center py-6"><span className="app-spinner" style={{ width: 24, height: 24 }} /></div>
      ) : !available ? (
        <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>A identificação começa com a demanda publicada.</p>
      ) : candidates.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>
          Nenhum perfil de apoio compatível ainda. Os Parceiros e o Poder Público preenchem o perfil de apoio em Oportunidades.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {candidates.map((c) => (
            <li key={c.userId} className="rounded-xl p-3" style={{ background: "var(--th-card-alt)" }}>
              <div className="flex items-start gap-3">
                <Link href={`/perfil/${encodeURIComponent(c.userId)}`} className="shrink-0">
                  <Avatar name={c.name} src={c.avatarUrl} id={c.userId} size={40} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/perfil/${encodeURIComponent(c.userId)}`} className="truncate text-sm font-bold hover:underline" style={{ color: "var(--th-text)" }}>{c.name}</Link>
                    <CompatibilityBadge compatibility={c.compatibility} />
                  </div>
                  <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                    {[c.role && ROLE_LABELS[normalizeRole(c.role, c.profileType)], c.profileType && PROFILE_LABELS[c.profileType], [c.city, c.state].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-2"><CompatibilityReasons compatibility={c.compatibility} showProfileHint={false} /></div>
                  <div className="mt-3">
                    {c.alreadyInterested ? (
                      <p className="text-xs font-semibold" style={{ color: "#2e9e5b" }}>Já demonstrou interesse nesta demanda: veja em Interessados e conexões.</p>
                    ) : requested[c.userId] ? (
                      <p className="text-xs font-semibold" style={{ color: "#2e9e5b" }}>
                        Conexão solicitada. <Link href={`/conexoes/${encodeURIComponent(requested[c.userId])}`} className="underline">Acompanhar</Link>
                      </p>
                    ) : user ? (
                      <ConnectionRequest
                        candidate={c}
                        demand={demand}
                        onSent={(connectionId) => setRequested((r) => ({ ...r, [c.userId]: connectionId }))}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConnectionRequest({ candidate, demand, onSent }: {
  candidate: PotentialPartner;
  demand: Pick<Demand, "id" | "title" | "postId">;
  onSent: (connectionId: string) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ConnectionType>("support");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const connection = await api.createConnection({
        from: user, toUserId: candidate.userId, type, message: message.trim(),
        demandId: demand.id, postId: demand.postId, postTitle: demand.title,
      });
      onSent(connection.id);
    } catch (err) {
      setError(interestErrorMessage(err, "Não foi possível solicitar a conexão agora."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Button size="sm" icon="link" onClick={() => setOpen(true)}>Solicitar conexão</Button>;

  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <SelectInput
        name={`ctype-${candidate.userId}`}
        label="Tipo de conexão"
        value={type}
        onValue={(v) => setType(v as ConnectionType)}
        options={CONNECTION_TYPES.map((t) => ({ value: t.type, label: t.label }))}
      />
      <TextArea
        name={`cmsg-${candidate.userId}`}
        label="Mensagem"
        required
        value={message}
        onValue={setMessage}
        rows={3}
        maxLength={2000}
        hint={`Diga o que a demanda precisa e como este perfil pode ajudar (mínimo ${MIN_MESSAGE} caracteres).`}
      />
      {error && <FormAlert message={error} />}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
        <Button size="sm" type="submit" icon="send" loading={busy} disabled={message.trim().length < MIN_MESSAGE}>Enviar pedido</Button>
      </div>
      <p className="text-[11px]" style={{ color: "var(--th-muted)" }}>
        <Icon name="info" size={11} className="mr-1 inline" />O pedido chega ao perfil como uma solicitação de conexão vinculada a esta demanda.
      </p>
    </form>
  );
}
