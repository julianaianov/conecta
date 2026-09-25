"use client";

/**
 * "Meus processos" (T-05-01): painel dos Processos de Conexão em que a conta é
 * o Agente autor da demanda ou a parte conectada (conta do Parceiro ou órgão do
 * Poder Público). Modelo de Conexão §08 ("painel de processos") e §28.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate } from "@/lib/app/format";
import {
  PARTY_KIND_LABELS, PROCESSES_PATH, connectionNumberLabel, processErrorMessage, processPath, type ProcessSummary,
} from "@/lib/app/process";
import { AuthPrompt } from "../AuthPrompt";
import { Card, EmptyState } from "../ui";
import { FormAlert } from "../demand/fields";
import { ProcessStatusBadge } from "./ProcessParts";

export function MyProcessesClient() {
  const { user, status } = useAuth();
  const [processes, setProcesses] = useState<ProcessSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    api.myProcesses()
      .then((list) => { if (alive) setProcesses(list); })
      .catch((err) => { if (alive) { setError(processErrorMessage(err, "Não foi possível carregar os processos.")); setProcesses([]); } });
    return () => { alive = false; };
  }, [status]);

  if (status === "unknown") return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Processos de conexão</h1>
          <div className="mt-4"><AuthPrompt action="ver seus processos" returnTo={PROCESSES_PATH} /></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Processos de conexão</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Quando a conexão é formalizada, nasce um processo com protocolo. Comunicação, responsáveis, prazos e status ficam vinculados a ele.
        </p>
      </header>
      {error && <FormAlert message={error} />}
      {processes === null ? (
        <div className="flex justify-center py-16"><span className="app-spinner" style={{ width: 28, height: 28 }} /></div>
      ) : processes.length === 0 ? (
        <EmptyState icon="document" title="Nenhum processo ainda" hint="O processo nasce quando o Agente aceita a conexão de apoio ou quando o órgão formaliza a atuação na demanda." />
      ) : (
        <ul className="space-y-2">
          {processes.map((p) => (
            <li key={p.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={processPath(p.protocol)} className="font-mono text-base font-bold underline" style={{ color: "var(--th-text)" }}>{p.protocol}</Link>
                  <ProcessStatusBadge status={p.status} />
                  <span className="text-xs" style={{ color: "var(--th-muted)" }}>{connectionNumberLabel(p.sequenceInDemand)}</span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>{p.demandTitle ?? "Demanda"}</p>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  {p.viewerRole === "agente" ? `Parte: ${p.partyName} (${PARTY_KIND_LABELS[p.partyKind] ?? p.partyKind})` : "Você é a parte conectada"}
                  {p.statusChangedAt ? ` · atualizado em ${formatDate(p.statusChangedAt)}` : ""}
                  {p.responsibleDueOn ? ` · data limite ${formatDate(`${p.responsibleDueOn}T12:00:00`)}` : ""}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
