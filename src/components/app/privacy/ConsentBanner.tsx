"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { CONSENT_DOCUMENTS, PRIVACY_PATH, type ConsentDocument } from "@/lib/app/privacy";
import { Icon } from "../Icon";

/**
 * Aceite de versão nova dos documentos (T24, LGPD art. 8º, §6º): quando a
 * versão vigente dos Termos ou da Política muda, a conta tem um aceite
 * pendente e o portal pede o consentimento outra vez, gravando a versão nova
 * na trilha — o aceite antigo continua lá.
 *
 * Não bloqueia a navegação: o aviso fica no topo até o aceite.
 */
export function ConsentBanner({ className = "" }: { className?: string }) {
  const { user, status } = useAuth();
  const [pending, setPending] = useState<ConsentDocument[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user) {
      setPending(null);
      return () => { active = false; };
    }
    api.myConsents()
      .then((body) => { if (active) setPending(body.pending ?? []); })
      .catch(() => { if (active) setPending(null); });
    return () => { active = false; };
  }, [status, user]);

  if (!pending?.length) return null;

  async function accept() {
    setSaving(true);
    setError(null);
    try {
      const body = await api.acceptConsents(pending!.map((d) => d.key), "nova_versao");
      setPending(body.pending ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar o aceite.");
    } finally {
      setSaving(false);
    }
  }

  const nomes = pending.map((doc) => {
    const atual = CONSENT_DOCUMENTS.find((d) => d.key === doc.key) ?? doc;
    return `${atual.label} (versão ${atual.version}, de ${atual.date})`;
  });

  return (
    <div
      role="region"
      aria-label="Aceite de versão nova dos documentos"
      className={`rounded-xl border p-3 ${className}`}
      style={{ borderColor: "rgba(46,123,168,0.35)", background: "rgba(46,123,168,0.08)" }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" style={{ color: "#2e7ba8" }}>
          <Icon name="info" size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold" style={{ color: "var(--th-text)" }}>
            {pending.length > 1 ? "Documentos atualizados" : "Documento atualizado"}
          </p>
          <p className="mt-1" style={{ color: "var(--th-muted)" }}>
            Atualizamos {nomes.join(" e ")}. Leia e confirme o aceite: a versão e a data ficam registradas na sua conta.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {pending.map((doc) => (
              <Link
                key={doc.key}
                href={(CONSENT_DOCUMENTS.find((d) => d.key === doc.key) ?? doc).path}
                target="_blank"
                className="text-xs font-semibold underline"
                style={{ color: "#2e7ba8" }}
              >
                Ler {doc.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={accept}
              disabled={saving}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: "#2e7ba8" }}
            >
              {saving ? "Registrando…" : "Aceitar"}
            </button>
            <Link href={PRIVACY_PATH} className="text-xs font-semibold" style={{ color: "var(--th-muted)" }}>
              Ver meus consentimentos
            </Link>
          </div>
          {error && <p className="mt-2 text-xs" style={{ color: "#e53935" }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
