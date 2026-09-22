"use client";

// Compartilhar demanda ou publicação (T21; slide 22 da Apresentação:
// "Compartilhamentos" é uma das formas de engajamento).
//
// Ordem: Web Share API quando o navegador oferece; senão, copiar o link pela
// área de transferência; sem as duas, o link fica visível para copiar à mão.
// O registro (`POST /api/posts/shares`) só acontece com sessão iniciada — não
// há contagem anônima nem por IP —, é append-only e vale uma vez por dia por
// conteúdo, então a contagem não infla.

import { useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import type { ShareChannel, ShareTargetKind } from "@/lib/app/ranking";
import { Icon } from "./Icon";

type Props = {
  targetKind: ShareTargetKind;
  targetId: string;
  /** Caminho público do conteúdo (ex.: `/demandas/<id>`). */
  path: string;
  title: string;
  text?: string;
  sharesCount?: number;
  className?: string;
};

function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

export function ShareButton({
  targetKind, targetId, path, title, text, sharesCount = 0, className,
}: Props) {
  const { user } = useAuth();
  const [count, setCount] = useState(sharesCount);
  const [state, setState] = useState<"idle" | "copiado" | "compartilhado" | "erro">("idle");
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function register(channel: ShareChannel) {
    if (!user) return;
    try {
      const result = await api.registerShare(targetKind, targetId, channel);
      setCount(result.sharesCount);
    } catch {
      // O compartilhamento já aconteceu no navegador; o registro é secundário.
    }
  }

  async function share() {
    if (busy) return;
    setBusy(true);
    setState("idle");
    const url = absoluteUrl(path);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, text: text ?? title, url });
        setState("compartilhado");
        await register("web_share");
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setState("copiado");
        await register("copiar_link");
        return;
      }
      setManualUrl(url);
      setState("idle");
      await register("outro");
    } catch (err) {
      // Cancelar a folha de compartilhamento não é erro.
      if ((err as { name?: string })?.name === "AbortError") setState("idle");
      else { setManualUrl(url); setState("erro"); }
    } finally {
      setBusy(false);
    }
  }

  const label = state === "copiado" ? "Link copiado"
    : state === "compartilhado" ? "Compartilhado"
      : "Compartilhar";

  return (
    <span className={className}>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
        style={{ background: "var(--th-surface-2, rgba(32,83,117,0.08))", color: "var(--th-text)" }}
        aria-label={`Compartilhar: ${title}`}
      >
        <Icon name="share" size={14} aria-hidden />
        {label}
        {count > 0 && (
          <span className="font-numeric" style={{ color: "var(--th-muted)" }}>· {count.toLocaleString("pt-BR")}</span>
        )}
      </button>
      {manualUrl && (
        <span className="mt-1 block text-[11px] break-all" style={{ color: "var(--th-muted)" }}>
          Copie o link: {manualUrl}
        </span>
      )}
      {!user && state !== "idle" && (
        <span className="mt-1 block text-[11px]" style={{ color: "var(--th-muted)" }}>
          Entre na sua conta para que o compartilhamento conte nos rankings.
        </span>
      )}
    </span>
  );
}
