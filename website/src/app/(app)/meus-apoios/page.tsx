"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatCurrency, formatDate } from "@/lib/app/format";
import { PAYMENT_METHODS, SUPPORT_TYPE_META, type SupportRecord, type SupportType } from "@/lib/app/types";
import { Icon, type IconName } from "@/components/app/Icon";
import { Card, EmptyState } from "@/components/app/ui";

const FILTERS: { value: SupportType | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "financial", label: "Financeiro" },
  { value: "materials", label: "Materiais" },
  { value: "labor", label: "Mão de obra" },
  { value: "volunteering", label: "Voluntariado" },
];

export default function MySupportsPage() {
  const { user } = useAuth();
  const [supports, setSupports] = useState<SupportRecord[]>([]);
  const [filter, setFilter] = useState<SupportType | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.mySupports(user.id).then((s) => { setSupports(s); setLoading(false); });
  }, [user]);

  const totalFinancial = useMemo(() => supports.filter((s) => s.type === "financial").reduce((sum, s) => sum + (s.amount ?? 0), 0), [supports]);
  const visible = useMemo(() => (filter === "all" ? supports : supports.filter((s) => s.type === filter)), [supports, filter]);

  return (
    <div className="mx-auto max-w-2xl">
      {/* header card */}
      <div className="brand-gradient overflow-hidden rounded-2xl p-5 text-white sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.7)" }}>Painel do apoiador</p>
        <div className="mt-3 flex gap-6">
          <div>
            <p className="text-3xl font-bold font-numeric">{supports.length}</p>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>apoios realizados</p>
          </div>
          <div>
            <p className="text-3xl font-bold font-numeric" style={{ color: "#f4841a" }}>{formatCurrency(totalFinancial)}</p>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>doados</p>
          </div>
        </div>
      </div>

      {/* filtros */}
      <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {FILTERS.map((f) => (
          <button key={f.value} className="app-chip shrink-0" data-active={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>
        ))}
      </div>

      {/* lista */}
      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><span className="app-spinner" style={{ width: 28, height: 28 }} /></div>
        ) : visible.length === 0 ? (
          <EmptyState icon="heart" title="Você ainda não apoiou nada" hint="Explore o feed e apoie uma causa do seu bairro." />
        ) : (
          visible.map((s) => <SupportTile key={s.id} s={s} />)
        )}
      </div>
    </div>
  );
}

function SupportTile({ s }: { s: SupportRecord }) {
  const meta = SUPPORT_TYPE_META[s.type];
  const detailKeys = Object.entries(s.details ?? {}).filter(([, v]) => v).slice(0, 3);
  return (
    <Link href={`/post/${s.postId}`} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}>
            <Icon name={meta.icon as IconName} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{meta.label}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(46,158,91,0.14)", color: "#2e9e5b" }}>{s.status === "confirmed" ? "Confirmado" : s.status}</span>
            </div>
            <p className="truncate text-sm" style={{ color: "var(--th-muted)" }}>{s.postTitle}</p>

            {s.type === "financial" && (
              <p className="mt-1 text-sm font-numeric" style={{ color: "var(--th-text)" }}>
                {formatCurrency(s.amount ?? 0)} · {PAYMENT_METHODS.find((m) => m.method === s.paymentMethod)?.label ?? "—"}
              </p>
            )}
            {detailKeys.length > 0 && (
              <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>{detailKeys.map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
            )}
            {s.message && <p className="mt-1 text-xs italic" style={{ color: "var(--th-muted)" }}>“{s.message}”</p>}

            <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--th-muted)" }}>
              {s.neighborhood && <><Icon name="location" size={12} /><span>{s.neighborhood}</span><span>·</span></>}
              <span>{formatDate(s.createdAt)}</span>
              <span className="ml-auto inline-flex items-center gap-1 font-semibold" style={{ color: "#f4841a" }}>Ver publicação <Icon name="chevronRight" size={13} /></span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
