"use client";

/**
 * Conexões — o fluxo que liga quem precisa a quem pode transformar.
 *
 * A aba padrão é o que exige ação do usuário (pedidos recebidos). Grupos, que
 * antes ocupavam esta rota sozinhos, viraram a última aba: continuam sendo
 * conexão, mas de muitos para muitos.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import type { Community, Connection, ConnectionStatus } from "@/lib/app/types";
import { Icon } from "@/components/app/Icon";
import { Button } from "@/components/app/Button";
import { ConnectionCard } from "@/components/app/ConnectionCard";
import { EmptyState } from "@/components/app/ui";

type TabKey = "recebidas" | "enviadas" | "ativas" | "historico" | "grupos";

export default function ConnectionsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<TabKey>("recebidas");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user) return;
    api.connectionsFor(user.id).then(setConnections);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([api.connectionsFor(user.id), api.communities()]).then(([c, g]) => {
      if (!alive) return;
      setConnections(c);
      setCommunities(g);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user]);

  const groups = useMemo(() => {
    const me = user?.id ?? "";
    return {
      recebidas: connections.filter((c) => c.to.userId === me && c.status === "pending"),
      enviadas: connections.filter((c) => c.from.userId === me && c.status === "pending"),
      ativas: connections.filter((c) => c.status === "accepted"),
      historico: connections.filter((c) => c.status === "done" || c.status === "declined" || c.status === "canceled"),
    };
  }, [connections, user]);

  const concluidas = groups.historico.filter((c) => c.status === "done").length;

  async function respond(id: string, status: ConnectionStatus) {
    setBusy(true);
    try {
      await api.updateConnection(id, status);
      load();
    } finally { setBusy(false); }
  }

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "recebidas", label: "Recebidas", count: groups.recebidas.length },
    { key: "enviadas", label: "Enviadas", count: groups.enviadas.length },
    { key: "ativas", label: "Ativas", count: groups.ativas.length },
    { key: "historico", label: "Histórico", count: groups.historico.length },
    { key: "grupos", label: "Grupos", count: communities.length },
  ];

  if (loading) {
    return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* cabeçalho */}
      <div className="brand-gradient overflow-hidden rounded-2xl p-5 text-white sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon name="link" size={18} style={{ color: "#f4841a" }} />
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.7)" }}>Conexões</p>
            </div>
            <h1 className="mt-2 text-2xl font-bold">A ponte entre quem precisa e quem pode transformar</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
              Peça apoio, patrocínio, parceria, reunião, recursos ou divulgação — e acompanhe até virar resultado.
            </p>
          </div>
          <Button href="/conexoes/nova" icon="plus" className="w-full sm:w-auto">Solicitar conexão</Button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
          <HeaderStat label="aguardando você" value={groups.recebidas.length} accent />
          <HeaderStat label="ativas" value={groups.ativas.length} />
          <HeaderStat label="concluídas" value={concluidas} />
        </div>
      </div>

      {/* abas */}
      <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Tipos de conexão">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className="app-chip shrink-0"
            data-active={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="ml-1 font-numeric font-bold">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "grupos" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {communities.map((c) => {
              const isJoined = joined[c.id];
              return (
                <div key={c.id} className="app-card overflow-hidden rounded-2xl" style={{ boxShadow: "0 4px 16px rgba(13,45,66,0.05)" }}>
                  <div className="relative h-28">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.imageUrl ?? ""} alt={c.name} className="h-full w-full object-cover" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(13,45,66,0.65), transparent 60%)" }} />
                    <span className="absolute bottom-2 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: "#f4841a" }}>{c.category}</span>
                  </div>
                  <div className="p-4">
                    <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>{c.name}</h2>
                    <p className="mt-1 text-sm clamp-2" style={{ color: "var(--th-muted)" }}>{c.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--th-muted)" }}>
                        <Icon name="users" size={14} /> <span className="font-numeric">{c.memberCount.toLocaleString("pt-BR")}</span> membros
                      </span>
                      <button
                        onClick={() => setJoined((j) => ({ ...j, [c.id]: !j[c.id] }))}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all"
                        style={isJoined
                          ? { border: "1px solid var(--th-border)", color: "var(--th-text)" }
                          : { background: "linear-gradient(135deg,#f4841a,#f89b45)", color: "#fff" }}
                      >
                        {isJoined ? <><Icon name="check" size={15} /> Participando</> : "Participar"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : groups[tab].length === 0 ? (
          <EmptyState
            icon="link"
            title={EMPTY[tab].title}
            hint={EMPTY[tab].hint}
          />
        ) : (
          <div className="space-y-3">
            {groups[tab].map((c) => (
              <ConnectionCard key={c.id} connection={c} meId={user?.id ?? ""} onRespond={respond} busy={busy} />
            ))}
          </div>
        )}
      </div>

      {tab !== "grupos" && (
        <p className="mt-6 text-center text-xs" style={{ color: "var(--th-muted)" }}>
          Toda conexão guarda o histórico do que foi pedido, aceito e entregue —{" "}
          <Link href="/conexoes/nova" className="font-semibold" style={{ color: "#f4841a" }}>comece uma agora</Link>.
        </p>
      )}
    </div>
  );
}

const EMPTY: Record<Exclude<TabKey, "grupos">, { title: string; hint: string }> = {
  recebidas: { title: "Nenhum pedido esperando você", hint: "Quando alguém solicitar apoio, patrocínio ou parceria, aparece aqui." },
  enviadas: { title: "Você não tem pedidos em aberto", hint: "Solicite uma conexão para uma empresa, ONG, coletivo ou órgão público." },
  ativas: { title: "Nenhuma conexão ativa", hint: "Conexões aceitas ficam aqui até o resultado ser registrado." },
  historico: { title: "Ainda sem histórico", hint: "Conexões concluídas, recusadas ou canceladas ficam guardadas aqui." },
};

function HeaderStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.12)" }}>
      <p className="font-numeric text-xl font-bold" style={{ color: accent ? "#f4841a" : "#fff" }}>{value}</p>
      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.75)" }}>{label}</p>
    </div>
  );
}
