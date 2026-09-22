"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import {
  RECEIPT_STATUS_COLORS,
  RECEIPT_STATUS_LABELS,
  SUPPORT_MODALITY_ICONS,
  SUPPORT_MODALITY_LABELS,
  SUPPORT_TYPE_LABELS,
  SUPPORTER_CATEGORY_LABELS,
  formatCents,
  supportErrorMessage,
} from "@/lib/app/support";
import { formatDate } from "@/lib/app/format";
import type { AgentDemandSupport, SupportTotals } from "@/lib/app/types";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";
import { FormAlert, TextArea } from "../demand/fields";

/**
 * "Apoios recebidos" em Minhas demandas (T16): o Agente autor confirma o
 * recebimento do apoio declarado (dupla confirmação) — com evidência já
 * enviada à demanda (T08) — ou contesta com justificativa.
 */
export function DemandSupportsInbox({ demandId }: { demandId: string }) {
  const [supports, setSupports] = useState<AgentDemandSupport[]>([]);
  const [totals, setTotals] = useState<SupportTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [answering, setAnswering] = useState<{ id: string; kind: "confirmar" | "contestar" } | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api.agentDemandSupports(demandId);
      setSupports(data.supports);
      setTotals(data.totals);
    } catch {
      setSupports([]);
    } finally {
      setLoading(false);
    }
  }, [demandId]);

  useEffect(() => { void reload(); }, [reload]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      setAnswering(null);
      await reload();
    } catch (err) {
      setError(supportErrorMessage(err, "Não foi possível responder agora. Tente de novo."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
      <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
        <Icon name="volunteer" size={16} style={{ color: "#f4841a" }} /> Apoios recebidos
      </h3>
      {totals && totals.total > 0 && (
        <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
          {totals.declared} aguardando confirmação · {totals.confirmed} confirmados · {totals.contested} contestados
        </p>
      )}
      {supports.length === 0 ? (
        <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>Nenhum apoio registrado nesta demanda ainda.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {supports.map((support) => {
            const amount = formatCents(support.amountCents);
            const canceled = support.canceledAt !== null;
            return (
              <li key={support.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name={SUPPORT_MODALITY_ICONS[support.modality] as IconName} size={15} style={{ color: "#f4841a" }} />
                  <span className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{support.supporter.name ?? "Apoiador"}</span>
                  <span className="text-[11px] font-semibold" style={{ color: "var(--th-muted)" }}>
                    {SUPPORTER_CATEGORY_LABELS[support.supporter.category]}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: canceled ? "var(--th-muted)" : RECEIPT_STATUS_COLORS[support.receiptStatus] }}>
                    {canceled ? "Cancelado pelo apoiador" : RECEIPT_STATUS_LABELS[support.receiptStatus]}
                  </span>
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
                  {SUPPORT_MODALITY_LABELS[support.modality]} · {SUPPORT_TYPE_LABELS[support.supportType]}
                  {amount ? ` · ${amount} declarados` : ""} · {formatDate(support.occurredOn ?? support.createdAt)}
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>{support.description}</p>
                {support.message && <p className="mt-1 text-xs italic" style={{ color: "var(--th-muted)" }}>“{support.message}”</p>}
                {support.evidence.length > 0 && (
                  <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
                    {support.evidence.length} {support.evidence.length === 1 ? "evidência anexada" : "evidências anexadas"}
                  </p>
                )}
                {!canceled && support.receiptStatus !== "confirmado" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" icon="check" disabled={busy}
                      onClick={() => setAnswering({ id: support.id, kind: "confirmar" })}>
                      Confirmar recebimento
                    </Button>
                    {support.receiptStatus === "declarado" && (
                      <Button type="button" size="sm" variant="ghost" icon="close" disabled={busy}
                        onClick={() => setAnswering({ id: support.id, kind: "contestar" })}>
                        Contestar
                      </Button>
                    )}
                  </div>
                )}
                {answering?.id === support.id && (
                  <ReceiptForm
                    kind={answering.kind}
                    busy={busy}
                    onCancel={() => setAnswering(null)}
                    onSubmit={(note, evidence) => void act(
                      () => (answering.kind === "confirmar"
                        ? api.confirmSupportReceipt(demandId, support.id, { note, evidence })
                        : api.contestSupportReceipt(demandId, support.id, { note })),
                      answering.kind === "confirmar" ? "Recebimento confirmado." : "Apoio contestado.",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2 space-y-2" aria-live="polite">
        {notice && <FormAlert tone="success" message={notice} />}
        {error && <FormAlert message={error} />}
      </div>
    </section>
  );
}

/** Confirmação (evidência opcional) ou contestação (justificativa obrigatória). */
function ReceiptForm({ kind, busy, onSubmit, onCancel }: {
  kind: "confirmar" | "contestar";
  busy: boolean;
  onSubmit: (note: string | null, evidence: string[]) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border p-3"
      style={{ borderColor: "var(--th-border)", background: "var(--th-card)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === "contestar" && !note.trim()) {
          setError("Diga por que o apoio está sendo contestado.");
          return;
        }
        setError(null);
        onSubmit(note.trim() || null, kind === "confirmar"
          ? evidence.split(/[\s,;]+/).map((ref) => ref.trim()).filter(Boolean)
          : []);
      }}
    >
      <TextArea
        name={`nota-${kind}`}
        label={kind === "confirmar" ? "Observação (opcional)" : "Justificativa da contestação"}
        required={kind === "contestar"}
        value={note}
        onValue={setNote}
        rows={3}
        maxLength={2000}
      />
      {kind === "confirmar" && (
        <TextArea
          name="evidencias"
          label="Evidências (opcional)"
          value={evidence}
          onValue={setEvidence}
          rows={2}
          hint="Referências de arquivos já enviados a esta demanda (upload:<id>), separadas por espaço."
        />
      )}
      {error && <FormAlert message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" icon={kind === "confirmar" ? "check" : "close"} loading={busy}>
          {kind === "confirmar" ? "Confirmar" : "Contestar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
      </div>
    </form>
  );
}
