"use client";

/**
 * Processo de Conexão na área institucional (T-05-01, decisão 13): o órgão
 * formaliza a atuação na demanda e o acompanhamento passa a ter protocolo;
 * daí em diante o status do acompanhamento espelha o do processo.
 */
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/app/api";
import { contributionLabels, processErrorMessage, processPath } from "@/lib/app/process";
import type { InstitutionalDemandView } from "@/lib/app/types";
import { Button } from "../Button";
import { FormAlert } from "../demand/fields";
import { ProcessStatusBadge } from "./ProcessParts";

const TRACK_CLOSED = ["concluida", "nao_e_de_competencia", "encaminhada_ao_orgao_responsavel", "nao_aprovada", "cancelada"];

export function InstitutionalProcessPanel({ view, onSaved }: { view: InstitutionalDemandView; onSaved: (v: InstitutionalDemandView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const process = view.process ?? null;

  if (process) {
    return (
      <div className="space-y-2">
        <p className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--th-text)" }}>
          Processo <Link href={processPath(process.protocol)} className="font-mono font-bold underline">{process.protocol}</Link>
          <ProcessStatusBadge status={process.status} />
        </p>
        <p className="text-xs" style={{ color: "var(--th-muted)" }}>
          Contribuição: {contributionLabels(process.contributionKinds)}. O status do acompanhamento segue o do processo.
        </p>
      </div>
    );
  }
  if (view.track && TRACK_CLOSED.includes(view.track.status)) return null;

  async function formalize() {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.formalizeInstitutionalProcess(view.demand.id));
    } catch (err) {
      setError(processErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--th-text)" }}>
        Ao decidir avançar, o órgão formaliza a conexão: o sistema gera o protocolo DM-AAAA-NNNNNN e todas as ações passam a ficar vinculadas a ele. A contribuição vem da última oferta de apoio do órgão nesta demanda.
      </p>
      {error && <FormAlert message={error} />}
      <Button type="button" icon="document" loading={busy} onClick={() => void formalize()}>Formalizar conexão</Button>
    </div>
  );
}
