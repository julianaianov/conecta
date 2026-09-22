"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { demandPublicPath } from "@/lib/app/demand";
import { formatDate } from "@/lib/app/format";
import {
  RECEIPT_STATUS_COLORS,
  RECEIPT_STATUS_LABELS,
  SUPPORT_MODALITY_ICONS,
  SUPPORT_MODALITY_LABELS,
  SUPPORT_TYPE_LABELS,
  formatCents,
} from "@/lib/app/support";
import { DEMAND_STATUS_LABELS, type MySupportItem } from "@/lib/app/types";
import { Icon, type IconName } from "../Icon";
import { Card } from "../ui";

/**
 * "Meus apoios" (T16): os apoios registrados em demandas, com o andamento da
 * demanda apoiada ("acompanhar resultados", slide 10). Os apoios antigos do
 * feed continuam na lista abaixo, na mesma página.
 */
export function MyDemandSupports() {
  const [supports, setSupports] = useState<MySupportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.mySupportedDemands()
      .then(setSupports)
      .catch(() => setSupports([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || supports.length === 0) return null;

  const confirmed = supports.filter((s) => s.receiptStatus === "confirmado").length;
  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>Apoios registrados em demandas</h2>
        <p className="text-xs" style={{ color: "var(--th-muted)" }}>{confirmed} de {supports.length} confirmados pelo Agente</p>
      </div>
      <ul className="mt-3 space-y-3">
        {supports.map((support) => {
          const amount = formatCents(support.amountCents);
          const place = [support.demand.territory, [support.demand.municipality, support.demand.uf].filter(Boolean).join("/")]
            .filter(Boolean).join(" · ");
          return (
            <li key={support.id}>
              <Link href={demandPublicPath(support.demand.id)} className="block">
                <Card className="transition-shadow hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}>
                      <Icon name={SUPPORT_MODALITY_ICONS[support.modality] as IconName} size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{SUPPORT_MODALITY_LABELS[support.modality]}</span>
                        <span className="text-[11px] font-semibold"
                          style={{ color: support.canceledAt ? "var(--th-muted)" : RECEIPT_STATUS_COLORS[support.receiptStatus] }}>
                          {support.canceledAt ? "Cancelado" : RECEIPT_STATUS_LABELS[support.receiptStatus]}
                        </span>
                      </div>
                      <p className="truncate text-sm" style={{ color: "var(--th-muted)" }}>{support.demand.title}</p>
                      <p className="mt-1 text-xs" style={{ color: "var(--th-text)" }}>{support.description}</p>
                      <p className="mt-1 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                        {SUPPORT_TYPE_LABELS[support.supportType]}{amount ? ` · ${amount} declarados` : ""} · {formatDate(support.occurredOn ?? support.createdAt)}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
                        Andamento da demanda: <strong style={{ color: "var(--th-text)" }}>{DEMAND_STATUS_LABELS[support.demand.status]}</strong>
                        {place ? ` · ${place}` : ""}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
