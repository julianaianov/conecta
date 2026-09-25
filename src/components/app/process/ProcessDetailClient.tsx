"use client";

/**
 * Tela do Processo de Conexão (T-05-01): protocolo DM-AAAA-NNNNNN, parte e
 * contribuição, status do Modelo §16 com as mudanças que cabem a quem vê,
 * responsável atual (§14) e linha do tempo do processo (§35). Privada: só o
 * Agente autor e a parte conectada; para os demais a API responde 404.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate } from "@/lib/app/format";
import {
  PARTY_KIND_LABELS, connectionNumberLabel, contributionLabels, formatCents, processErrorMessage, processFeesLine,
  processPath, processRequiresNote, processStatusLabel, processTimelineLabel,
  type ProcessDetail, type ProcessResponsible, type ProcessStatus,
} from "@/lib/app/process";
import { timelineEventLabel } from "@/lib/app/demand";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Card, EmptyState } from "../ui";
import { FormAlert, SelectInput, TextArea, TextInput } from "../demand/fields";
import { ProcessStatusBadge } from "./ProcessParts";
import { ProcessDeadlines } from "./ProcessDeadlines";

const RESPONSIBLE_FIELDS: { key: Exclude<keyof ProcessResponsible, "since" | "dueOn">; label: string }[] = [
  { key: "organizationName", label: "Instituição" },
  { key: "organ", label: "Órgão" },
  { key: "department", label: "Secretaria" },
  { key: "sector", label: "Setor" },
  { key: "name", label: "Responsável" },
  { key: "role", label: "Cargo" },
];

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold" style={{ color: "var(--th-muted)" }}>{label}</dt>
      <dd className="text-sm" style={{ color: "var(--th-text)" }}>{value || "—"}</dd>
    </div>
  );
}

function StatusForm({ detail, onDone }: { detail: ProcessDetail; onDone: (d: ProcessDetail) => void }) {
  const { process } = detail;
  const [status, setStatus] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!process.availableStatuses.length) return null;
  const needsNote = status !== "" && processRequiresNote(status);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await api.changeProcessStatus(process.id, status as ProcessStatus, note.trim() || null));
      setStatus("");
      setNote("");
    } catch (err) {
      setError(processErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Mudar o status do processo">
      {error && <FormAlert message={error} />}
      <SelectInput
        name="process-status"
        label="Novo status"
        value={status}
        onValue={setStatus}
        placeholder="Escolha"
        options={process.availableStatuses.map((s) => ({
          value: s,
          label: s === process.previousStatus ? `${processStatusLabel(s)} (retomar)` : processStatusLabel(s),
        }))}
      />
      {needsNote && (
        <TextArea name="process-note" label="Motivo" required value={note} onValue={setNote} rows={3}
          hint="A fonte pede o motivo em recusa, suspensão e cancelamento." />
      )}
      <Button type="submit" size="sm" icon="check" loading={busy} disabled={!status || (needsNote && !note.trim())}>
        Registrar status
      </Button>
    </form>
  );
}

function ResponsibleForm({ detail, onDone }: { detail: ProcessDetail; onDone: (d: ProcessDetail) => void }) {
  const current = detail.process.responsible;
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(RESPONSIBLE_FIELDS.map(({ key }) => [key, current[key] ?? ""])),
    dueOn: current.dueOn ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim() || null]));
      onDone(await api.setProcessResponsible(detail.process.id, input));
    } catch (err) {
      setError(processErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" aria-label="Responsável atual">
      {error && <div className="sm:col-span-2"><FormAlert message={error} /></div>}
      {RESPONSIBLE_FIELDS.map(({ key, label }) => (
        <TextInput key={key} name={`responsible-${key}`} label={label} value={values[key] ?? ""}
          onValue={(v) => setValues((prev) => ({ ...prev, [key]: v }))} maxLength={255} />
      ))}
      <TextInput name="responsible-dueOn" label="Data limite da próxima ação" type="date" value={values.dueOn ?? ""}
        onValue={(v) => setValues((prev) => ({ ...prev, dueOn: v }))} />
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" variant="outline" icon="check" loading={busy}>Salvar responsável</Button>
      </div>
    </form>
  );
}

export function ProcessDetailClient({ protocol }: { protocol: string }) {
  const { user, status } = useAuth();
  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await api.getProcess(protocol));
      setError(null);
    } catch (err) {
      setError(processErrorMessage(err, "Não foi possível carregar o processo."));
    }
  }, [protocol]);

  useEffect(() => { if (status === "authenticated") void load(); }, [status, load]);

  if (status === "unknown") return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Processo {protocol}</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>O processo é privado: só o Agente autor da demanda e a parte conectada o consultam.</p>
          <div className="mt-4"><AuthPrompt action="consultar este processo" returnTo={processPath(protocol)} /></div>
        </Card>
      </div>
    );
  }
  if (error && !detail) {
    return <div className="mx-auto max-w-2xl"><EmptyState icon="document" title={error} /></div>;
  }
  if (!detail) return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;

  const p = detail.process;
  const amount = formatCents(p.contributionAmountCents);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
          {connectionNumberLabel(p.sequenceInDemand)} · {p.viewerRole === "agente" ? "Você é o Agente autor" : "Você é a parte conectada"}
        </p>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold" style={{ color: "var(--th-text)" }}>
          Processo <span className="font-mono">{p.protocol}</span> <ProcessStatusBadge status={p.status} />
        </h1>
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>
          Demanda: <Link href={`/demandas/${encodeURIComponent(p.demand.id)}`} className="font-semibold underline">{p.demand.title ?? "ver demanda"}</Link>
          {p.formalizedAt ? ` · formalizado em ${formatDate(p.formalizedAt)}` : ""}
        </p>
      </header>

      <Card>
        <h2 className="mb-2 text-base font-bold" style={{ color: "var(--th-text)" }}>Parte e contribuição</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="Parte conectada" value={`${p.partyName} (${PARTY_KIND_LABELS[p.partyKind] ?? p.partyKind})`} />
          <Row label="Contribuição" value={contributionLabels(p.contributionKinds)} />
          {p.contributionDescription && <Row label="Descrição" value={p.contributionDescription} />}
          {amount && <Row label="Valor declarado" value={amount} />}
          {/* Decisão 14: 4% + 6% sobre a contribuição só com Parceiros/Empresas. */}
          {processFeesLine(p.fees) && <Row label="Valor da conexão" value={processFeesLine(p.fees) ?? ""} />}
        </dl>
        {p.statusNote && (
          <p className="mt-3 text-sm" style={{ color: "var(--th-text)" }}><strong>Motivo do último status:</strong> {p.statusNote}</p>
        )}
        {p.closedAt && <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Processo encerrado em {formatDate(p.closedAt)}.</p>}
      </Card>

      {!p.closedAt && p.availableStatuses.length > 0 && (
        <Card>
          <h2 className="mb-2 text-base font-bold" style={{ color: "var(--th-text)" }}>Status do processo</h2>
          <StatusForm detail={detail} onDone={setDetail} />
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-base font-bold" style={{ color: "var(--th-text)" }}>Responsável atual</h2>
        <p className="mb-3 text-xs" style={{ color: "var(--th-muted)" }}>Quem está responsável pela próxima ação e até quando.</p>
        <dl className="mb-3 grid gap-3 sm:grid-cols-3">
          {RESPONSIBLE_FIELDS.map(({ key, label }) => <Row key={key} label={label} value={p.responsible[key]} />)}
          <Row label="Desde" value={p.responsible.since ? formatDate(p.responsible.since) : null} />
          <Row label="Data limite" value={p.responsible.dueOn ? formatDate(`${p.responsible.dueOn}T12:00:00`) : null} />
          <Row label="Status" value={processStatusLabel(p.status)} />
          <Row label="Última atualização" value={p.statusChangedAt ? formatDate(p.statusChangedAt) : null} />
        </dl>
        {!p.closedAt && <ResponsibleForm key={p.responsible.since ?? "novo"} detail={detail} onDone={setDetail} />}
      </Card>

      {/* Prazos por etapa (T-05-03, Modelo §15). */}
      <Card>
        <h2 className="mb-2 text-base font-bold" style={{ color: "var(--th-text)" }}>Prazos</h2>
        <ProcessDeadlines detail={detail} onDone={setDetail} />
      </Card>

      <Card>
        <h2 className="mb-2 text-base font-bold" style={{ color: "var(--th-text)" }}>Linha do tempo do processo</h2>
        {detail.timeline.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--th-muted)" }}>Nenhum registro ainda.</p>
        ) : (
          <ol className="space-y-2">
            {detail.timeline.map((e) => (
              <li key={e.id} className="border-l-2 pl-3" style={{ borderColor: "var(--th-border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>
                  {processTimelineLabel(e) ?? timelineEventLabel({ type: e.type, toStatus: null, details: e.details as never })}
                </p>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  {formatDate(e.createdAt)}{e.isPublic === false ? " · registro interno das partes" : ""}
                </p>
                {e.note && <p className="text-xs" style={{ color: "var(--th-text)" }}>{e.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
