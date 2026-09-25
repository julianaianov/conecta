"use client";

import { useEffect, useState } from "react";
import { api, DemandRequestError } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import {
  DEMAND_ACCESS_ROLE_LABELS,
  DOCUMENT_ACCESS_LEVELS,
  DOCUMENT_ACCESS_LEVEL_HINTS,
  DOCUMENT_ACCESS_LEVEL_LABELS,
  documentAccessErrorMessage,
  type DemandAccessDocument,
  type DemandDocumentsAccess,
  type DocumentAccessLevel,
  type SignedFileLink,
} from "@/lib/app/document-access";
import type { DemandDocumentType } from "@/lib/app/types";
import { Button } from "../Button";
import { DocumentsSummary } from "./DemandParts";
import { FormAlert } from "./fields";

type PublicDocument = { id: string; type: DemandDocumentType; title: string };

function AccessBadge({ level }: { level: DocumentAccessLevel }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
      title={DOCUMENT_ACCESS_LEVEL_HINTS[level]}
      style={{ background: "rgba(46,123,168,0.12)", color: "#2e7ba8" }}
    >
      {DOCUMENT_ACCESS_LEVEL_LABELS[level]}
    </span>
  );
}

/**
 * Documentação da demanda no nível de visibilidade (T-05-18; Modelo de
 * Conexão §33; decisão 13). Quem é envolvido no processo (autor, delegados,
 * partes, órgão com acompanhamento aberto, conexão aceita) abre os arquivos e o
 * dossiê integral por URL assinada curta, e a abertura fica registrada na linha
 * do tempo privada. O autor define o nível de cada documento. Para os demais,
 * mostra só o tipo e o nome (`documents`, projeção pública).
 */
export function DemandDocumentsAccessPanel({ demandId, documents = [] }: { demandId: string; documents?: PublicDocument[] }) {
  const { user, status } = useAuth();
  const [access, setAccess] = useState<DemandDocumentsAccess | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    let alive = true;
    api.demandDocumentsAccess(demandId)
      .then((a) => { if (alive) setAccess(a); })
      .catch(() => { if (alive) setAccess(null); });
    return () => { alive = false; };
  }, [demandId, status, user]);

  async function open(key: string, load: () => Promise<SignedFileLink>) {
    setBusy(key);
    setError(null);
    try {
      const link = await load();
      window.location.assign(link.url);
    } catch (err) {
      setError(err instanceof DemandRequestError
        ? documentAccessErrorMessage(err.status, err.code ?? undefined)
        : documentAccessErrorMessage(undefined));
    } finally {
      setBusy(null);
    }
  }

  async function changeLevel(doc: DemandAccessDocument, level: DocumentAccessLevel) {
    setBusy(`nivel-${doc.id}`);
    setError(null);
    try {
      const saved = await api.setDemandDocumentAccess(demandId, doc.id, { accessLevel: level, restrictedTo: doc.restrictedTo });
      setAccess((a) => (a ? { ...a, documents: a.documents.map((d) => (d.id === saved.id ? saved : d)) } : a));
    } catch {
      setError("Não foi possível alterar o acesso ao documento agora.");
    } finally {
      setBusy(null);
    }
  }

  if (!access) return <DocumentsSummary documents={documents} />;

  const byId = new Map(access.documents.map((d) => [d.id, d]));
  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "var(--th-muted)" }}>
        Acesso como {DEMAND_ACCESS_ROLE_LABELS[access.role].toLowerCase()}: os arquivos abrem por endereço temporário
        {access.canManage ? "." : " e a consulta fica registrada no histórico da demanda."}
      </p>
      <DocumentsSummary
        documents={access.documents}
        actions={({ id }) => {
          const doc = byId.get(id);
          if (!doc) return null;
          return (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {access.canManage ? (
                <label className="text-xs" style={{ color: "var(--th-muted)" }}>
                  <span className="sr-only">Acesso ao documento {doc.title}</span>
                  <select
                    className="app-input py-1 text-xs"
                    value={doc.accessLevel}
                    disabled={busy === `nivel-${doc.id}`}
                    onChange={(e) => void changeLevel(doc, e.target.value as DocumentAccessLevel)}
                    title={DOCUMENT_ACCESS_LEVEL_HINTS[doc.accessLevel]}
                  >
                    {DOCUMENT_ACCESS_LEVELS.map((l) => <option key={l} value={l}>{DOCUMENT_ACCESS_LEVEL_LABELS[l]}</option>)}
                  </select>
                </label>
              ) : <AccessBadge level={doc.accessLevel} />}
              {doc.hasFile && (
                <Button
                  type="button" size="sm" variant="outline" icon="download" loading={busy === doc.id}
                  onClick={() => void open(doc.id, () => api.openDemandDocument(demandId, doc.id))}
                >
                  Abrir
                </Button>
              )}
            </div>
          );
        }}
      />
      {access.canManage && (
        <p className="text-xs" style={{ color: "var(--th-muted)" }}>
          {DOCUMENT_ACCESS_LEVELS.map((l) => `${DOCUMENT_ACCESS_LEVEL_LABELS[l]}: ${DOCUMENT_ACCESS_LEVEL_HINTS[l].toLowerCase()}`).join(". ")}.
        </p>
      )}
      {access.dossier && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--th-border)" }}>
          <p className="text-sm" style={{ color: "var(--th-text)" }}>
            <strong>Dossiê integral</strong> · {access.dossier.number} v{access.dossier.version}
          </p>
          <Button
            type="button" size="sm" icon="document" loading={busy === "dossie"}
            onClick={() => void open("dossie", () => api.demandIntegralDossier(demandId))}
          >
            Dossiê integral
          </Button>
        </div>
      )}
      {error && <FormAlert message={error} />}
    </div>
  );
}
