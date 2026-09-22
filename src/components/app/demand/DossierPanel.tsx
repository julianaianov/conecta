"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { demandErrorMessage } from "@/lib/app/demand";
import {
  DOSSIER_STATUS_LABELS,
  DOSSIER_TITLE,
  DOSSIER_TRIGGER_LABELS,
  DOSSIER_VARIANT_LABELS,
  canRegenerate,
  formatBytesShort,
  shortHash,
  sortDossiers,
} from "@/lib/app/dossier";
import type { DemandDossier } from "@/lib/app/types";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { FormAlert } from "./fields";

function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLOR: Record<DemandDossier["status"], string> = {
  gerado: "#2e9e5b",
  pendente: "#2e7ba8",
  falhou: "#e53935",
  indisponivel: "#868e96",
};

/**
 * Versões do Dossiê da Demanda para o autor (T10): baixar (URL assinada curta),
 * verificar e pedir a geração de novo quando ficou pendente ou falhou.
 * `emptyHint`: texto quando ainda não há versão (ex.: antes do primeiro envio).
 */
export function DossierPanel({ demandId, emptyHint, compact = false }: { demandId: string; emptyHint?: string; compact?: boolean }) {
  const [list, setList] = useState<DemandDossier[] | null>(null);
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await api.myDemandDossiers(demandId);
      setList(sortDossiers(body.dossiers));
      setStorageConfigured(body.storageConfigured);
      setError(null);
    } catch (err) {
      setError(demandErrorMessage(err, "Não foi possível carregar o dossiê agora."));
    }
  }, [demandId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Enquanto houver versão sendo gerada, confere de novo em alguns segundos.
  const generating = list?.some((d) => d.status === "pendente") ?? false;
  useEffect(() => {
    if (!generating) return;
    const timer = setTimeout(() => void load(), 4000);
    return () => clearTimeout(timer);
  }, [generating, list, load]);

  async function download(dossier: DemandDossier) {
    setBusy(dossier.id);
    setError(null);
    try {
      const { url } = await api.demandDossierDownload(demandId, dossier.id);
      window.location.assign(url);
    } catch (err) {
      setError(demandErrorMessage(err, "Não foi possível baixar o dossiê agora."));
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy("regenerate");
    setError(null);
    try {
      const body = await api.regenerateDemandDossiers(demandId);
      setList(sortDossiers(body.dossiers));
    } catch (err) {
      setError(demandErrorMessage(err, "Não foi possível gerar o dossiê agora."));
      void load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby={`dossie-${demandId}`} className={compact ? "" : "app-card rounded-2xl p-4 sm:p-5"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(46,123,168,0.12)", color: "#2e7ba8" }}>
          <Icon name="document" size={15} />
        </span>
        <h2 id={`dossie-${demandId}`} className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{DOSSIER_TITLE}</h2>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
        Gerado automaticamente no envio para análise, em cada reenvio e na publicação. Cada versão fica gravada sem alteração, com SHA-256 para verificação.
      </p>

      {!list && !error && <div className="flex justify-center py-4"><span className="app-spinner" aria-label="Carregando o dossiê" /></div>}
      {list && list.length === 0 && (
        <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>{emptyHint ?? "Nenhuma versão ainda: o dossiê é gerado quando a demanda é enviada para análise."}</p>
      )}
      {!storageConfigured && (
        <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>
          O armazenamento de arquivos não está configurado neste ambiente; as versões ficam registradas e o PDF é gerado quando ele estiver disponível.
        </p>
      )}

      {list && list.length > 0 && (
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--th-border)" }} role="list">
          {list.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>
                  Versão {d.version} · {DOSSIER_VARIANT_LABELS[d.variant]}
                  <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: STATUS_COLOR[d.status], background: `${STATUS_COLOR[d.status]}1a` }}>
                    {DOSSIER_STATUS_LABELS[d.status]}
                  </span>
                </p>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  {d.number} · {DOSSIER_TRIGGER_LABELS[d.trigger]}
                  {d.generatedAt ? ` · ${dateTime(d.generatedAt)}` : ""}
                  {d.sizeBytes ? ` · ${formatBytesShort(d.sizeBytes)}` : ""}
                </p>
                {d.contentSha256 && d.verifyPath && (
                  <p className="mt-0.5 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                    SHA-256 {shortHash(d.contentSha256)} ·{" "}
                    <Link href={d.verifyPath} className="font-semibold underline" style={{ color: "#2e7ba8" }}>verificar</Link>
                  </p>
                )}
                {d.statusReason && <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>{d.statusReason}</p>}
              </div>
              {d.status === "gerado" && (
                <Button type="button" size="sm" variant="outline" icon="download" loading={busy === d.id} disabled={busy !== null && busy !== d.id} onClick={() => void download(d)}>
                  Baixar PDF
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {list && canRegenerate(list) && storageConfigured && (
        <Button type="button" className="mt-2" size="sm" variant="secondary" icon="document" loading={busy === "regenerate"} disabled={busy !== null && busy !== "regenerate"} onClick={() => void regenerate()}>
          Gerar de novo
        </Button>
      )}
      {error && <div className="mt-3"><FormAlert message={error} /></div>}
    </section>
  );
}
