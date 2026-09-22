"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import type { Community, ConnectionStatus, Connection } from "@/lib/app/types";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { ConnectionCard } from "../ConnectionCard";
import { EmptyState } from "../ui";
import { Icon } from "../Icon";

type TabKey = "recebidas" | "enviadas" | "ativas" | "historico" | "frentes";

export function ConnectionsClient({ initialCommunities }: { initialCommunities: Community[] }) {
  const { user } = useAuth();
  const [communities, setCommunities] = useState(initialCommunities);

  useEffect(() => {
    let alive = true;
    api.communities().then((next) => { if (alive) setCommunities(next); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  if (user) return <PrivateConnections userId={user.id} userName={user.name} initialCommunities={communities} />;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header><p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#f4841a" }}>Colaboração local</p><h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--th-text)" }}>Conexões e frentes de atuação</h1><p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--th-muted)" }}>Conheça as iniciativas públicas e encontre caminhos para colaborar com quem atua no território.</p></header>
      <section aria-label="Frentes de atuação" className="grid gap-3 sm:grid-cols-2">{communities.length === 0 ? <div className="app-card rounded-2xl p-6 sm:col-span-2"><h2 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>Nenhuma frente publicada ainda</h2><p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Novas iniciativas aparecerão aqui quando houver dados públicos disponíveis.</p></div> : communities.map((community) => <Link key={community.id} href="/conexoes" className="app-card flex gap-3 rounded-2xl p-4 hover:shadow-md"><Avatar name={community.name} src={community.imageUrl} id={community.id} size={48} /><span className="min-w-0"><strong className="block text-sm" style={{ color: "var(--th-text)" }}>{community.name}</strong><span className="mt-1 block text-xs" style={{ color: "var(--th-muted)" }}>{community.description || community.category}</span><span className="mt-2 block text-xs font-semibold" style={{ color: "#2e7ba8" }}>{community.memberCount.toLocaleString("pt-BR")} participantes</span></span></Link>)}</section>
      <p className="text-sm" style={{ color: "var(--th-muted)" }}>Para solicitar uma conexão ou registrar uma iniciativa, <Link href="/login?next=%2Fconexoes" className="font-semibold" style={{ color: "#f4841a" }}>entre na sua conta</Link>.</p>
    </div>
  );
}

function PrivateConnections({ userId, userName, initialCommunities }: { userId: string; userName: string; initialCommunities: Community[] }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [communities, setCommunities] = useState(initialCommunities);
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<TabKey>("recebidas");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [nextConnections, nextCommunities] = await Promise.all([api.connectionsFor(userId), api.communities()]);
    setConnections(nextConnections);
    setCommunities(nextCommunities);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let alive = true;
    Promise.all([api.connectionsFor(userId), api.communities()]).then(([nextConnections, nextCommunities]) => {
      if (!alive) return;
      setConnections(nextConnections);
      setCommunities(nextCommunities);
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId]);

  const groups = useMemo(() => ({
    recebidas: connections.filter((connection) => connection.to.userId === userId && connection.status === "pending"),
    enviadas: connections.filter((connection) => connection.from.userId === userId && connection.status === "pending"),
    ativas: connections.filter((connection) => connection.status === "accepted"),
    historico: connections.filter((connection) => connection.status === "done" || connection.status === "declined" || connection.status === "canceled"),
  }), [connections, userId]);

  const concluidas = groups.historico.filter((connection) => connection.status === "done").length;
  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "recebidas", label: "Recebidas", count: groups.recebidas.length },
    { key: "enviadas", label: "Enviadas", count: groups.enviadas.length },
    { key: "ativas", label: "Ativas", count: groups.ativas.length },
    { key: "historico", label: "Histórico", count: groups.historico.length },
    { key: "frentes", label: "Frentes", count: communities.length },
  ];

  async function respond(id: string, status: ConnectionStatus) {
    setBusy(true);
    try {
      await api.updateConnection(id, status);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="brand-gradient overflow-hidden rounded-2xl p-5 text-white sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><Icon name="link" size={18} style={{ color: "#f4841a" }} /><p className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.7)" }}>Acompanhamento</p></div>
            <h1 className="mt-2 text-2xl font-bold">Conexões que viram próximos passos</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>Solicite apoio, parceria, recursos ou divulgação e acompanhe cada encaminhamento.</p>
          </div>
          <Button href="/conexoes/nova" icon="plus" className="w-full sm:w-auto">Solicitar conexão</Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
          <HeaderStat label="aguardando você" value={groups.recebidas.length} accent />
          <HeaderStat label="ativas" value={groups.ativas.length} />
          <HeaderStat label="concluídas" value={concluidas} />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Etapas das conexões">
        {tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className="app-chip shrink-0" data-active={tab === item.key} onClick={() => setTab(item.key)}>{item.label}<span className="ml-1 font-numeric font-bold">{item.count}</span></button>)}
      </div>

      {loading ? <div className="flex justify-center py-16"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div> : tab === "frentes" ? <PrivateCommunities communities={communities} joined={joined} onToggle={(id) => setJoined((current) => ({ ...current, [id]: !current[id] }))} /> : groups[tab].length === 0 ? <EmptyState icon="link" title={EMPTY[tab].title} hint={EMPTY[tab].hint} /> : <div className="space-y-3">{groups[tab].map((connection) => <ConnectionCard key={connection.id} connection={connection} meId={userId} onRespond={respond} busy={busy} />)}</div>}

      {tab !== "frentes" && <p className="text-center text-xs" style={{ color: "var(--th-muted)" }}>Cada conexão guarda o pedido, o encaminhamento e o resultado — <Link href="/conexoes/nova" className="font-semibold" style={{ color: "#f4841a" }}>comece uma agora</Link>.</p>}
      <span className="sr-only">Área de {userName}</span>
    </div>
  );
}

function PrivateCommunities({ communities, joined, onToggle }: { communities: Community[]; joined: Record<string, boolean>; onToggle: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {communities.map((community) => {
        const isJoined = joined[community.id];
        return (
          <div key={community.id} className="app-card overflow-hidden rounded-2xl">
            <div className="relative h-28">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={community.imageUrl ?? ""} alt={community.name} className="h-full w-full object-cover" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(13,45,66,0.65), transparent 60%)" }} />
              <span className="absolute bottom-2 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: "#f4841a" }}>{community.category}</span>
            </div>
            <div className="p-4">
              <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>{community.name}</h2>
              <p className="mt-1 text-sm clamp-2" style={{ color: "var(--th-muted)" }}>{community.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--th-muted)" }}><Icon name="users" size={14} /> {community.memberCount.toLocaleString("pt-BR")} participantes</span>
                <button type="button" onClick={() => onToggle(community.id)} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all" style={isJoined ? { border: "1px solid var(--th-border)", color: "var(--th-text)" } : { background: "linear-gradient(135deg,#f4841a,#f89b45)", color: "#fff" }}>{isJoined ? <><Icon name="check" size={15} /> Acompanhando</> : "Acompanhar"}</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const EMPTY: Record<Exclude<TabKey, "frentes">, { title: string; hint: string }> = {
  recebidas: { title: "Nenhum pedido esperando você", hint: "Quando alguém solicitar apoio ou parceria, aparece aqui." },
  enviadas: { title: "Você não tem pedidos em aberto", hint: "Solicite uma conexão para uma empresa, ONG, coletivo ou órgão público." },
  ativas: { title: "Nenhuma conexão ativa", hint: "Conexões aceitas ficam aqui até o resultado ser registrado." },
  historico: { title: "Ainda sem histórico", hint: "Conexões concluídas, recusadas ou canceladas ficam guardadas aqui." },
};

function HeaderStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.12)" }}><p className="font-numeric text-xl font-bold" style={{ color: accent ? "#f4841a" : "#fff" }}>{value}</p><p className="text-[11px]" style={{ color: "rgba(255,255,255,0.75)" }}>{label}</p></div>;
}
