"use client";

/**
 * Prazos do Processo de Conexão (T-05-03, Modelo de Conexão §15) e lista de
 * pendências de prazo (processos, encaminhamentos e acompanhamentos com data
 * limite). Os prazos vigentes vêm primeiro, com "vence em"/"venceu há"; os
 * redefinidos e cumpridos ficam no histórico. Só o lado responsável pela
 * etapa define o prazo dela; as duas partes marcam como cumprido.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import {
  DEADLINE_DEFAULT_DAYS, DEADLINE_SIDE_LABELS, DEADLINE_STAGE_LABELS, DEADLINE_STATUS_LABELS, dueLabel, dueTone,
  formatDay, stagesFor,
  type DeadlineSide, type DeadlineStage, type PendingItem, type ProcessDeadline,
} from "@/lib/app/deadlines";
import { processErrorMessage, type ProcessDetail } from "@/lib/app/process";
import { Button } from "../Button";
import { FormAlert, SelectInput, TextInput } from "../demand/fields";

const TONE_COLORS = { vencido: "#b3261e", proximo: "#a15c00", em_dia: "#2e7d4f" } as const;

function DueBadge({ item }: { item: { overdue: boolean; daysLeft: number | null } }) {
  const tone = dueTone(item);
  const color = TONE_COLORS[tone];
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${color}1a`, color }}>
      {dueLabel(item.daysLeft)}
    </span>
  );
}

function DeadlineForm({ detail, onDone }: { detail: ProcessDetail; onDone: (d: ProcessDetail) => void }) {
  const side = detail.process.viewerRole as DeadlineSide;
  const stages = stagesFor(side);
  const [stage, setStage] = useState<string>("");
  const [stageLabel, setStageLabel] = useState("");
  const [days, setDays] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [responsibleSide, setResponsibleSide] = useState<string>(side);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestion = stage && stage !== "outra" ? DEADLINE_DEFAULT_DAYS[stage as Exclude<DeadlineStage, "outra">] : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stage) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await api.setProcessDeadline(detail.process.id, {
        stage: stage as DeadlineStage,
        stageLabel: stage === "outra" ? stageLabel.trim() || null : null,
        dueDays: dueOn ? null : days ? Number(days) : null,
        dueOn: dueOn || null,
        responsibleSide: stage === "outra" ? (responsibleSide as DeadlineSide) : null,
        note: note.trim() || null,
      }));
      setStage("");
      setStageLabel("");
      setDays("");
      setDueOn("");
      setNote("");
    } catch (err) {
      setError(processErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" aria-label="Definir prazo de etapa">
      {error && <div className="sm:col-span-2"><FormAlert message={error} /></div>}
      <SelectInput name="deadline-stage" label="Etapa" value={stage} onValue={setStage} placeholder="Escolha"
        options={stages.map((s) => ({ value: s, label: DEADLINE_STAGE_LABELS[s] }))}
        hint={suggestion ? `Sugestão da plataforma: ${suggestion} dias.` : undefined} />
      {stage === "outra" && (
        <TextInput name="deadline-label" label="Nome da etapa" required value={stageLabel} onValue={setStageLabel} maxLength={120} />
      )}
      <TextInput name="deadline-days" label="Prazo (dias)" type="number" min={1} max={365} value={days}
        onValue={setDays} disabled={Boolean(dueOn)} hint={stage === "outra" ? undefined : "Vazio: a sugestão da etapa."} />
      <TextInput name="deadline-due" label="ou data limite" type="date" value={dueOn} onValue={setDueOn} />
      {stage === "outra" && (
        <SelectInput name="deadline-side" label="Quem responde pela etapa" value={responsibleSide} onValue={setResponsibleSide}
          options={(["agente", "parte"] as DeadlineSide[]).map((s) => ({ value: s, label: DEADLINE_SIDE_LABELS[s] }))} />
      )}
      <TextInput name="deadline-note" label="Observação" value={note} onValue={setNote} maxLength={1000} />
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" variant="outline" icon="check" loading={busy}
          disabled={!stage || (stage === "outra" && (!stageLabel.trim() || (!days && !dueOn)))}>
          Definir prazo
        </Button>
      </div>
    </form>
  );
}

function DeadlineRow({ deadline, detail, onDone }: { deadline: ProcessDeadline; detail: ProcessDetail; onDone: (d: ProcessDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fulfill() {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.fulfillProcessDeadline(detail.process.id, deadline.id));
    } catch (err) {
      setError(processErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const history = !deadline.open;
  return (
    <li className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)", opacity: history ? 0.7 : 1 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>
          {deadline.stageLabel} · até {formatDay(deadline.dueOn)}
        </p>
        {deadline.open ? <DueBadge item={deadline} /> : (
          <span className="text-xs font-semibold" style={{ color: "var(--th-muted)" }}>
            {deadline.supersededBy ? "Prazo redefinido" : DEADLINE_STATUS_LABELS[deadline.status]}
          </span>
        )}
      </div>
      <p className="text-xs" style={{ color: "var(--th-muted)" }}>
        Responde: {DEADLINE_SIDE_LABELS[deadline.responsibleSide]}
        {deadline.defaultDays ? ` · ${deadline.defaultDays} dias` : ""}
        {deadline.status === "vencido" && deadline.open ? " · vencido" : ""}
      </p>
      {deadline.note && <p className="mt-1 text-xs" style={{ color: "var(--th-text)" }}>{deadline.note}</p>}
      {error && <div className="mt-2"><FormAlert message={error} /></div>}
      {deadline.open && !detail.process.closedAt && (
        <div className="mt-2">
          <Button type="button" size="sm" variant="outline" icon="check" loading={busy} onClick={fulfill}>Marcar como cumprido</Button>
        </div>
      )}
    </li>
  );
}

/** Bloco "Prazos" do processo. */
export function ProcessDeadlines({ detail, onDone }: { detail: ProcessDetail; onDone: (d: ProcessDetail) => void }) {
  const deadlines = detail.deadlines ?? [];
  const canDefine = !detail.process.closedAt && (detail.process.viewerRole === "agente" || detail.process.viewerRole === "parte");
  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "var(--th-muted)" }}>
        Cada etapa pode ter prazo. A plataforma avisa as duas partes 3 dias antes e no vencimento.
      </p>
      {deadlines.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>Nenhum prazo definido.</p>
      ) : (
        <ul className="space-y-2">
          {deadlines.map((d) => <DeadlineRow key={d.id} deadline={d} detail={detail} onDone={onDone} />)}
        </ul>
      )}
      {canDefine && <DeadlineForm detail={detail} onDone={onDone} />}
    </div>
  );
}

/** Pendências de prazo de quem vê (§15): vencidas primeiro, depois as próximas. */
export function PendingDeadlines({ title = "Pendências de prazo", emptyText = "Nenhum prazo em aberto." }: {
  title?: string; emptyText?: string;
}) {
  const [items, setItems] = useState<PendingItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    api.pendingDeadlines()
      .then((list) => { if (alive) setItems(list); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  if (error) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>{title}</h2>
      {items === null ? (
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              style={{ borderColor: "var(--th-border)" }}>
              <div>
                <Link href={item.href} className="text-sm font-semibold underline" style={{ color: "var(--th-text)" }}>
                  {item.label}
                </Link>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  {item.protocol ? `${item.protocol} · ` : ""}{item.demandTitle ?? "Demanda"} · até {formatDay(item.dueOn)}
                  {item.mustAct ? " · a próxima ação é sua" : ""}
                </p>
              </div>
              <DueBadge item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
