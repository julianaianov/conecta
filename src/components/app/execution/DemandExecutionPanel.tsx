"use client";

// Aba "Execução" de Minhas demandas (T17): o Agente autor registra as
// evidências do antes, do acompanhamento e do depois (uploads da T08),
// atualiza o andamento (etapas, cronograma, prazo, resultados parciais) e a
// execução orçamentária, e pareia os registros para o histórico visual.
// Modelo de Conexão §18–19 (T-05-11): percentual de execução, status Atrasada
// e Bloqueada (com motivo) e registro de ocorrências.
//
// Fonte: Fluxo 2, slides 11, 12, 14, 23 e 24. O servidor é quem decide: as
// mensagens de erro vêm de `fields` e dos códigos das rotas.

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import {
  INCIDENT_IMPACTS,
  INCIDENT_IMPACT_LABELS,
  INCIDENT_KINDS,
  INCIDENT_KIND_LABELS,
  EVIDENCE_MEDIA_KINDS,
  EVIDENCE_MEDIA_LABELS,
  EVIDENCE_PURPOSE_BY_MEDIA,
  EVIDENCE_MILESTONE_LABELS,
  EVIDENCE_MILESTONE_SHORT,
  EXECUTION_DOCUMENT_PURPOSE,
  RECORD_MILESTONES,
  STAGE_PROGRESS,
  STAGE_PROGRESS_LABELS,
  executionErrorMessage,
  executionReaisToCents,
  formatCents,
  formatRecordDate,
} from "@/lib/app/execution";
import type {
  DemandEvidence,
  DemandEvidenceMediaKind,
  DemandExecution,
  DemandIncidentImpact,
  DemandIncidentKind,
  DemandProgressExpenseInput,
  DemandAccountabilityDocumentKind,
  DemandScheduleMilestone,
  DemandStageProgress,
  UploadedFile,
} from "@/lib/app/types";
import { Button } from "../Button";
import { FileUpload } from "../FileUpload";
import { Checkbox, FormAlert, SelectInput, TextArea, TextInput } from "../demand/fields";
import { ExecutionIncidentList, ExecutionProgressSummary } from "./ExecutionProgressSummary";
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS } from "@/lib/app/accountability";

const today = () => new Date().toISOString().slice(0, 10);

type ExpenseRow = { id: number; target: string; amount: string; description: string };

const newExpense = (id: number): ExpenseRow => ({ id, target: "", amount: "", description: "" });

export function DemandExecutionPanel({ demandId, onChanged }: {
  demandId: string;
  /** Avisa a lista quando algo muda (pendências das transições). */
  onChanged?: () => void;
}) {
  const [data, setData] = useState<DemandExecution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Evidência
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [mediaKind, setMediaKind] = useState<DemandEvidenceMediaKind>("foto");
  const [milestone, setMilestone] = useState<DemandScheduleMilestone>("antes");
  const [recordedOn, setRecordedOn] = useState(today);
  const [caption, setCaption] = useState("");
  const [evidenceStage, setEvidenceStage] = useState("");
  const [pairWith, setPairWith] = useState("");

  // Andamento
  const [stage, setStage] = useState("");
  const [stageProgress, setStageProgress] = useState<DemandStageProgress | "">("");
  const [blockReason, setBlockReason] = useState("");
  const [onSchedule, setOnSchedule] = useState<boolean | null>(null);
  const [newEndsOn, setNewEndsOn] = useState("");
  const [deadlineReason, setDeadlineReason] = useState("");
  const [partialResults, setPartialResults] = useState("");
  const [note, setNote] = useState("");
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  // Documentos da execução (Modelo §20)
  const [docFile, setDocFile] = useState<UploadedFile | null>(null);
  const [docKind, setDocKind] = useState<DemandAccountabilityDocumentKind | "">("");
  const [docTitle, setDocTitle] = useState("");
  const [docIssuedOn, setDocIssuedOn] = useState("");
  const [docStage, setDocStage] = useState("");
  const [docMilestone, setDocMilestone] = useState<DemandScheduleMilestone | "">("");

  // Ocorrências (Modelo §19)
  const [incidentKind, setIncidentKind] = useState<DemandIncidentKind | "">("");
  const [incidentImpact, setIncidentImpact] = useState<DemandIncidentImpact>("nenhum");
  const [incidentStage, setIncidentStage] = useState("");
  const [incidentOn, setIncidentOn] = useState(today);
  const [incidentText, setIncidentText] = useState("");
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  // Ausência de execução física
  const [waiverReason, setWaiverReason] = useState("");
  const [showWaiver, setShowWaiver] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.myDemandExecution(demandId));
      setError(null);
    } catch (err) {
      setError(executionErrorMessage(err, "Não foi possível carregar a execução agora."));
    }
  }, [demandId]);

  useEffect(() => { void load(); }, [load]);

  if (error && !data) return <FormAlert message={error} />;
  if (!data) return <p className="text-sm" style={{ color: "var(--th-muted)" }}>Carregando a execução…</p>;

  const stageOptions = data.schedule.map((s) => ({ value: s.scheduleItemId, label: s.stage }));
  const unpairedBefore = data.evidences.filter(
    (e) => e.milestone === "antes"
      && e.mediaKind === mediaKind
      && !data.evidences.some((other) => other.pairEvidenceId === e.id),
  );

  function fieldErrorsOf(err: unknown): Record<string, string> {
    const raw = (err as { fields?: unknown }).fields;
    return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
  }

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setFields({});
    try {
      await action();
      await load();
      onChanged?.();
    } catch (err) {
      setFields(fieldErrorsOf(err));
      setError(executionErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const addEvidence = () => run("evidence", async () => {
    if (!file) throw Object.assign(new Error("Envie a foto ou o vídeo do registro"), { fields: { reference: "Envie o arquivo" } });
    await api.registerDemandEvidence(demandId, {
      reference: file.ref,
      milestone,
      mediaKind,
      recordedOn,
      caption: caption.trim() || null,
      scheduleItemId: evidenceStage || null,
      pairEvidenceId: milestone === "depois" && pairWith ? pairWith : null,
    });
    setFile(null);
    setCaption("");
    setPairWith("");
  });

  const addProgress = () => run("progress", async () => {
    const parsed: DemandProgressExpenseInput[] = [];
    for (const row of expenses) {
      if (!row.target && !row.amount) continue;
      const cents = executionReaisToCents(row.amount);
      if (cents === null || Number.isNaN(cents)) {
        throw Object.assign(new Error("Confira os valores executados"), {
          fields: { expenses: "Informe o valor executado em reais" },
        });
      }
      const [kind, id] = row.target.split(":");
      parsed.push({
        budgetItemId: kind === "item" ? id : null,
        scheduleItemId: kind === "etapa" ? id : null,
        description: row.description.trim() || null,
        executedAmountCents: cents,
      });
    }
    await api.registerDemandProgress(demandId, {
      scheduleItemId: stage || null,
      stageProgress: stage ? (stageProgress || null) : null,
      blockReason: stage && stageProgress === "bloqueada" ? (blockReason.trim() || null) : null,
      onSchedule,
      newEndsOn: newEndsOn || null,
      deadlineReason: newEndsOn ? (deadlineReason.trim() || null) : null,
      partialResults: partialResults.trim() || null,
      note: note.trim() || null,
      expenses: parsed,
    });
    setStage("");
    setStageProgress("");
    setBlockReason("");
    setOnSchedule(null);
    setNewEndsOn("");
    setDeadlineReason("");
    setPartialResults("");
    setNote("");
    setExpenses([]);
  });

  const pair = (evidence: DemandEvidence, beforeId: string) => run(`pair-${evidence.id}`, async () => {
    await api.updateDemandEvidence(demandId, evidence.id, { pairEvidenceId: beforeId });
  });

  const addDocument = () => run("document", async () => {
    if (!docFile) throw Object.assign(new Error("Envie o arquivo do documento"), { fields: { reference: "Envie o arquivo" } });
    await api.registerDemandExecutionDocument(demandId, {
      kind: docKind as DemandAccountabilityDocumentKind,
      title: docTitle.trim(),
      reference: docFile.ref,
      issuedOn: docIssuedOn || null,
      scheduleItemId: docStage || null,
      milestone: docMilestone || null,
    });
    setDocFile(null);
    setDocKind("");
    setDocTitle("");
    setDocIssuedOn("");
    setDocStage("");
    setDocMilestone("");
  });

  const addIncident = () => run("incident", async () => {
    await api.registerDemandIncident(demandId, {
      kind: incidentKind as DemandIncidentKind,
      description: incidentText.trim(),
      occurredOn: incidentOn,
      impact: incidentImpact,
      scheduleItemId: incidentStage || null,
    });
    setIncidentKind("");
    setIncidentImpact("nenhum");
    setIncidentStage("");
    setIncidentText("");
  });

  const resolveIncident = (incidentId: string) => run(`resolve-${incidentId}`, async () => {
    await api.resolveDemandIncident(demandId, incidentId, (resolutions[incidentId] ?? "").trim());
    setResolutions((all) => ({ ...all, [incidentId]: "" }));
  });

  const waive = () => run("waiver", async () => {
    await api.waiveDemandRecord(demandId, waiverReason.trim());
    setWaiverReason("");
    setShowWaiver(false);
  });

  return (
    <div className="space-y-4">
      {error && <FormAlert message={error} />}

      {/* Pendências das transições (slides 11 e 12). */}
      {!data.recordWaiverReason && (data.pending.antes || data.pending.depois) && (
        <FormAlert
          tone="info"
          message={data.pending.antes
            ? "Registre a situação inicial (\"antes\") para iniciar a execução."
            : "Registre o resultado (\"depois\") para concluir a demanda."}
        />
      )}
      {/* Percentual de execução e status das etapas (Modelo §18–19). */}
      {(data.schedule.length > 0 || data.summary) && (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>Percentual de execução</h3>
          <ExecutionProgressSummary idPrefix={`exec-${demandId}`} summary={data.summary} schedule={data.schedule} />
        </section>
      )}

      {/* Registros previstos no cronograma e ainda não enviados (slide 14; T-02-04). */}
      {data.canRegisterEvidence && (data.pending.records ?? []).length > 0 && (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <h3 className="mb-1 text-sm font-bold" style={{ color: "var(--th-text)" }}>Registros previstos e ainda não enviados</h3>
          <p className="mb-2 text-xs" style={{ color: "var(--th-muted)" }}>
            O cronograma previu estes registros. O acompanhamento é informativo; o antes e o depois são pedidos para iniciar e concluir.
          </p>
          <ul className="space-y-1.5">
            {(data.pending.records ?? []).map((record) => (
              <li
                key={`${record.scheduleItemId}-${record.milestone}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--th-border)" }}
              >
                <span style={{ color: "var(--th-text)" }}>{record.stage}</span>
                <span style={{ color: "var(--th-muted)" }}>· {EVIDENCE_MILESTONE_LABELS[record.milestone] ?? record.milestone}</span>
                <Button
                  className="ml-auto"
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMilestone(record.milestone);
                    setEvidenceStage(record.scheduleItemId);
                    setPairWith("");
                    document.getElementById(`exec-${demandId}-evidence-form`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Registrar agora
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.recordWaiverReason && (
        <p className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)", color: "var(--th-text)" }}>
          <strong>Sem execução física a registrar.</strong> {data.recordWaiverReason}
        </p>
      )}
      {data.canWaiveRecord && (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowWaiver((v) => !v)} aria-expanded={showWaiver}>
            Esta demanda não tem execução física a registrar
          </Button>
          {showWaiver && (
            <div className="mt-2 space-y-2">
              <TextArea
                name={`exec-${demandId}-waiver`}
                label="Justificativa"
                hint="Fica na linha do tempo pública e dispensa o registro do antes e do depois."
                value={waiverReason}
                onValue={setWaiverReason}
                rows={3}
                error={fields.reason}
              />
              <Button type="button" size="sm" loading={busy === "waiver"} onClick={waive}>Registrar justificativa</Button>
            </div>
          )}
        </div>
      )}

      {/* Registro de evidência (slide 12). */}
      {data.canRegisterEvidence && (
        <section id={`exec-${demandId}-evidence-form`} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>Registrar evidência</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput
              name={`exec-${demandId}-media`}
              label="Tipo de registro"
              value={mediaKind}
              onValue={(v) => { setMediaKind(v as DemandEvidenceMediaKind); setFile(null); setPairWith(""); }}
              options={EVIDENCE_MEDIA_KINDS.map((k) => ({ value: k, label: EVIDENCE_MEDIA_LABELS[k] }))}
            />
            <SelectInput
              name={`exec-${demandId}-milestone`}
              label="Marco"
              value={milestone}
              onValue={(v) => { setMilestone(v as DemandScheduleMilestone); setPairWith(""); }}
              options={(data.allowedMilestones ?? RECORD_MILESTONES).map((m) => ({ value: m, label: EVIDENCE_MILESTONE_LABELS[m] }))}
              error={fields.milestone}
            />
            <TextInput
              name={`exec-${demandId}-recorded`}
              label="Data do registro"
              type="date"
              max={today()}
              value={recordedOn}
              onValue={setRecordedOn}
              error={fields.recordedOn}
            />
            <SelectInput
              name={`exec-${demandId}-evstage`}
              label="Etapa do cronograma"
              placeholder="Sem etapa específica"
              value={evidenceStage}
              onValue={setEvidenceStage}
              options={stageOptions}
              error={fields.scheduleItemId}
            />
            <TextInput
              name={`exec-${demandId}-caption`}
              label="Legenda"
              className="sm:col-span-2"
              value={caption}
              onValue={setCaption}
              error={fields.caption}
            />
            {milestone === "depois" && (
              <SelectInput
                name={`exec-${demandId}-pair`}
                label="Parear com o registro do antes"
                className="sm:col-span-2"
                placeholder="Sem par (pode parear depois)"
                value={pairWith}
                onValue={setPairWith}
                options={unpairedBefore.map((e) => ({
                  value: e.id,
                  label: `${EVIDENCE_MEDIA_LABELS[e.mediaKind]} · ${formatRecordDate(e.recordedOn)}${e.caption ? ` · ${e.caption}` : ""}`,
                }))}
                error={fields.pairEvidenceId}
              />
            )}
          </div>
          <div className="mt-3">
            <FileUpload
              label={`${EVIDENCE_MEDIA_LABELS[mediaKind]} do ${EVIDENCE_MILESTONE_SHORT[milestone].toLowerCase()}`}
              purpose={EVIDENCE_PURPOSE_BY_MEDIA[mediaKind]}
              target={{ demandId }}
              value={file}
              onChange={setFile}
              error={fields.reference}
            />
          </div>
          <Button className="mt-3" type="button" size="sm" icon="plus" loading={busy === "evidence"} onClick={addEvidence}>
            Registrar evidência
          </Button>
        </section>
      )}

      {/* Registros já feitos e pareamento (slide 24). */}
      <section>
        <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
          Registros ({data.evidences.length}) · antes {data.milestones.antes} · acompanhamento {data.milestones.acompanhamento} · depois {data.milestones.depois}
        </h3>
        {data.evidences.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--th-muted)" }}>Nenhum registro ainda.</p>
        ) : (
          <ul className="space-y-2">
            {data.evidences.map((evidence) => {
              const candidates = data.evidences.filter(
                (e) => e.milestone === "antes"
                  && e.mediaKind === evidence.mediaKind
                  && !data.evidences.some((other) => other.pairEvidenceId === e.id),
              );
              return (
                <li
                  key={evidence.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--th-border)" }}
                >
                  <span className="font-semibold" style={{ color: "var(--th-text)" }}>
                    {EVIDENCE_MILESTONE_SHORT[evidence.milestone]} · {EVIDENCE_MEDIA_LABELS[evidence.mediaKind]}
                  </span>
                  <span style={{ color: "var(--th-muted)" }}>
                    {formatRecordDate(evidence.recordedOn)}{evidence.stage ? ` · ${evidence.stage}` : ""}
                  </span>
                  {evidence.caption && <span style={{ color: "var(--th-text)" }}>{evidence.caption}</span>}
                  {evidence.url && (
                    <a className="underline" style={{ color: "#2e7ba8" }} href={evidence.url} target="_blank" rel="noreferrer">Abrir</a>
                  )}
                  {evidence.milestone === "depois" && !evidence.pairEvidenceId && candidates.length > 0 && (
                    <span className="ml-auto flex items-center gap-1">
                      <label className="sr-only" htmlFor={`pair-${evidence.id}`}>Parear com o antes</label>
                      <select
                        id={`pair-${evidence.id}`}
                        className="app-input"
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) void pair(evidence, e.target.value); }}
                        disabled={busy === `pair-${evidence.id}`}
                      >
                        <option value="">Parear com o antes…</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>{formatRecordDate(c.recordedOn)}{c.caption ? ` · ${c.caption}` : ""}</option>
                        ))}
                      </select>
                    </span>
                  )}
                  {evidence.pairEvidenceId && (
                    <span className="ml-auto text-xs font-semibold" style={{ color: "#2e9e5b" }}>Pareado com o antes</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Atualização de andamento e execução orçamentária (slide 23). */}
      {data.canRegisterProgress && (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>Atualizar andamento</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput
              name={`exec-${demandId}-stage`}
              label="Etapa do cronograma"
              placeholder="Sem etapa específica"
              value={stage}
              onValue={setStage}
              options={stageOptions}
              error={fields.scheduleItemId}
            />
            <SelectInput
              name={`exec-${demandId}-progress`}
              label="Situação da etapa"
              placeholder="Escolha a situação"
              value={stageProgress}
              onValue={(v) => setStageProgress(v as DemandStageProgress | "")}
              options={STAGE_PROGRESS.map((s) => ({ value: s, label: STAGE_PROGRESS_LABELS[s] }))}
              error={fields.stageProgress}
              disabled={!stage}
            />
            {stageProgress === "bloqueada" && (
              <TextInput
                name={`exec-${demandId}-block`}
                label="O que bloqueia a etapa"
                className="sm:col-span-2"
                hint="Obrigatório para a situação Bloqueada; aparece no acompanhamento público."
                value={blockReason}
                onValue={setBlockReason}
                error={fields.blockReason}
              />
            )}
            <TextInput
              name={`exec-${demandId}-newends`}
              label="Nova data de término"
              type="date"
              value={newEndsOn}
              onValue={setNewEndsOn}
              error={fields.newEndsOn}
              disabled={!stage}
            />
            <TextInput
              name={`exec-${demandId}-reason`}
              label="Justificativa da alteração de prazo"
              value={deadlineReason}
              onValue={setDeadlineReason}
              error={fields.deadlineReason}
              disabled={!newEndsOn}
            />
            <TextArea
              name={`exec-${demandId}-results`}
              label="Resultados parciais"
              className="sm:col-span-2"
              hint="Aparece no acompanhamento público da demanda."
              rows={3}
              value={partialResults}
              onValue={setPartialResults}
              error={fields.partialResults}
            />
            <TextArea
              name={`exec-${demandId}-note`}
              label="Nota interna"
              className="sm:col-span-2"
              hint="Fica só para você e para a equipe da plataforma."
              rows={2}
              value={note}
              onValue={setNote}
              error={fields.note}
            />
          </div>
          <div className="mt-3">
            <Checkbox
              name={`exec-${demandId}-onschedule`}
              label="A execução está dentro do cronograma"
              checked={onSchedule === true}
              onChecked={(v) => setOnSchedule(v ? true : false)}
              hint={onSchedule === null ? "Marque ou desmarque para declarar o cumprimento do cronograma." : undefined}
            />
          </div>

          <div className="mt-3">
            <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Execução orçamentária</p>
            {fields.expenses && <FormAlert message={fields.expenses} />}
            <ul className="mt-2 space-y-2">
              {expenses.map((row, index) => (
                <li key={row.id} className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
                  <select
                    className="app-input"
                    aria-label="Item do orçamento ou etapa"
                    value={row.target}
                    onChange={(e) => setExpenses((list) => list.map((r) => (r.id === row.id ? { ...r, target: e.target.value } : r)))}
                  >
                    <option value="">Item do orçamento ou etapa…</option>
                    {data.budgetExecution.items.map((item) => (
                      <option key={item.budgetItemId} value={`item:${item.budgetItemId}`}>{item.description}</option>
                    ))}
                    {stageOptions.map((option) => (
                      <option key={option.value} value={`etapa:${option.value}`}>Etapa: {option.label}</option>
                    ))}
                  </select>
                  <input
                    className="app-input"
                    aria-label="Valor executado em reais"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={row.amount}
                    onChange={(e) => setExpenses((list) => list.map((r) => (r.id === row.id ? { ...r, amount: e.target.value } : r)))}
                  />
                  <input
                    className="app-input"
                    aria-label="Descrição do gasto"
                    placeholder="Descrição (opcional)"
                    value={row.description}
                    onChange={(e) => setExpenses((list) => list.map((r) => (r.id === row.id ? { ...r, description: e.target.value } : r)))}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon="close"
                    aria-label={`Remover lançamento ${index + 1}`}
                    onClick={() => setExpenses((list) => list.filter((r) => r.id !== row.id))}
                  >
                    Remover
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              className="mt-2"
              type="button"
              size="sm"
              variant="outline"
              icon="plus"
              onClick={() => setExpenses((list) => [...list, newExpense(Date.now() + list.length)])}
            >
              Adicionar valor executado
            </Button>
          </div>

          <Button className="mt-3" type="button" size="sm" icon="send" loading={busy === "progress"} onClick={addProgress}>
            Registrar atualização
          </Button>
        </section>
      )}

      {/* Documentos da execução (Modelo §20): laudos, certificados, notas fiscais. */}
      {(data.canRegisterDocument || (data.documents ?? []).length > 0) && (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>Documentos da execução</h3>
          {(data.documents ?? []).length > 0 ? (
            <ul className="mb-3 space-y-1.5">
              {(data.documents ?? []).map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--th-border)" }}>
                  <span className="font-semibold" style={{ color: "var(--th-text)" }}>{DOCUMENT_KIND_LABELS[doc.kind]}</span>
                  <span style={{ color: "var(--th-text)" }}>{doc.title}</span>
                  <span className="text-xs" style={{ color: "var(--th-muted)" }}>
                    {doc.issuedOn ? `emitido em ${formatRecordDate(doc.issuedOn)}` : ""}
                    {doc.stage ? ` · ${doc.stage}` : ""}
                    {doc.milestone ? ` · ${EVIDENCE_MILESTONE_SHORT[doc.milestone]}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-sm" style={{ color: "var(--th-muted)" }}>Nenhum documento anexado ainda.</p>
          )}
          {data.canRegisterDocument && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                name={`exec-${demandId}-doc-kind`}
                label="Tipo de documento"
                placeholder="Escolha o tipo"
                value={docKind}
                onValue={(v) => setDocKind(v as DemandAccountabilityDocumentKind | "")}
                options={DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }))}
                error={fields.kind}
              />
              <TextInput
                name={`exec-${demandId}-doc-title`}
                label="Título"
                value={docTitle}
                onValue={setDocTitle}
                error={fields.title}
              />
              <TextInput
                name={`exec-${demandId}-doc-date`}
                label="Data de emissão"
                type="date"
                max={today()}
                value={docIssuedOn}
                onValue={setDocIssuedOn}
                error={fields.issuedOn}
              />
              <SelectInput
                name={`exec-${demandId}-doc-stage`}
                label="Etapa do cronograma"
                placeholder="Sem etapa específica"
                value={docStage}
                onValue={setDocStage}
                options={stageOptions}
                error={fields.scheduleItemId}
              />
              <SelectInput
                name={`exec-${demandId}-doc-milestone`}
                label="Marco"
                placeholder="Sem marco específico"
                value={docMilestone}
                onValue={(v) => setDocMilestone(v as DemandScheduleMilestone | "")}
                options={(data.allowedMilestones ?? RECORD_MILESTONES).map((m) => ({ value: m, label: EVIDENCE_MILESTONE_LABELS[m] }))}
                error={fields.milestone}
              />
              <div className="sm:col-span-2">
                <FileUpload
                  label="Arquivo do documento"
                  purpose={EXECUTION_DOCUMENT_PURPOSE}
                  target={{ demandId }}
                  value={docFile}
                  onChange={setDocFile}
                  error={fields.reference}
                />
                <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
                  O público vê o tipo, o título e a data; o arquivo fica com você e com a equipe de análise.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Button type="button" size="sm" icon="plus" loading={busy === "document"} onClick={addDocument}>
                  Anexar documento
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Ocorrências da execução (Modelo §19). */}
      {(data.canRegisterIncident || (data.incidents ?? []).length > 0) && (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>Ocorrências</h3>
          <ExecutionIncidentList
            incidents={data.incidents ?? []}
            renderAction={(incident) => (!incident.resolved && data.canRegisterIncident ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <TextInput
                  name={`exec-${demandId}-resolve-${incident.id}`}
                  label="Como foi resolvida"
                  className="min-w-[14rem] flex-1"
                  value={resolutions[incident.id] ?? ""}
                  onValue={(v) => setResolutions((all) => ({ ...all, [incident.id]: v }))}
                  error={busy === null ? undefined : fields.resolution}
                />
                <Button type="button" size="sm" variant="outline" loading={busy === `resolve-${incident.id}`} onClick={() => resolveIncident(incident.id)}>
                  Registrar resolução
                </Button>
              </div>
            ) : null)}
          />
          {data.canRegisterIncident && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <SelectInput
                name={`exec-${demandId}-inc-kind`}
                label="Tipo de ocorrência"
                placeholder="Escolha o tipo"
                value={incidentKind}
                onValue={(v) => setIncidentKind(v as DemandIncidentKind | "")}
                options={INCIDENT_KINDS.map((k) => ({ value: k, label: INCIDENT_KIND_LABELS[k] }))}
                error={fields.kind}
              />
              <SelectInput
                name={`exec-${demandId}-inc-impact`}
                label="Impacto"
                value={incidentImpact}
                onValue={(v) => setIncidentImpact(v as DemandIncidentImpact)}
                options={INCIDENT_IMPACTS.map((k) => ({ value: k, label: INCIDENT_IMPACT_LABELS[k] }))}
                error={fields.impact}
              />
              <TextInput
                name={`exec-${demandId}-inc-date`}
                label="Data da ocorrência"
                type="date"
                max={today()}
                value={incidentOn}
                onValue={setIncidentOn}
                error={fields.occurredOn}
              />
              <SelectInput
                name={`exec-${demandId}-inc-stage`}
                label="Etapa do cronograma"
                placeholder="Sem etapa específica"
                value={incidentStage}
                onValue={setIncidentStage}
                options={stageOptions}
                error={fields.scheduleItemId}
              />
              <TextArea
                name={`exec-${demandId}-inc-text`}
                label="O que aconteceu"
                className="sm:col-span-2"
                hint="Aparece no acompanhamento público da demanda."
                rows={3}
                value={incidentText}
                onValue={setIncidentText}
                error={fields.description}
              />
              <div className="sm:col-span-2">
                <Button type="button" size="sm" icon="plus" loading={busy === "incident"} onClick={addIncident}>
                  Registrar ocorrência
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Planejado × executado. */}
      <section>
        <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
          Execução orçamentária: {formatCents(data.budgetExecution.executedCents)} de {formatCents(data.budgetExecution.plannedCents)}
        </h3>
        <ul className="space-y-1.5">
          {data.budgetExecution.items.map((item) => (
            <li
              key={item.budgetItemId}
              className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--th-border)" }}
            >
              <span style={{ color: "var(--th-text)" }}>{item.description}</span>
              {item.isAudiovisualRecord && (
                <span className="text-xs font-semibold" style={{ color: "#f4841a" }}>registro do antes e do depois</span>
              )}
              <span className="ml-auto font-numeric" style={{ color: "var(--th-muted)" }}>
                {formatCents(item.executedCents)} / {formatCents(item.plannedCents)}
              </span>
            </li>
          ))}
          {data.budgetExecution.stages.map((s) => (
            <li
              key={s.scheduleItemId}
              className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--th-border)" }}
            >
              <span style={{ color: "var(--th-text)" }}>Etapa: {s.stage}</span>
              <span className="ml-auto font-numeric" style={{ color: "var(--th-muted)" }}>{formatCents(s.executedCents)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Histórico de atualizações. */}
      {data.progress.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>Atualizações registradas</h3>
          <ol className="space-y-2">
            {data.progress.map((update) => (
              <li key={update.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--th-border)" }}>
                <p className="font-semibold" style={{ color: "var(--th-text)" }}>
                  {update.stage ?? "Andamento"}
                  {update.stageProgress ? ` · ${STAGE_PROGRESS_LABELS[update.stageProgress]}` : ""}
                </p>
                {update.blockReason && <p className="text-xs" style={{ color: "var(--th-text)" }}>Motivo do bloqueio: {update.blockReason}</p>}
                {update.partialResults && <p className="whitespace-pre-line" style={{ color: "var(--th-text)" }}>{update.partialResults}</p>}
                {update.newEndsOn && (
                  <p className="text-xs" style={{ color: "var(--th-text)" }}>
                    Novo término em {formatRecordDate(update.newEndsOn)}{update.deadlineReason ? ` — ${update.deadlineReason}` : ""}
                  </p>
                )}
                {update.note && <p className="text-xs italic" style={{ color: "var(--th-muted)" }}>Nota interna: {update.note}</p>}
                <p className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                  {update.executedAmountCents > 0 ? `Executado ${formatCents(update.executedAmountCents)} · ` : ""}
                  {update.createdAt ? new Date(update.createdAt).toLocaleString("pt-BR") : ""}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
