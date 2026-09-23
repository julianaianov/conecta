"use client";

// Geração de relatórios para governo (T23, slide 23), sobre os indicadores da
// área de governo (T22, slide 14).
//
// O texto é **rascunho sugerido por IA**: aparece marcado, sempre com os
// números que o alimentaram exibidos ao lado, tirados do mesmo painel e
// conferíveis. Nada aqui é publicado sozinho, e nada entra em dossiê ou
// prestação de contas: o representante copia o que servir para o documento
// oficial do órgão.
//
// Sem IA (flag desligada, sem chave, limite, falha), a seção mostra o motivo e
// o painel de indicadores continua funcionando normalmente.

import { useState } from "react";
import { api } from "@/lib/app/api";
import {
  AI_DISCLAIMER,
  aiUnavailableMessage,
  type AiGovernmentReportData,
  type AiResult,
  type GovernmentReportSuggestion,
} from "@/lib/app/ai";
import { INDICATORS, type IndicatorId } from "@/lib/app/government";
import { demandErrorMessage } from "@/lib/app/demand";
import { Button } from "../Button";
import { Card, SectionTitle } from "../ui";
import { AiBadge } from "./AiSuggestionPanel";

type Result = AiResult<GovernmentReportSuggestion> & { report?: AiGovernmentReportData };

export function GovernmentAiReport({ filter = {} }: { filter?: Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.aiGovernmentReport(filter));
    } catch (err) {
      // Falha de IA não derruba o painel: só a frase nesta seção.
      setError(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const suggestion = result?.suggestion;
  const indicators = result?.report?.indicators ?? {};

  return (
    <Card>
      <SectionTitle icon="bolt" action={
        <Button type="button" size="sm" variant="outline" icon="bolt" disabled={busy} onClick={run}>
          {busy ? "Gerando…" : "Gerar rascunho"}
        </Button>
      }>
        Relatório sugerido por IA
      </SectionTitle>
      <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
        Rascunho de texto a partir dos indicadores deste recorte. Confira os números ao lado antes de usar:
        o relatório oficial é do órgão, não da plataforma.
      </p>

      {error && <p className="mt-2 text-sm" style={{ color: "var(--th-danger, #b91c1c)" }}>{error}</p>}
      {result && !result.available && (
        <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>{aiUnavailableMessage(result)}</p>
      )}

      {suggestion && (
        <article className="mt-3">
          <AiBadge kind="relatorio_para_governo" />
          <h3 className="mt-2 text-base font-bold" style={{ color: "var(--th-text)" }}>{suggestion.payload.titulo}</h3>
          <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{suggestion.payload.resumo}</p>
          {suggestion.payload.secoes.map((section) => (
            <section key={section.titulo} className="mt-3">
              <h4 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{section.titulo}</h4>
              <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{section.texto}</p>
            </section>
          ))}
          {suggestion.payload.observacao && (
            <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>{suggestion.payload.observacao}</p>
          )}

          <dl className="mt-3 grid gap-1 rounded-xl border p-3 text-xs sm:grid-cols-2"
            style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
            <p className="col-span-full text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
              Números do painel usados neste rascunho
            </p>
            {INDICATORS.filter((indicator) => indicator.kind === "contagem").map((indicator) => (
              <div key={indicator.id} className="flex gap-2">
                <dt style={{ color: "var(--th-muted)" }}>{indicator.label}:</dt>
                <dd className="font-semibold" style={{ color: "var(--th-text)" }}>
                  {indicators[indicator.id as IndicatorId] ?? 0}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>{AI_DISCLAIMER}</p>
        </article>
      )}
    </Card>
  );
}
