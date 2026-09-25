"use client";

/**
 * Respostas à análise (T-05-05, Modelo de Conexão §10) na página pública da
 * demanda, para Parceiros e o Poder Público validado: "Solicitar
 * informações", "Solicitar documentos", "Solicitar reunião", "Solicitar
 * análise técnica" e "Recusar" (motivo obrigatório), e as solicitações já
 * feitas com a resposta do Agente. Some para o autor, para quem não está
 * logado e para os demais perfis.
 */
import { useEffect, useState } from "react";
import { api, DemandRequestError } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import {
  ANALYSIS_REQUEST_ACTIONS, ANALYSIS_REQUEST_KINDS, ANALYSIS_REQUEST_STATUS_LABELS, MEETING_MODES, analysisRequestProblem,
  type AnalysisRequest, type AnalysisRequestKind, type MeetingMode,
} from "@/lib/app/analysis";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/app/demand";
import { MEETING_MODE_LABELS } from "@/lib/app/institutional";
import { formatDate } from "@/lib/app/format";
import type { DemandDocumentType } from "@/lib/app/types";
import { useEffectiveRole } from "../institution/useInstitutionAccess";
import { Button } from "../Button";
import { Card } from "../ui";
import { Checkbox, FormAlert, SelectInput, TextArea, TextInput } from "../demand/fields";

/** Lista das solicitações com a resposta (visão de quem pediu ou do Agente). */
export function AnalysisRequestList({ requests, showRequester = false }: { requests: AnalysisRequest[]; showRequester?: boolean }) {
  if (!requests.length) return null;
  return (
    <ul className="space-y-2">
      {requests.map((r) => (
        <li key={r.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>
              {r.kindLabel}{showRequester && r.requesterName ? ` · ${r.requesterName}` : ""}
            </p>
            <span className="text-xs font-semibold" style={{ color: r.status === "aberta" ? "#a15c00" : "var(--th-muted)" }}>
              {ANALYSIS_REQUEST_STATUS_LABELS[r.status]}
            </span>
          </div>
          <p className="whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{r.body}</p>
          {r.requestedDocumentTypes.length > 0 && (
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>
              Documentos: {r.requestedDocumentTypes.map((t) => DOCUMENT_TYPE_LABELS[t] ?? t).join(", ")}
            </p>
          )}
          {(r.meetingProposedAt || r.meetingMode) && (
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>
              Reunião{r.meetingMode ? ` ${MEETING_MODE_LABELS[r.meetingMode].toLowerCase()}` : ""}
              {r.meetingProposedAt ? ` · ${formatDate(r.meetingProposedAt)}` : ""}
            </p>
          )}
          <p className="text-[11px]" style={{ color: "var(--th-muted)" }}>
            {formatDate(r.createdAt)}{r.processProtocol ? ` · processo ${r.processProtocol}` : ""}
            {r.fromInstitutionalResponse ? " · resposta institucional" : ""}
          </p>
          {r.answerBody && (
            <div className="mt-2 rounded-lg p-2" style={{ background: "var(--th-card-alt)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--th-text)" }}>Resposta do Agente{r.answeredAt ? ` · ${formatDate(r.answeredAt)}` : ""}</p>
              <p className="whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{r.answerBody}</p>
              {r.answerDocuments.length > 0 && (
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  Documentos enviados: {r.answerDocuments.map((d) => d.title ?? "documento").join(", ")}
                </p>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AnalysisRequestPanel({ demandId, authorId }: { demandId: string; authorId: string | null }) {
  const { user } = useAuth();
  const { role } = useEffectiveRole();
  const allowed = Boolean(user) && user?.id !== authorId && (role === "partner" || role === "government");
  const [requests, setRequests] = useState<AnalysisRequest[]>([]);
  const [kind, setKind] = useState<AnalysisRequestKind | null>(null);
  const [body, setBody] = useState("");
  const [documents, setDocuments] = useState<DemandDocumentType[]>([]);
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingMode, setMeetingMode] = useState<MeetingMode | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api.myAnalysisRequests(demandId).then((list) => { if (alive) setRequests(list); }).catch(() => {});
    return () => { alive = false; };
  }, [allowed, demandId]);

  if (!allowed) return null;

  function choose(next: AnalysisRequestKind) {
    setKind(kind === next ? null : next);
    setError(null);
    setFields({});
    setDone(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return;
    const input = {
      kind, body,
      requestedDocumentTypes: kind === "documentos" ? documents : [],
      meetingProposedAt: kind === "reuniao" && meetingAt ? meetingAt : null,
      meetingMode: kind === "reuniao" && meetingMode ? meetingMode : null,
    };
    const problem = analysisRequestProblem(input);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const created = await api.createAnalysisRequest(demandId, input);
      setRequests((list) => [created, ...list]);
      setDone(kind === "recusa"
        ? "Recusa registrada com o motivo. O Agente de Transformação foi avisado."
        : "Solicitação enviada. O Agente de Transformação foi avisado e a resposta aparece aqui.");
      setKind(null);
      setBody(""); setDocuments([]); setMeetingAt(""); setMeetingMode("");
    } catch (err) {
      if (err instanceof DemandRequestError) {
        setError(err.message);
        setFields(err.fields as Record<string, string>);
      } else {
        setError("Não foi possível registrar agora. Tente de novo.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>Análise da demanda</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--th-muted)" }}>
        Peça ao Agente de Transformação o que falta para analisar, ou recuse informando o motivo.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Respostas à análise">
        {ANALYSIS_REQUEST_KINDS.map((k) => (
          <Button key={k} type="button" size="sm" variant={kind === k ? "primary" : "outline"} aria-pressed={kind === k}
            onClick={() => choose(k)}>
            {ANALYSIS_REQUEST_ACTIONS[k]}
          </Button>
        ))}
      </div>
      {done && <div className="mt-3"><FormAlert message={done} tone="success" /></div>}
      {kind && (
        <form onSubmit={submit} className="mt-3 space-y-3" aria-label={ANALYSIS_REQUEST_ACTIONS[kind]}>
          {error && <FormAlert message={error} />}
          <TextArea name="analysis-body" label={kind === "recusa" ? "Motivo da recusa" : "O que você precisa"} required
            value={body} onValue={setBody} rows={3} maxLength={3000} error={fields.body} />
          {kind === "documentos" && (
            <fieldset className="grid gap-1 sm:grid-cols-2">
              <legend className="mb-1 text-xs font-semibold" style={{ color: "var(--th-muted)" }}>Documentos solicitados</legend>
              {DOCUMENT_TYPES.map((t) => (
                <Checkbox key={t} name={`analysis-doc-${t}`} label={DOCUMENT_TYPE_LABELS[t]} checked={documents.includes(t)}
                  onChecked={(on) => setDocuments((list) => (on ? [...list, t] : list.filter((x) => x !== t)))} />
              ))}
              {fields.requestedDocumentTypes && <FormAlert message={fields.requestedDocumentTypes} />}
            </fieldset>
          )}
          {kind === "reuniao" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="analysis-meeting-at" label="Data e hora sugeridas" type="datetime-local" value={meetingAt}
                onValue={setMeetingAt} error={fields.meetingProposedAt} />
              <SelectInput name="analysis-meeting-mode" label="Formato" value={meetingMode} placeholder="A combinar"
                onValue={(v) => setMeetingMode(v as MeetingMode | "")}
                options={MEETING_MODES.map((m) => ({ value: m, label: MEETING_MODE_LABELS[m] }))} error={fields.meetingMode} />
            </div>
          )}
          <Button type="submit" size="sm" icon="check" loading={busy}>
            {kind === "recusa" ? "Registrar recusa" : "Enviar solicitação"}
          </Button>
        </form>
      )}
      {requests.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Suas solicitações</h3>
          <AnalysisRequestList requests={requests} />
        </div>
      )}
    </Card>
  );
}
