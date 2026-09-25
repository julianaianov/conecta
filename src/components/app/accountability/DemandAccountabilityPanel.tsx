"use client";

// Aba "Prestação de contas" de Minhas demandas (T18): o Agente autor monta o
// registro final da demanda em `prestacao_de_contas` — relatório de execução,
// registros das ações, atualização final do cronograma, número de
// beneficiários alcançados, indicadores de impacto, resultado alcançado de
// cada meta declarada na T06 e os comprovantes (uploads da T08) — e conclui,
// publicando os resultados na página da demanda e na linha do tempo.
//
// Fonte: Fluxo 2, slide 24 (o que deve ser registrado, "obrigatoriamente
// quando aplicável") e slide 15 (metas, indicadores e forma de mensuração).
// O servidor é quem decide: as exigências vêm em `requirements` e os erros em
// `fields`.

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import {
  ACCOUNTABILITY_STATUS_LABELS,
  ACCOUNTABILITY_UPLOAD_PURPOSE,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  MAX_BENEFICIARIES_NOTE,
  MAX_EXECUTION_REPORT,
  accountabilityErrorMessage,
  accountabilityReaisToCents,
  formatAccountabilityDate,
  formatCents,
  goalsSummaryLabel,
  pendingRequirements,
} from "@/lib/app/accountability";
import type {
  DemandAccountabilityDocumentKind,
  DemandAccountabilityView,
  UploadedFile,
} from "@/lib/app/types";
import { Button } from "../Button";
import { FileUpload } from "../FileUpload";
import { Checkbox, FormAlert, SelectInput, TextArea, TextInput } from "../demand/fields";

const today = () => new Date().toISOString().slice(0, 10);

type ResultDraft = { measuredValue: string; measurementMethod: string; achieved: boolean; note: string };

const emptyResult = (): ResultDraft => ({ measuredValue: "", measurementMethod: "", achieved: true, note: "" });

export function DemandAccountabilityPanel({ demandId, onChanged }: {
  demandId: string;
  /** Avisa a lista quando a prestação muda (o status e o dossiê mudam junto). */
  onChanged?: () => void;
}) {
  const [data, setData] = useState<DemandAccountabilityView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Registro final
  const [executionReport, setExecutionReport] = useState("");
  const [actionsRecord, setActionsRecord] = useState("");
  const [scheduleSummary, setScheduleSummary] = useState("");
  const [beneficiariesReached, setBeneficiariesReached] = useState("");
  const [beneficiariesNote, setBeneficiariesNote] = useState("");
  const [impactIndicators, setImpactIndicators] = useState("");
  const [financialSupport, setFinancialSupport] = useState(false);
  const [financialSummary, setFinancialSummary] = useState("");
  const [executedAmount, setExecutedAmount] = useState("");
  // Registro de resultados (Modelo de Conexão §21, T-05-13)
  const [participants, setParticipants] = useState("");
  const [executedFrom, setExecutedFrom] = useState("");
  const [executedTo, setExecutedTo] = useState("");
  const [locationSummary, setLocationSummary] = useState("");
  const [finalResult, setFinalResult] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Resultado por meta (um formulário por meta, aberto sob demanda)
  const [openGoal, setOpenGoal] = useState<string | null>(null);
  const [resultDraft, setResultDraft] = useState<ResultDraft>(emptyResult);

  // Anexo
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [docKind, setDocKind] = useState<DemandAccountabilityDocumentKind>("comprovante_financeiro");
  const [docTitle, setDocTitle] = useState("");
  const [docDescription, setDocDescription] = useState("");
  const [docIssuedOn, setDocIssuedOn] = useState("");
  const [docAmount, setDocAmount] = useState("");

  const apply = useCallback((view: DemandAccountabilityView) => {
    setData(view);
    const a = view.accountability;
    setExecutionReport(a?.executionReport ?? "");
    setActionsRecord(a?.actionsRecord ?? "");
    setScheduleSummary(a?.scheduleSummary ?? "");
    setBeneficiariesReached(a?.beneficiariesReached === null || a?.beneficiariesReached === undefined
      ? "" : String(a.beneficiariesReached));
    setBeneficiariesNote(a?.beneficiariesNote ?? "");
    setImpactIndicators(a?.impactIndicators ?? "");
    setFinancialSupport(a?.financialSupport === true);
    setFinancialSummary(a?.financialSummary ?? "");
    setExecutedAmount(a?.executedAmountCents === null || a?.executedAmountCents === undefined
      ? "" : (a.executedAmountCents / 100).toFixed(2).replace(".", ","));
    setParticipants(a?.participants ?? "");
    setExecutedFrom(a?.executedFrom ?? "");
    setExecutedTo(a?.executedTo ?? "");
    setLocationSummary(a?.locationSummary ?? "");
    setFinalResult(a?.finalResult ?? "");
  }, []);

  const load = useCallback(async () => {
    try {
      const view = await api.myDemandAccountability(demandId);
      apply(view);
      setError(null);
    } catch (err) {
      setError(accountabilityErrorMessage(err, "Não foi possível carregar a prestação de contas agora."));
    } finally {
      setLoaded(true);
    }
  }, [demandId, apply]);

  useEffect(() => { void load(); }, [load]);

  if (error && !data) return <FormAlert message={error} />;
  if (!data) {
    return (
      <p className="text-sm" style={{ color: "var(--th-muted)" }}>
        {loaded ? "Prestação de contas indisponível." : "Carregando a prestação de contas…"}
      </p>
    );
  }

  const concluded = data.accountability?.status === "concluida";
  const pending = pendingRequirements(data.requirements);

  function fieldErrorsOf(err: unknown): Record<string, string> {
    const raw = (err as { fields?: unknown }).fields;
    return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
  }

  async function run(key: string, action: () => Promise<DemandAccountabilityView | void>) {
    setBusy(key);
    setError(null);
    setFields({});
    try {
      const view = await action();
      if (view) apply(view);
      else await load();
      onChanged?.();
    } catch (err) {
      setFields(fieldErrorsOf(err));
      setError(accountabilityErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const saveDraft = () => run("draft", async () => {
    const reached = beneficiariesReached.trim();
    const cents = accountabilityReaisToCents(executedAmount);
    if (Number.isNaN(cents)) {
      throw Object.assign(new Error("Confira o valor executado"), {
        fields: { executedAmountCents: "Informe o valor em reais" },
      });
    }
    return api.saveDemandAccountability(demandId, {
      executionReport: executionReport.trim() || null,
      actionsRecord: actionsRecord.trim() || null,
      scheduleSummary: scheduleSummary.trim() || null,
      beneficiariesReached: reached === "" ? null : Number(reached),
      beneficiariesNote: beneficiariesNote.trim() || null,
      impactIndicators: impactIndicators.trim() || null,
      financialSupport,
      financialSummary: financialSummary.trim() || null,
      executedAmountCents: cents,
      participants: participants.trim() || null,
      executedFrom: executedFrom || null,
      executedTo: executedTo || null,
      locationSummary: locationSummary.trim() || null,
      finalResult: finalResult.trim() || null,
    });
  });

  const saveResult = (goalId: string) => run(`result-${goalId}`, async () => {
    const view = await api.saveDemandAccountabilityResult(demandId, goalId, {
      measuredValue: resultDraft.measuredValue.trim(),
      measurementMethod: resultDraft.measurementMethod.trim(),
      achieved: resultDraft.achieved,
      note: resultDraft.note.trim() || null,
    });
    setOpenGoal(null);
    setResultDraft(emptyResult());
    return view;
  });

  const addDocument = () => run("document", async () => {
    if (!file) {
      throw Object.assign(new Error("Envie o arquivo do documento"), {
        fields: { reference: "Envie o arquivo" },
      });
    }
    const cents = accountabilityReaisToCents(docAmount);
    if (Number.isNaN(cents)) {
      throw Object.assign(new Error("Confira o valor do comprovante"), {
        fields: { amountCents: "Informe o valor em reais" },
      });
    }
    const view = await api.addDemandAccountabilityDocument(demandId, {
      kind: docKind,
      title: docTitle.trim(),
      reference: file.ref,
      description: docDescription.trim() || null,
      issuedOn: docIssuedOn || null,
      amountCents: cents,
    });
    setFile(null);
    setDocTitle("");
    setDocDescription("");
    setDocIssuedOn("");
    setDocAmount("");
    return view;
  });

  const removeDocument = (documentId: string) => run(`doc-${documentId}`, () =>
    api.removeDemandAccountabilityDocument(demandId, documentId));

  const conclude = () => run("conclude", () => api.concludeDemandAccountability(demandId));

  const fieldName = (key: string) => `acc-${demandId}-${key}`;

  return (
    <div className="space-y-4">
      {error && <FormAlert message={error} />}

      {data.status !== "prestacao_de_contas" && (
        <FormAlert
          tone="info"
          message='A prestação de contas abre quando a demanda entra em "Prestação de contas". Conclua a execução e use a ação "Iniciar prestação de contas".'
        />
      )}

      {concluded && data.accountability && (
        <FormAlert
          tone="success"
          message={`${ACCOUNTABILITY_STATUS_LABELS.concluida} em ${
            formatAccountabilityDate(data.accountability.concludedAt?.slice(0, 10) ?? null) || "—"
          }. Os resultados estão publicados na página da demanda e uma nova versão do dossiê foi gerada.`}
        />
      )}

      {/* O que a conclusão exige (slide 24: "obrigatoriamente quando aplicável"). */}
      {!concluded && (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
            O que a prestação de contas exige
          </h3>
          <ul className="space-y-1 text-sm">
            {data.requirements.map((requirement) => (
              <li
                key={requirement.key}
                className="flex flex-wrap items-baseline gap-x-2"
                style={{ color: requirement.applies ? "var(--th-text)" : "var(--th-muted)" }}
              >
                <span aria-hidden>{requirement.applies ? (requirement.satisfied ? "✓" : "•") : "—"}</span>
                <span>{requirement.label}</span>
                {!requirement.applies && (
                  <span className="text-xs">não se aplica: {requirement.reason}</span>
                )}
                {requirement.applies && requirement.satisfied && (
                  <span className="sr-only">atendido</span>
                )}
                {requirement.applies && requirement.informative && (
                  <span className="text-xs" style={{ color: "var(--th-muted)" }}>
                    informativo, não bloqueia a conclusão{requirement.satisfied ? "" : ` — ${requirement.reason ?? ""}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Registro final (slide 24). */}
      {!concluded && data.editable && (
        <section className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <h3 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Registro final</h3>
          <TextArea
            name={fieldName("report")}
            label="Relatório de execução"
            hint="O que foi feito, como foi feito e o que mudou no território. Entra no dossiê e na página pública."
            value={executionReport}
            onValue={setExecutionReport}
            rows={8}
            maxLength={MAX_EXECUTION_REPORT}
            error={fields.executionReport}
          />
          <TextArea
            name={fieldName("actions")}
            label="Registros das ações realizadas"
            value={actionsRecord}
            onValue={setActionsRecord}
            rows={4}
            error={fields.actionsRecord}
          />
          <TextArea
            name={fieldName("schedule")}
            label="Atualização final do cronograma"
            hint="Etapas concluídas, alterações de prazo e o que ficou de fora."
            value={scheduleSummary}
            onValue={setScheduleSummary}
            rows={4}
            error={fields.scheduleSummary}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              name={fieldName("reached")}
              label="Pessoas alcançadas"
              type="number"
              min={0}
              inputMode="numeric"
              hint={data.accountability?.beneficiariesEstimate !== null
                && data.accountability?.beneficiariesEstimate !== undefined
                ? `Estimativa declarada na demanda: ${data.accountability.beneficiariesEstimate.toLocaleString("pt-BR")}`
                : undefined}
              value={beneficiariesReached}
              onValue={setBeneficiariesReached}
              error={fields.beneficiariesReached}
            />
            <TextInput
              name={fieldName("executed")}
              label="Total executado (R$)"
              inputMode="decimal"
              placeholder="0,00"
              value={executedAmount}
              onValue={setExecutedAmount}
              error={fields.executedAmountCents}
            />
          </div>
          <TextArea
            name={fieldName("reachednote")}
            label="Perfil das pessoas alcançadas"
            value={beneficiariesNote}
            onValue={setBeneficiariesNote}
            rows={3}
            maxLength={MAX_BENEFICIARIES_NOTE}
            error={fields.beneficiariesNote}
          />
          <TextArea
            name={fieldName("impact")}
            label="Indicadores de impacto"
            hint="O efeito da ação no território, além do cumprimento das metas."
            value={impactIndicators}
            onValue={setImpactIndicators}
            rows={4}
            error={fields.impactIndicators}
          />
          <TextArea
            name={fieldName("participants")}
            label="Quem participou?"
            hint="Equipes, parceiros, voluntários e órgãos envolvidos. Aparece na página pública."
            value={participants}
            onValue={setParticipants}
            rows={3}
            error={fields.participants}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              name={fieldName("from")}
              label="Quando? Início da execução"
              type="date"
              value={executedFrom}
              onValue={setExecutedFrom}
              error={fields.executedFrom}
            />
            <TextInput
              name={fieldName("to")}
              label="Fim da execução"
              type="date"
              value={executedTo}
              onValue={setExecutedTo}
              error={fields.executedTo}
            />
          </div>
          <TextArea
            name={fieldName("where")}
            label="Onde? (opcional)"
            hint="Os locais em que a ação aconteceu, além do endereço da demanda."
            value={locationSummary}
            onValue={setLocationSummary}
            rows={2}
            error={fields.locationSummary}
          />
          <TextArea
            name={fieldName("final")}
            label="Qual foi o resultado final?"
            value={finalResult}
            onValue={setFinalResult}
            rows={4}
            error={fields.finalResult}
          />
          <Checkbox
            name={fieldName("financial")}
            label="Esta demanda recebeu apoio financeiro"
            hint="Marcando, a prestação passa a exigir o resumo da aplicação e ao menos um comprovante financeiro."
            checked={financialSupport}
            onChecked={setFinancialSupport}
          />
          {financialSupport && (
            <TextArea
              name={fieldName("finsummary")}
              label="Como o apoio financeiro foi aplicado"
              value={financialSummary}
              onValue={setFinancialSummary}
              rows={4}
              error={fields.financialSummary}
            />
          )}
          <Button type="button" size="sm" icon="check" loading={busy === "draft"} onClick={saveDraft}>
            Salvar registro final
          </Button>
        </section>
      )}

      {/* Resultado alcançado por meta (slide 15). */}
      <section className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
        <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
          Resultados por meta e indicador{" "}
          <span className="font-normal" style={{ color: "var(--th-muted)" }}>
            ({goalsSummaryLabel(data.summary.goalsAchieved, data.summary.goalsTotal)})
          </span>
        </h3>
        {data.goals.length === 0 && (
          <p className="text-sm" style={{ color: "var(--th-muted)" }}>Nenhuma meta declarada na demanda.</p>
        )}
        <ul className="space-y-2">
          {data.goals.map((goal) => {
            const result = data.results.find((r) => r.goalId === goal.goalId) ?? null;
            const open = openGoal === goal.goalId;
            return (
              <li key={goal.goalId} className="rounded-lg border p-3" style={{ borderColor: "var(--th-border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{goal.goal}</p>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  Indicador: {goal.indicator} · Forma de mensuração prevista: {goal.measurementMethod}
                </p>
                {result ? (
                  <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>
                    <strong>{result.achieved ? "Cumprida" : "Não cumprida"}</strong> · medido: {result.measuredValue}
                    {" "}· mensuração: {result.measurementMethod}
                  </p>
                ) : (
                  <p className="mt-1 text-xs" style={{ color: "#f4841a" }}>Resultado ainda não informado.</p>
                )}
                {!concluded && data.editable && (
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-expanded={open}
                      onClick={() => {
                        setOpenGoal(open ? null : goal.goalId);
                        setResultDraft(result
                          ? {
                            measuredValue: result.measuredValue,
                            measurementMethod: result.measurementMethod,
                            achieved: result.achieved,
                            note: result.note ?? "",
                          }
                          : { ...emptyResult(), measurementMethod: goal.measurementMethod });
                      }}
                    >
                      {result ? "Editar resultado" : "Informar resultado"}
                    </Button>
                    {open && (
                      <div className="mt-2 space-y-2">
                        <TextInput
                          name={`${fieldName("measured")}-${goal.goalId}`}
                          label="Valor medido"
                          hint="O número ou a situação verificada no indicador."
                          value={resultDraft.measuredValue}
                          onValue={(v) => setResultDraft((d) => ({ ...d, measuredValue: v }))}
                          error={fields.measuredValue}
                        />
                        <TextArea
                          name={`${fieldName("method")}-${goal.goalId}`}
                          label="Forma de mensuração usada"
                          value={resultDraft.measurementMethod}
                          onValue={(v) => setResultDraft((d) => ({ ...d, measurementMethod: v }))}
                          rows={3}
                          error={fields.measurementMethod}
                        />
                        <Checkbox
                          name={`${fieldName("achieved")}-${goal.goalId}`}
                          label="Meta cumprida"
                          checked={resultDraft.achieved}
                          onChecked={(v) => setResultDraft((d) => ({ ...d, achieved: v }))}
                        />
                        <TextArea
                          name={`${fieldName("resnote")}-${goal.goalId}`}
                          label="Observação (não aparece na página pública)"
                          value={resultDraft.note}
                          onValue={(v) => setResultDraft((d) => ({ ...d, note: v }))}
                          rows={2}
                          error={fields.note}
                        />
                        <Button
                          type="button"
                          size="sm"
                          loading={busy === `result-${goal.goalId}`}
                          onClick={() => saveResult(goal.goalId)}
                        >
                          Salvar resultado
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Comprovantes, relatórios e registros anexados (slide 24). */}
      <section className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
        <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
          Comprovantes e documentos
        </h3>
        {data.documents.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--th-muted)" }}>Nenhum documento anexado ainda.</p>
        ) : (
          <ul className="mb-3 space-y-1.5">
            {data.documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--th-border)" }}
              >
                <span className="font-semibold" style={{ color: "var(--th-text)" }}>{document.title}</span>
                <span style={{ color: "var(--th-muted)" }}>{DOCUMENT_KIND_LABELS[document.kind]}</span>
                {document.issuedOn && (
                  <span className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                    {formatAccountabilityDate(document.issuedOn)}
                  </span>
                )}
                {document.amountCents !== null && (
                  <span className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                    {formatCents(document.amountCents)}
                  </span>
                )}
                {!concluded && data.editable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    loading={busy === `doc-${document.id}`}
                    onClick={() => removeDocument(document.id)}
                  >
                    Remover
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!concluded && data.editable && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                name={fieldName("dockind")}
                label="Tipo de documento"
                value={docKind}
                onValue={(v) => setDocKind(v as DemandAccountabilityDocumentKind)}
                options={DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }))}
                error={fields.kind}
              />
              <TextInput
                name={fieldName("doctitle")}
                label="Título"
                value={docTitle}
                onValue={setDocTitle}
                error={fields.title}
              />
              <TextInput
                name={fieldName("docdate")}
                label="Data do documento"
                type="date"
                max={today()}
                value={docIssuedOn}
                onValue={setDocIssuedOn}
                error={fields.issuedOn}
              />
              <TextInput
                name={fieldName("docamount")}
                label="Valor (R$)"
                inputMode="decimal"
                placeholder="0,00"
                value={docAmount}
                onValue={setDocAmount}
                error={fields.amountCents}
              />
            </div>
            <TextArea
              name={fieldName("docdesc")}
              label="Descrição"
              value={docDescription}
              onValue={setDocDescription}
              rows={2}
              error={fields.description}
            />
            <FileUpload
              label="Arquivo do documento"
              purpose={ACCOUNTABILITY_UPLOAD_PURPOSE}
              target={{ demandId }}
              value={file}
              onChange={setFile}
              hint="O arquivo fica com você e com a equipe de análise; a página pública mostra só o tipo, o título, a data e o valor."
              error={fields.reference}
            />
            <Button type="button" size="sm" icon="plus" loading={busy === "document"} onClick={addDocument}>
              Anexar documento
            </Button>
          </div>
        )}
      </section>

      {/* Conclusão: publica os resultados e gera a versão do dossiê. */}
      {!concluded && data.editable && (
        <section className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <h3 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Concluir a prestação de contas</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
            Ao concluir, o registro é congelado, os resultados aparecem na página pública da demanda e na linha do
            tempo, e uma nova versão do Dossiê da Demanda é gerada.
          </p>
          {pending.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm" style={{ color: "#f4841a" }}>
              {pending.map((requirement) => <li key={requirement.key}>Falta: {requirement.label}</li>)}
            </ul>
          )}
          <Button
            type="button"
            size="sm"
            className="mt-3"
            icon="check"
            disabled={!data.canConclude}
            loading={busy === "conclude"}
            onClick={conclude}
          >
            Concluir prestação de contas
          </Button>
        </section>
      )}
    </div>
  );
}
