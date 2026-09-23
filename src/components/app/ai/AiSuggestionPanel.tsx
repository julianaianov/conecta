"use client";

// Sugestões de inteligência artificial na demanda (T23).
//
// Fonte: Apresentação Institucional, slide 23. Decisão 6: flag desligada por
// padrão e a IA **nunca bloqueia o fluxo**.
//
// Contrato visual, que vale para toda saída de modelo na plataforma:
//   - o cartão abre com o selo "Sugestão de IA" e o nome do recurso;
//   - a justificativa vem junto, e ao lado ficam os **números verificáveis**
//     que saíram do banco (não do modelo);
//   - a pessoa decide: "Aceitar" ou "Ignorar". Aceitar **não** altera a
//     demanda — registra a decisão e lembra que o valor é aplicado por você,
//     na edição da demanda;
//   - sem IA (flag desligada, sem chave, limite, falha ou base vazia), o
//     cartão mostra a frase do motivo. Nunca há resultado inventado.

import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import {
  AI_DISCLAIMER,
  AI_KIND_LABELS,
  AI_LABEL,
  aiUnavailableMessage,
  evidenceEntries,
  isInDevelopment,
  type AiEditalMatch,
  type AiKind,
  type AiPartnerMatch,
  type AiResult,
  type AiStatus,
  type AiSuggestion,
  type OrganizationSuggestion,
  type UrgencySuggestion,
} from "@/lib/app/ai";
import { DEMAND_CATEGORY_LABELS, DEMAND_PRIORITY_LABELS } from "@/lib/app/types";
import { demandErrorMessage } from "@/lib/app/demand";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { InDevelopment } from "../InDevelopment";
import { EmptyState } from "../ui";

/** Selo obrigatório: nenhuma saída de modelo aparece sem ele. */
export function AiBadge({ kind }: { kind?: AiKind }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: "rgba(99,102,241,0.14)", color: "#4338ca" }}
    >
      <Icon name="bolt" size={12} aria-hidden />
      {AI_LABEL}
      {kind ? <span className="font-normal">· {AI_KIND_LABELS[kind]}</span> : null}
    </span>
  );
}

/** Números verificáveis do banco, ao lado do texto da IA. */
function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = evidenceEntries(evidence);
  if (!entries.length) return null;
  return (
    <dl className="mt-3 grid gap-1 rounded-xl border p-3 text-xs sm:grid-cols-2"
      style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
      <p className="col-span-full text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
        Dados da plataforma (conferíveis)
      </p>
      {entries.map((entry) => (
        <div key={entry.label} className="flex gap-2">
          <dt style={{ color: "var(--th-muted)" }}>{entry.label}:</dt>
          <dd className="font-semibold" style={{ color: "var(--th-text)" }}>{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Leitura do conteúdo sugerido, por recurso. */
function SuggestionBody({ kind, result }: { kind: AiKind; result: AiDemandResult }) {
  const suggestion = result.suggestion;
  if (!suggestion) return null;
  if (kind === "organizacao_da_demanda") {
    const payload = suggestion.payload as unknown as OrganizationSuggestion;
    return (
      <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--th-text)" }}>
        <li><strong>Categoria sugerida:</strong> {DEMAND_CATEGORY_LABELS[payload.categoria] ?? payload.categoria}</li>
        <li><strong>Território sugerido:</strong> {payload.territorio ?? "sem sugestão"}</li>
        <li><strong>Confiança:</strong> {payload.confianca}</li>
      </ul>
    );
  }
  if (kind === "deteccao_de_urgencia") {
    const payload = suggestion.payload as unknown as UrgencySuggestion;
    return (
      <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--th-text)" }}>
        <li><strong>Prioridade sugerida:</strong> {DEMAND_PRIORITY_LABELS[payload.prioridade] ?? payload.prioridade}</li>
        <li><strong>Confiança:</strong> {payload.confianca}</li>
        {payload.sinais?.length ? <li><strong>Sinais:</strong> {payload.sinais.join("; ")}</li> : null}
      </ul>
    );
  }
  if (kind === "sugestao_de_editais") {
    return (
      <ul className="mt-2 space-y-2 text-sm" style={{ color: "var(--th-text)" }}>
        {(result.editais ?? []).map((item) => (
          <li key={item.edital.id} className="rounded-xl border p-2" style={{ borderColor: "var(--th-border)" }}>
            <p className="font-semibold">{item.edital.title}</p>
            {item.edital.programName && <p className="text-xs" style={{ color: "var(--th-muted)" }}>{item.edital.programName}</p>}
            <p className="mt-1 text-xs">Aderência {item.aderencia}: {item.justificativa}</p>
          </li>
        ))}
      </ul>
    );
  }
  if (kind === "conexao_com_patrocinadores") {
    return (
      <ol className="mt-2 space-y-2 text-sm" style={{ color: "var(--th-text)" }}>
        {(result.partners ?? []).map((item) => (
          <li key={item.interestId} className="rounded-xl border p-2" style={{ borderColor: "var(--th-border)" }}>
            <p className="font-semibold">{item.posicao}º na sugestão</p>
            <p className="text-xs">{item.justificativa}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
              Compatibilidade da plataforma: {item.compatibility.score ?? "—"}
              {item.compatibility.level ? ` (${item.compatibility.level})` : ""} · {item.compatibility.reasons.join(" ")}
            </p>
          </li>
        ))}
      </ol>
    );
  }
  return null;
}

/** Qualquer um dos quatro recursos da demanda, como o cartão os exibe. */
type AiDemandResult = AiResult & { editais?: AiEditalMatch[]; partners?: AiPartnerMatch[] };

const ACTIONS: Record<AiKind, string> = {
  organizacao_da_demanda: "Sugerir categoria e território",
  deteccao_de_urgencia: "Sugerir prioridade",
  sugestao_de_editais: "Buscar editais com aderência",
  conexao_com_patrocinadores: "Ordenar interessados",
  relatorio_para_governo: "Gerar rascunho do relatório",
};

/** Painel de um recurso, dentro da demanda do Agente. */
function AiFeatureCard({ demandId, kind, disabledReason }: { demandId: string; kind: AiKind; disabledReason: string | null }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiDemandResult | null>(null);
  const [reviewed, setReviewed] = useState<AiSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setNote(null);
    setReviewed(null);
    try {
      const call: Promise<unknown> = kind === "organizacao_da_demanda" ? api.aiOrganizeDemand(demandId)
        : kind === "deteccao_de_urgencia" ? api.aiDetectUrgency(demandId)
          : kind === "sugestao_de_editais" ? api.aiSuggestEditais(demandId)
            : api.aiSuggestPartners(demandId);
      setResult((await call) as AiDemandResult);
    } catch (err) {
      // Falha de IA nunca vira erro do fluxo: só a frase no cartão.
      setError(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function review(status: "aceita" | "ignorada") {
    if (!result?.suggestion) return;
    setBusy(true);
    try {
      const answer = await api.aiReviewSuggestion(demandId, result.suggestion.id, status);
      setReviewed(answer.suggestion);
      setNote(answer.message);
    } catch (err) {
      setError(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const suggestion = reviewed ?? result?.suggestion ?? null;

  return (
    <section className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
      <header className="flex flex-wrap items-center gap-2">
        <AiBadge kind={kind} />
        {isInDevelopment(kind) && <InDevelopment as="inline">depende de editais cadastrados</InDevelopment>}
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon="bolt"
          disabled={busy || Boolean(disabledReason)}
          onClick={run}
        >
          {ACTIONS[kind]}
        </Button>
      </header>

      {disabledReason && <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>{disabledReason}</p>}
      {error && <p className="mt-2 text-sm" style={{ color: "var(--th-danger, #b91c1c)" }}>{error}</p>}

      {result && !result.available && (
        <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>{aiUnavailableMessage(result)}</p>
      )}

      {result?.available && suggestion && (
        <div className="mt-2">
          <SuggestionBody kind={kind} result={result} />
          {suggestion.rationale && (
            <p className="mt-2 text-sm" style={{ color: "var(--th-text)" }}>
              <strong>Justificativa:</strong> {suggestion.rationale}
            </p>
          )}
          <Evidence evidence={suggestion.evidence} />
          <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>{AI_DISCLAIMER}</p>
          {suggestion.status === "sugerida" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" icon="check" disabled={busy} onClick={() => review("aceita")}>Aceitar</Button>
              <Button type="button" size="sm" variant="outline" icon="close" disabled={busy} onClick={() => review("ignorada")}>Ignorar</Button>
            </div>
          ) : (
            <p className="mt-2 text-sm font-semibold" style={{ color: "var(--th-text)" }}>
              {suggestion.status === "aceita" ? "Sugestão aceita." : "Sugestão ignorada."}
            </p>
          )}
          {note && <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>{note}</p>}
        </div>
      )}
    </section>
  );
}

const DEMAND_KINDS: AiKind[] = [
  "organizacao_da_demanda", "deteccao_de_urgencia", "sugestao_de_editais", "conexao_com_patrocinadores",
];

/** Aba "Sugestões de IA" do detalhe da demanda em Minhas demandas. */
export function AiSuggestionPanel({ demandId }: { demandId: string }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [history, setHistory] = useState<AiSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      api.aiStatus().catch(() => null),
      api.aiDemandSuggestions(demandId).catch(() => []),
    ]).then(([s, h]) => {
      if (!alive) return;
      setStatus(s);
      setHistory(h);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [demandId]);

  if (loading) return <p className="text-sm" style={{ color: "var(--th-muted)" }}>Carregando…</p>;

  const disabledReason = status && !status.available
    ? aiUnavailableMessage({ message: status.message ?? undefined, reason: status.reason ?? undefined })
    : null;

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--th-muted)" }}>
        A inteligência artificial <strong>sugere</strong>; quem decide é você. Nada aqui altera a demanda, entra no
        dossiê ou na prestação de contas.
      </p>
      {disabledReason && (
        <p className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}>
          {disabledReason}
        </p>
      )}
      {DEMAND_KINDS.map((kind) => (
        <AiFeatureCard key={kind} demandId={demandId} kind={kind} disabledReason={disabledReason} />
      ))}
      <section>
        <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
          Histórico de sugestões
        </h4>
        {history.length === 0 ? (
          <EmptyState icon="info" title="Nenhuma sugestão gerada ainda" />
        ) : (
          <ul className="mt-2 space-y-2">
            {history.map((item) => (
              <li key={item.id} className="rounded-xl border p-2 text-sm" style={{ borderColor: "var(--th-border)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <AiBadge kind={item.kind} />
                  <span style={{ color: "var(--th-muted)" }}>
                    {item.status === "sugerida" ? "aguardando revisão" : item.status}
                  </span>
                </div>
                {item.rationale && <p className="mt-1" style={{ color: "var(--th-text)" }}>{item.rationale}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
