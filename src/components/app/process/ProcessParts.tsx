"use client";

/**
 * Peças do Processo de Conexão (T-05-01): selo do status (§16), lista pública
 * dos processos da demanda (protocolo, tipo de parte, contribuição e status;
 * nunca nome de pessoa) e o link "Processo DM-…" para a conexão formalizada.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { formatDate } from "@/lib/app/format";
import {
  PROCESS_STATUS_COLORS, connectionNumberLabel, contributionLabels, processFeesLine, processPath, processStatusLabel,
  publicPartyLabel,
  type ProcessStatus, type ProcessSummary, type PublicProcess,
} from "@/lib/app/process";
import { Icon } from "../Icon";

export function ProcessStatusBadge({ status }: { status: ProcessStatus }) {
  const color = PROCESS_STATUS_COLORS[status] ?? "#4a6f88";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}1a`, color }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {processStatusLabel(status)}
    </span>
  );
}

/** Seção pública "Processos de conexão" da página da demanda (§28). */
export function DemandProcessesSection({ demandId }: { demandId: string }) {
  const [processes, setProcesses] = useState<PublicProcess[] | null>(null);

  useEffect(() => {
    let alive = true;
    api.demandProcesses(demandId)
      .then((list) => { if (alive) setProcesses(list); })
      .catch(() => { if (alive) setProcesses([]); });
    return () => { alive = false; };
  }, [demandId]);

  if (!processes || processes.length === 0) return null;
  return (
    <section aria-labelledby="processos-de-conexao" className="space-y-2">
      <h2 id="processos-de-conexao" className="text-base font-bold" style={{ color: "var(--th-text)" }}>Processos de conexão</h2>
      <p className="text-xs" style={{ color: "var(--th-muted)" }}>
        Cada parte conectada tem o próprio processo, com protocolo, contribuição e status.
      </p>
      <ul className="space-y-2">
        {processes.map((p) => (
          <li key={p.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{connectionNumberLabel(p.sequenceInDemand)}</span>
              <span className="font-mono text-sm font-bold" style={{ color: "var(--th-text)" }}>{p.protocol}</span>
              <ProcessStatusBadge status={p.status} />
            </div>
            <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>{publicPartyLabel(p)}</p>
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>
              Contribuição: {contributionLabels(p.contributionKinds)}
              {p.formalizedAt ? ` · formalizado em ${formatDate(p.formalizedAt)}` : ""}
            </p>
            {processFeesLine(p.fees) && (
              <p className="text-xs font-numeric" style={{ color: "var(--th-text)" }}>{processFeesLine(p.fees)}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Link para o processo nascido desta conexão, quando ela já foi formalizada. */
export function ConnectionProcessLink({ connectionId }: { connectionId: string }) {
  const [process, setProcess] = useState<ProcessSummary | null>(null);
  useEffect(() => {
    let alive = true;
    api.processByConnection(connectionId)
      .then((p) => { if (alive) setProcess(p); })
      .catch(() => { if (alive) setProcess(null); });
    return () => { alive = false; };
  }, [connectionId]);
  if (!process) return null;
  return (
    <Link href={processPath(process.protocol)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
      <Icon name="document" size={16} />
      Processo {process.protocol} · {processStatusLabel(process.status)}
    </Link>
  );
}
