"use client";

/**
 * "Solicitações recebidas" do Agente autor (T-05-05, Modelo de Conexão §10 e
 * §12): pedidos de informações, documentos, reunião e análise técnica de
 * Parceiros e do Poder Público (inclusive os feitos pela resposta
 * institucional) e as recusas com motivo. O Agente responde uma vez, com
 * texto e documentos da demanda ("Agente envia os documentos solicitados").
 */
import { useCallback, useEffect, useState } from "react";
import { api, DemandRequestError } from "@/lib/app/api";
import type { AnalysisRequest } from "@/lib/app/analysis";
import type { DemandDocument } from "@/lib/app/types";
import { Button } from "../Button";
import { Checkbox, FormAlert, TextArea } from "../demand/fields";
import { AnalysisRequestList } from "./AnalysisRequestPanel";

function AnswerForm({ demandId, request, documents, onDone }: {
  demandId: string; request: AnalysisRequest; documents: DemandDocument[]; onDone: (r: AnalysisRequest) => void;
}) {
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("Escreva a resposta");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await api.answerAnalysisRequest(demandId, request.id, { body, documentIds: selected }));
    } catch (err) {
      setError(err instanceof DemandRequestError ? err.message : "Não foi possível enviar a resposta agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2" aria-label={`Responder: ${request.kindLabel}`}>
      {error && <FormAlert message={error} />}
      <TextArea name={`answer-${request.id}`} label="Sua resposta" required value={body} onValue={setBody} rows={3} maxLength={5000} />
      {documents.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold" style={{ color: "var(--th-muted)" }}>Anexar documentos da demanda</legend>
          {documents.map((d) => (
            <Checkbox key={d.id} name={`answer-${request.id}-doc-${d.id}`} label={d.title} checked={selected.includes(d.id)}
              onChecked={(on) => setSelected((list) => (on ? [...list, d.id] : list.filter((x) => x !== d.id)))} />
          ))}
        </fieldset>
      )}
      <Button type="submit" size="sm" icon="check" loading={busy}>Enviar resposta</Button>
    </form>
  );
}

export function AnalysisRequestsInbox({ demandId }: { demandId: string }) {
  const [requests, setRequests] = useState<AnalysisRequest[] | null>(null);
  const [documents, setDocuments] = useState<DemandDocument[]>([]);
  const [answering, setAnswering] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await api.receivedAnalysisRequests(demandId));
    } catch {
      setRequests([]);
    }
  }, [demandId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let alive = true;
    api.getMyDemand(demandId).then((d) => { if (alive) setDocuments(d?.documents ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, [demandId]);

  if (!requests || requests.length === 0) return null;
  const open = requests.filter((r) => r.status === "aberta");
  return (
    <section aria-label="Solicitações recebidas" className="mb-4 space-y-2">
      <h3 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>
        Solicitações recebidas{open.length ? ` · ${open.length} aguardando resposta` : ""}
      </h3>
      <AnalysisRequestList requests={requests} showRequester />
      {open.map((r) => (
        <div key={r.id}>
          {answering === r.id ? (
            <AnswerForm demandId={demandId} request={r} documents={documents}
              onDone={(next) => { setAnswering(null); setRequests((list) => list?.map((x) => (x.id === next.id ? next : x)) ?? null); }} />
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setAnswering(r.id)}>
              Responder: {r.kindLabel.toLowerCase()}{r.requesterName ? ` (${r.requesterName})` : ""}
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
