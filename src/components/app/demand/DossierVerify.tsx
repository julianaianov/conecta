"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DOSSIER_TITLE,
  DOSSIER_TRIGGER_LABELS,
  DOSSIER_VARIANT_LABELS,
  dossierVerifyPath,
  formatBytesShort,
  normalizeDossierHash,
  sha256OfFile,
} from "@/lib/app/dossier";
import { demandPublicPath } from "@/lib/app/demand";
import type { DossierVerification } from "@/lib/app/types";
import { Button } from "../Button";
import { Icon } from "../Icon";

function dateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Resultado da verificação (renderizado no servidor com a resposta do post-service). */
export function DossierVerifyResult({ hash, raw, result }: { hash: string | null; raw: string; result: DossierVerification | null }) {
  if (!hash) {
    return (
      <section className="app-card rounded-2xl p-5" role="status">
        <p className="text-sm font-bold" style={{ color: "#e53935" }}>Código inválido</p>
        <p className="mt-1 break-all text-sm" style={{ color: "var(--th-muted)" }}>
          “{raw}” não é um SHA-256. Use os 64 caracteres impressos no dossiê (quadro de identificação ou rodapé).
        </p>
      </section>
    );
  }
  if (!result) {
    return (
      <section className="app-card rounded-2xl border p-5" role="status" style={{ borderColor: "rgba(229,57,53,0.45)" }}>
        <p className="flex items-center gap-2 text-sm font-bold" style={{ color: "#e53935" }}><Icon name="close" size={18} /> Nenhum dossiê encontrado</p>
        <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>
          A plataforma não emitiu nenhum {DOSSIER_TITLE} com este SHA-256. Se o documento foi alterado depois de emitido, o código não confere.
        </p>
        <p className="mt-2 break-all text-xs font-numeric" style={{ color: "var(--th-muted)" }}>{hash}</p>
      </section>
    );
  }
  const { dossier, demand } = result;
  return (
    <section className="app-card rounded-2xl border p-5" role="status" style={{ borderColor: "rgba(46,158,91,0.45)" }}>
      <p className="flex items-center gap-2 text-sm font-bold" style={{ color: "#2e9e5b" }}><Icon name="check" size={18} /> Documento autêntico</p>
      <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>
        {DOSSIER_TITLE} emitido pela plataforma DM Conecta
        {result.matchedBy === "file" ? " (o arquivo PDF é idêntico ao emitido)." : " (o conteúdo confere com o emitido)."}
      </p>
      <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
        <dt style={{ color: "var(--th-muted)" }}>Número</dt><dd className="font-numeric" style={{ color: "var(--th-text)" }}>{dossier.number}</dd>
        <dt style={{ color: "var(--th-muted)" }}>Versão</dt>
        <dd style={{ color: "var(--th-text)" }}>
          {dossier.version} · {DOSSIER_VARIANT_LABELS[dossier.variant]}
          {!dossier.isLatest && <span className="ml-1 text-xs" style={{ color: "#f4841a" }}>(existe versão mais recente)</span>}
        </dd>
        <dt style={{ color: "var(--th-muted)" }}>Motivo da geração</dt><dd style={{ color: "var(--th-text)" }}>{DOSSIER_TRIGGER_LABELS[dossier.trigger]}</dd>
        <dt style={{ color: "var(--th-muted)" }}>Gerado em</dt><dd className="font-numeric" style={{ color: "var(--th-text)" }}>{dateTime(dossier.generatedAt)}</dd>
        <dt style={{ color: "var(--th-muted)" }}>Tamanho</dt><dd className="font-numeric" style={{ color: "var(--th-text)" }}>{formatBytesShort(dossier.sizeBytes)}</dd>
        <dt style={{ color: "var(--th-muted)" }}>SHA-256 do conteúdo</dt><dd className="break-all text-xs font-numeric" style={{ color: "var(--th-text)" }}>{dossier.contentSha256}</dd>
        <dt style={{ color: "var(--th-muted)" }}>SHA-256 do arquivo</dt><dd className="break-all text-xs font-numeric" style={{ color: "var(--th-text)" }}>{dossier.fileSha256}</dd>
        <dt style={{ color: "var(--th-muted)" }}>Demanda</dt>
        <dd style={{ color: "var(--th-text)" }}>
          {demand ? (
            <Link href={demandPublicPath(demand.id)} className="font-semibold underline" style={{ color: "#2e7ba8" }}>{demand.title}</Link>
          ) : (
            "Ainda não publicada: o conteúdo fica com o Agente e a equipe de análise."
          )}
        </dd>
      </dl>
    </section>
  );
}

/** Verificar por código ou pelo arquivo (o SHA-256 é calculado no navegador). */
export function DossierVerifyForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);

  function go(event: React.FormEvent) {
    event.preventDefault();
    const hash = normalizeDossierHash(value);
    if (!hash) {
      setError("Informe os 64 caracteres do SHA-256 impresso no dossiê.");
      return;
    }
    setError(null);
    router.push(dossierVerifyPath(hash));
  }

  async function fromFile(file: File | undefined) {
    if (!file) return;
    setHashing(true);
    setError(null);
    try {
      router.push(dossierVerifyPath(await sha256OfFile(file)));
    } catch {
      setError("Não foi possível ler o arquivo neste navegador.");
    } finally {
      setHashing(false);
    }
  }

  return (
    <section className="app-card rounded-2xl p-5" aria-labelledby="verify-form-title">
      <h2 id="verify-form-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Verificar outro dossiê</h2>
      <form onSubmit={go} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="dossier-hash" className="sr-only">SHA-256 do dossiê</label>
        <input
          id="dossier-hash"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="SHA-256 (64 caracteres)"
          autoComplete="off"
          spellCheck={false}
          className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm font-numeric"
          style={{ borderColor: "var(--th-border)", background: "var(--th-card)", color: "var(--th-text)" }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "dossier-hash-error" : undefined}
        />
        <Button type="submit" icon="shield">Verificar</Button>
      </form>
      <div className="mt-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold" style={{ color: "#2e7ba8" }}>
          <Icon name="document" size={16} />
          {hashing ? "Calculando…" : "Ou selecione o arquivo PDF"}
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => void fromFile(e.target.files?.[0])} />
        </label>
        <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>O arquivo não é enviado: o SHA-256 é calculado no seu aparelho.</p>
      </div>
      {error && <p id="dossier-hash-error" role="alert" className="mt-2 text-sm" style={{ color: "#e53935" }}>{error}</p>}
    </section>
  );
}
