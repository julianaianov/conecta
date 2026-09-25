// Seção "Resultados e prestação de contas" da página pública da demanda
// (T18 + T19 parcial). Sem estado: serve ao SSR de `/demandas/[id]`.
//
// Fonte: Fluxo 2, slide 24 ("a plataforma poderá criar um histórico completo
// da demanda, desde sua criação até seus resultados, permitindo demonstrar de
// forma documentada a evolução e os efeitos da ação realizada") e slide 15
// (metas, indicadores e forma de mensuração). As fotos e os registros ficam na
// galeria antes/depois da T17, logo acima; aqui vêm os resultados alcançados,
// as pessoas impactadas, as metas cumpridas e os comprovantes — sem dados
// pessoais e sem o arquivo do comprovante.

import {
  DOCUMENT_KIND_LABELS,
  RESULT_QUESTIONS,
  beneficiariesDelta,
  formatAccountabilityDate,
  formatCents,
  goalsSummaryLabel,
} from "@/lib/app/accountability";
import type { PublicDemandAccountabilityView } from "@/lib/app/types";
import { ReadSection } from "../demand/DemandParts";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
      <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{label}</dt>
      <dd className="text-base font-bold font-numeric" style={{ color: "var(--th-text)" }}>{value}</dd>
      {hint && <p className="text-xs" style={{ color: "var(--th-muted)" }}>{hint}</p>}
    </div>
  );
}

export function DemandAccountabilitySection({ data }: { data: PublicDemandAccountabilityView | null }) {
  const accountability = data?.accountability ?? null;
  // Só a prestação concluída é publicada.
  if (!data || !accountability || accountability.status !== "concluida") return null;

  const delta = beneficiariesDelta(accountability.beneficiariesReached, accountability.beneficiariesEstimate);
  const join = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join("\n\n");
  const period = [accountability.executedFrom, accountability.executedTo]
    .filter((d): d is string => Boolean(d)).map(formatAccountabilityDate).join(" a ");
  const evidenceCount = data.documents.length + (data.executionDocuments ?? []).length;
  const answers: Record<string, string> = {
    what: join(accountability.executionReport, accountability.actionsRecord,
      accountability.scheduleSummary ? `Cronograma executado: ${accountability.scheduleSummary}` : null),
    where: accountability.locationSummary ?? "No local da demanda, indicado no mapa.",
    when: period,
    who: accountability.participants ?? "",
    howMany: join(accountability.beneficiariesReached !== null
      ? `${accountability.beneficiariesReached.toLocaleString("pt-BR")} pessoas alcançadas` : null,
    accountability.beneficiariesNote),
    goals: goalsSummaryLabel(data.summary.goalsAchieved, data.summary.goalsTotal),
    indicators: accountability.impactIndicators ?? "",
    resources: join(accountability.executedAmountCents !== null
      ? `Executado declarado: ${formatCents(accountability.executedAmountCents)}` : null,
    accountability.financialSupport ? accountability.financialSummary : null),
    evidence: join("Fotos e vídeos do antes e do depois na galeria da execução.",
      evidenceCount > 0 ? `${evidenceCount} documento(s) listado(s) abaixo, sem o arquivo.` : null),
    finalResult: accountability.finalResult ?? "",
  };

  return (
    <ReadSection title="Resultados e prestação de contas" icon="trophy">
      <p className="mb-3 text-xs" style={{ color: "var(--th-muted)" }}>
        Registro final apresentado pelo Agente de Transformação
        {accountability.concludedAt
          ? ` em ${formatAccountabilityDate(accountability.concludedAt.slice(0, 10))}`
          : ""}.
      </p>

      <dl className="mb-4 grid gap-2 sm:grid-cols-3">
        <Stat
          label="Pessoas impactadas"
          value={accountability.beneficiariesReached !== null
            ? accountability.beneficiariesReached.toLocaleString("pt-BR")
            : "—"}
          hint={accountability.beneficiariesEstimate !== null
            ? `Estimativa da demanda: ${accountability.beneficiariesEstimate.toLocaleString("pt-BR")}`
              + (delta !== null ? ` (${delta >= 0 ? "+" : ""}${delta.toLocaleString("pt-BR")})` : "")
            : undefined}
        />
        <Stat
          label="Metas cumpridas"
          value={goalsSummaryLabel(data.summary.goalsAchieved, data.summary.goalsTotal)}
        />
        <Stat
          label="Executado declarado"
          value={formatCents(accountability.executedAmountCents)}
          hint={data.summary.financialReceipts > 0
            ? `${data.summary.financialReceipts} comprovante(s) financeiro(s) anexado(s)`
            : undefined}
        />
      </dl>

      {/* Registro de resultados: as dez perguntas do Modelo de Conexão §21. */}
      <dl className="space-y-4">
        {RESULT_QUESTIONS.map(({ key, question }) => {
          const answer = answers[key];
          if (!answer) return null;
          return (
            <div key={key}>
              <dt className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{question}</dt>
              <dd className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{answer}</dd>
            </div>
          );
        })}
      </dl>

      {data.results.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
            Resultados alcançados por meta
          </p>
          <ul className="space-y-2">
            {data.results.map((result) => (
              <li key={result.id} className="rounded-lg border p-3" style={{ borderColor: "var(--th-border)" }}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{result.goal}</span>
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-bold"
                    style={{
                      background: result.achieved ? "rgba(34,139,84,0.12)" : "rgba(244,132,26,0.12)",
                      color: result.achieved ? "#228b54" : "#f4841a",
                    }}
                  >
                    {result.achieved ? "Cumprida" : "Não cumprida"}
                  </span>
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
                  Indicador: {result.indicator}
                  {result.expectedResult ? ` · Resultado esperado: ${result.expectedResult}` : ""}
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>
                  Valor medido: <strong>{result.measuredValue}</strong>
                </p>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  Forma de mensuração: {result.measurementMethod}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.documents.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
            Comprovantes e relatórios entregues
          </p>
          <ul className="space-y-1.5">
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
                  <span className="ml-auto text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                    {formatCents(document.amountCents)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>
            Os arquivos ficam com o Agente de Transformação e com a equipe de análise da plataforma; aqui aparecem o
            tipo, o título, a data e o valor declarado.
          </p>
        </div>
      )}

      {(data.executionDocuments ?? []).length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
            Documentos anexados durante a execução
          </p>
          <ul className="space-y-1.5">
            {(data.executionDocuments ?? []).map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--th-border)" }}
              >
                <span className="font-semibold" style={{ color: "var(--th-text)" }}>{document.title}</span>
                <span style={{ color: "var(--th-muted)" }}>{DOCUMENT_KIND_LABELS[document.kind]}</span>
                {document.stage && <span className="text-xs" style={{ color: "var(--th-muted)" }}>{document.stage}</span>}
                {document.issuedOn && (
                  <span className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                    {formatAccountabilityDate(document.issuedOn)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ReadSection>
  );
}
