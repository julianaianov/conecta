"use client";

/**
 * "Solicitações recebidas" do Agente autor (T-05-05, Modelo de Conexão §10 e
 * §12): pedidos de informações, documentos, reunião e análise técnica de
 * Parceiros e do Poder Público (inclusive os feitos pela resposta
 * institucional) e as recusas com motivo. O Agente responde uma vez, com
 * texto e documentos ("Agente envia os documentos solicitados"): os da demanda
 * ou um documento novo, enviado para a área de documentos do processo quando a
 * solicitação já tem protocolo (T-05-04, Modelo §17).
 */
import { useCallback, useEffect, useId, useState } from "react";
import { api, DemandRequestError } from "@/lib/app/api";
import type { AnalysisRequest } from "@/lib/app/analysis";
import {
  PROCESS_DOCUMENT_TYPE_LABELS, processTypeForDemandType, type ProcessDocumentVersion,
} from "@/lib/app/process-documents";
import type { DemandDocument, DemandModule } from "@/lib/app/types";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Checkbox, FormAlert, TextArea } from "../demand/fields";
import { ProcessDocumentForm } from "../process/ProcessDocuments";
import { AnalysisRequestList } from "./AnalysisRequestPanel";

function AnswerForm({ demandId, request, documents, module, onDone }: {
  demandId: string; request: AnalysisRequest; documents: DemandDocument[]; module: DemandModule | null;
  onDone: (r: AnalysisRequest) => void;
}) {
  const formId = `answer-form-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<ProcessDocumentVersion[]>([]);
  const [adding, setAdding] = useState(false);
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
      onDone(await api.answerAnalysisRequest(demandId, request.id, {
        body, documentIds: [...selected, ...uploaded.map((d) => d.id)],
      }));
    } catch (err) {
      setError(err instanceof DemandRequestError ? err.message : "Não foi possível enviar a resposta agora.");
    } finally {
      setBusy(false);
    }
  }

  // O formulário do documento novo é outro <form>: fica ao lado do da resposta (não dentro), e o
  // botão "Enviar resposta" se liga ao da resposta pelo atributo `form`.
  return (
    <div className="mt-2 space-y-2">
      <form id={formId} onSubmit={submit} className="space-y-2" aria-label={`Responder: ${request.kindLabel}`}>
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
      </form>
      {request.processId ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold" style={{ color: "var(--th-muted)" }}>Documento novo</p>
          {uploaded.length > 0 && (
            <ul className="space-y-1" aria-label="Documentos novos desta resposta">
              {uploaded.map((d) => (
                <li key={d.id} className="flex items-center gap-1.5 text-sm" style={{ color: "var(--th-text)" }}>
                  <Icon name="check" size={14} className="shrink-0" style={{ color: "#2e7d32" }} />
                  <span className="min-w-0 break-words">{d.name} · {PROCESS_DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType}</span>
                </li>
              ))}
            </ul>
          )}
          {adding ? (
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
              <ProcessDocumentForm
                processId={request.processId}
                module={module}
                simple
                defaultType={processTypeForDemandType(request.requestedDocumentTypes[0])}
                submitLabel="Anexar à resposta"
                onCreated={(doc) => { setUploaded((list) => [...list, doc]); setAdding(false); }}
                onCancel={() => setAdding(false)}
              />
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" icon="plus" onClick={() => setAdding(true)}>Enviar documento novo</Button>
          )}
          <p className="text-xs" style={{ color: "var(--th-muted)" }}>
            O documento entra na área de documentos do processo{request.processProtocol ? ` ${request.processProtocol}` : ""} assim que é anexado.
          </p>
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--th-muted)" }}>
          Esta solicitação ainda não tem processo de conexão (protocolo): por enquanto só dá para anexar os documentos da demanda.
        </p>
      )}
      <Button type="submit" form={formId} size="sm" icon="check" loading={busy}>Enviar resposta</Button>
    </div>
  );
}

export function AnalysisRequestsInbox({ demandId }: { demandId: string }) {
  const [requests, setRequests] = useState<AnalysisRequest[] | null>(null);
  const [documents, setDocuments] = useState<DemandDocument[]>([]);
  const [module, setModule] = useState<DemandModule | null>(null);
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
    api.getMyDemand(demandId).then((d) => {
      if (!alive) return;
      setDocuments(d?.documents ?? []);
      setModule(d?.module ?? null);
    }).catch(() => {});
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
            <AnswerForm demandId={demandId} request={r} documents={documents} module={module}
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
