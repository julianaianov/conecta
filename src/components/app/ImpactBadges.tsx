"use client";

// Selos de impacto social no perfil (T21; Apresentação Institucional, slide 22:
// "Gamificação · Selos de impacto social").
//
// Cada selo é concedido por regra objetiva sobre registro persistido e
// verificável — apoio confirmado pelo Agente, demanda concluída, prestação de
// contas concluída, voluntariado com conexão aceita, par de evidências
// antes/depois, compartilhamentos. Nada é atribuído à mão, nada é fictício: a
// regra fica visível junto do selo, com a data do registro que o conquistou.
//
// Para o Poder Público e os políticos não há selo nem ponto (slide 13): o
// perfil mostra os indicadores de atuação e o aviso de neutralidade.

import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { formatDate } from "@/lib/app/format";
import type { ProfileImpact } from "@/lib/app/ranking";
import { Icon } from "./Icon";

export function ImpactBadges({
  userId, initial = null, own = false,
}: { userId: string; initial?: ProfileImpact | null; own?: boolean }) {
  const [impact, setImpact] = useState<ProfileImpact | null>(initial);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [consentNotice, setConsentNotice] = useState<string>("");

  useEffect(() => {
    let alive = true;
    if (!initial) {
      api.profileImpact(userId).then((next) => { if (alive) setImpact(next); }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [userId, initial]);

  useEffect(() => {
    let alive = true;
    if (!own) return () => { alive = false; };
    api.rankingConsent()
      .then((next) => { if (alive) { setConsent(next.consent); setConsentNotice(next.notice); } })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [own]);

  async function toggleConsent(next: boolean) {
    setSaving(true);
    try {
      const saved = await api.setRankingConsent(next);
      setConsent(saved.consent);
    } catch {
      // Sem alteração: o estado atual continua valendo.
    } finally {
      setSaving(false);
    }
  }

  if (!impact) return null;

  return (
    <section className="app-card space-y-3 rounded-2xl p-4" aria-label="Impacto registrado">
      <h2 className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
        <Icon name="shield" size={16} style={{ color: "#f4841a" }} aria-hidden />
        {impact.ranked ? "Selos de impacto social" : "Indicadores de atuação institucional"}
      </h2>

      {impact.ranked ? (
        impact.badges.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--th-muted)" }}>
            Ainda não há selo conquistado. Cada selo depende de um registro confirmado na plataforma.
          </p>
        ) : (
          <ul className="space-y-2">
            {impact.badges.map((badge) => (
              <li key={badge.id} className="rounded-xl p-3" style={{ background: "rgba(244,132,26,0.08)" }}>
                <p className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
                  <Icon name="star" size={14} style={{ color: "#f4841a" }} aria-hidden />
                  {badge.label}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--th-muted)" }}>{badge.rule}</p>
                <p className="mt-0.5 text-[11px] font-numeric" style={{ color: "var(--th-muted)" }}>
                  {badge.awardedAt ? `Conquistado em ${formatDate(badge.awardedAt)}` : "Conquistado"}
                  {badge.evidenceCount > 0 && ` · ${badge.evidenceCount} registro(s)`}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2">
            {impact.indicators.map((indicator) => (
              <li key={indicator.id} className="rounded-xl p-3" style={{ background: "var(--th-card-alt)" }}>
                <p className="text-lg font-bold font-numeric" style={{ color: "var(--th-text)" }}>
                  {indicator.value.toLocaleString("pt-BR")}
                </p>
                <p className="text-[11px]" style={{ color: "var(--th-muted)" }}>{indicator.label}</p>
              </li>
            ))}
          </ul>
          {impact.notice && <p className="text-[11px]" style={{ color: "var(--th-muted)" }}>{impact.notice}</p>}
        </>
      )}

      {own && impact.ranked && consent !== null && (
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <label className="flex items-start gap-2 text-xs" style={{ color: "var(--th-text)" }}>
            <input
              type="checkbox"
              checked={consent}
              disabled={saving}
              onChange={(event) => toggleConsent(event.target.checked)}
            />
            <span>Aparecer com meu nome nos rankings públicos</span>
          </label>
          {consentNotice && <p className="mt-1 text-[11px]" style={{ color: "var(--th-muted)" }}>{consentNotice}</p>}
        </div>
      )}
    </section>
  );
}
