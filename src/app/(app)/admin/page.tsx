"use client";

/**
 * Painel administrativo — visão da operação do DM Conecta.
 *
 * Responde, em ordem: quantas contas existem e de que tipo, quanto se publica,
 * quantas operações de apoio acontecem (e quanto dinheiro passa por elas),
 * quais bairros a plataforma atende e onde o fluxo trava. Tudo é derivado da
 * base — ver `lib/app/admin.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { isPlatformAdmin, DEMO_ADMIN_EMAIL } from "@/lib/app/admin-access";
import { buildAdminMetrics, neighborhoodsCsv, PERIODS, type AdminMetrics, type PeriodKey } from "@/lib/app/admin";
import type { AdminSnapshot } from "@/lib/app/demo";
import { ROLE_LABELS, normalizeRole } from "@/lib/app/types";
import { timeAgo } from "@/lib/app/format";
import { Icon, type IconName } from "@/components/app/Icon";
import { Avatar } from "@/components/app/Avatar";
import { Card, EmptyState, SectionTitle, StatusBadge, TypeBadge } from "@/components/app/ui";
import {
  BarList, Funnel, StackedBar, StatTile, Td, Th, TimeSeries, brl, int, pctLabel,
} from "@/components/app/admin/charts";

export default function AdminPage() {
  const { user, demoMode } = useAuth();
  const [snap, setSnap] = useState<AdminSnapshot | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [loading, setLoading] = useState(true);

  const allowed = isPlatformAdmin(user);

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    let alive = true;
    api.adminSnapshot().then((s) => { if (alive) { setSnap(s); setLoading(false); } });
    return () => { alive = false; };
  }, [allowed]);

  const m: AdminMetrics | null = useMemo(
    () => (snap ? buildAdminMetrics(snap, period) : null),
    [snap, period],
  );

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <EmptyState
          icon="shield"
          title="Área restrita à operação do DM Conecta"
          hint={`Esta conta não tem acesso ao painel. Entre com uma conta de administração — na demo, ${DEMO_ADMIN_EMAIL} / demo123.`}
        />
        <div className="mt-4 text-center">
          <Link href="/feed" className="text-sm font-semibold" style={{ color: "#f4841a" }}>Voltar ao feed</Link>
        </div>
      </div>
    );
  }

  if (loading || !m) {
    return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  }

  function exportCsv() {
    if (!m) return;
    const blob = new Blob([`﻿${neighborhoodsCsv(m.coverage.neighborhoods)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dmconecta-bairros-${m.period.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const semGeo = m.content.postsInPeriod - m.content.geolocated;
  const semMidia = m.content.postsInPeriod - m.content.withMedia;

  // São 18 subperfis possíveis — a lista inteira vira ruído. Mostra os maiores e
  // diz em voz alta quantos ficaram de fora (nada de corte silencioso).
  const TOP_PROFILES = 8;
  const perfisVisiveis = m.users.byProfile.slice(0, TOP_PROFILES);
  const perfisRestantes = m.users.byProfile.slice(TOP_PROFILES);
  const contasRestantes = perfisRestantes.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="viz-root space-y-6">
      {/* ── Cabeçalho ─────────────────────────────────────── */}
      <div className="brand-gradient overflow-hidden rounded-2xl p-5 text-white sm:p-6">
        {/* no celular o botão desce: senão o título fica espremido em 4 linhas */}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon name="shield" size={18} style={{ color: "#f4841a" }} />
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.7)" }}>
                Painel da operação
              </p>
            </div>
            <h1 className="mt-2 text-2xl font-bold">DM Conecta em números</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
              {m.period.label} · {int(m.users.total)} contas · {int(m.coverage.served)} bairros com publicação
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold sm:w-auto"
            style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}
          >
            <Icon name="inventory" size={16} /> Exportar bairros (CSV)
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className="rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors"
              style={
                period === p.key
                  ? { background: "#f4841a", color: "#fff" }
                  : { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }
              }
            >
              {p.label}
            </button>
          ))}
          <span
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}
          >
            <Icon name="info" size={12} />
            {demoMode || !api.hasApi ? "Fonte: base demo" : "Fonte: API"}
          </span>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          icon="users"
          label="Contas"
          value={int(m.users.total)}
          hint={m.period.days ? `${int(m.users.newInPeriod)} novas em ${m.period.days} dias` : `${int(m.users.activeInPeriod)} ativas`}
        />
        <StatTile icon="megaphone" label="Publicações" value={int(m.content.postsInPeriod)} hint={`${int(m.content.posts)} no total`} />
        <StatTile icon="volunteer" label="Operações de apoio" value={int(m.operations.inPeriod)} hint={`${int(m.operations.nonFinancial)} não financeiras`} accent />
        <StatTile icon="payments" label="Movimentação" value={brl(m.operations.amount)} hint={`ticket médio ${brl(m.operations.avgTicket)}`} accent />
        <StatTile icon="location" label="Bairros atendidos" value={int(m.coverage.served)} hint={`${int(m.coverage.withOperations)} já com apoio`} />
        <StatTile icon="check" label="Taxa de resolução" value={pctLabel(m.content.resolutionRate)} hint={`${int(m.content.resolved)} demandas resolvidas`} />
      </div>

      {/* ── Fluxo + série ─────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon="filter">Fluxo da plataforma</SectionTitle>
          <p className="-mt-1 mb-3 text-xs" style={{ color: "var(--th-muted)" }}>
            Da publicação ao impacto registrado — onde a rede perde gente pelo caminho.
          </p>
          <Funnel stages={m.funnel} />
        </Card>

        <Card>
          <SectionTitle icon="clock">Atividade ao longo do tempo</SectionTitle>
          <TimeSeries points={m.series} />
        </Card>
      </div>

      {/* ── Bairros ───────────────────────────────────────── */}
      <Card padded={false}>
        <div className="px-4 pt-4 sm:px-5 sm:pt-5">
          <SectionTitle icon="map" action={
            <span className="text-xs" style={{ color: "var(--th-muted)" }}>
              {int(m.coverage.neighborhoods.length)} bairros · {m.coverage.cities.join(", ")}
            </span>
          }>
            Bairros atendidos
          </SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead style={{ background: "var(--th-card-alt)" }}>
              <tr>
                <Th>Bairro</Th>
                <Th align="right">Publicações</Th>
                <Th align="right">Resolvidas</Th>
                <Th align="right">Apoios</Th>
                <Th align="right">Movimentação</Th>
                <Th align="right">Contas</Th>
                <Th>Participação</Th>
              </tr>
            </thead>
            <tbody>
              {m.coverage.neighborhoods.map((n) => (
                <tr key={n.name} className="border-t transition-colors hover:bg-[var(--th-card-alt)]" style={{ borderColor: "var(--th-border)" }}>
                  <Td strong>{n.name}</Td>
                  <Td align="right" strong>{int(n.posts)}</Td>
                  <Td align="right">{int(n.resolved)}</Td>
                  <Td align="right">{int(n.supports)}</Td>
                  <Td align="right">{n.amount > 0 ? brl(n.amount) : "—"}</Td>
                  <Td align="right">{int(n.users)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full" style={{ background: "var(--viz-track)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(2, n.share * 100)}%`, background: "var(--viz-o4)" }} />
                      </div>
                      <span className="font-numeric text-xs tabular-nums" style={{ color: "var(--th-muted)" }}>{pctLabel(n.share)}</span>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Usuários ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon="users" action={
            <span className="text-xs" style={{ color: "var(--th-muted)" }}>{int(m.users.activeInPeriod)} ativas no período</span>
          }>
            Contas por categoria
          </SectionTitle>
          <BarList items={m.users.byRole.map((s) => ({ key: s.key, label: s.label, value: s.value, hint: s.hint }))} />
        </Card>

        <Card>
          <SectionTitle icon="person">Contas por subperfil</SectionTitle>
          <BarList items={perfisVisiveis.map((s) => ({ key: s.key, label: s.label, value: s.value, hint: s.hint }))} />
          {perfisRestantes.length > 0 && (
            <p className="mt-3 text-xs" style={{ color: "var(--th-muted)" }}>
              + {int(perfisRestantes.length)} subperfis com {int(contasRestantes)} conta{contasRestantes > 1 ? "s" : ""}:{" "}
              {perfisRestantes.map((p) => p.label).join(", ")}.
            </p>
          )}
        </Card>
      </div>

      {/* ── Operações ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon="volunteer">Operações por tipo de apoio</SectionTitle>
          <BarList items={m.operations.byType.map((s) => ({ key: s.key, label: s.label, value: s.value, icon: s.hint as IconName }))} />
        </Card>

        <Card>
          <SectionTitle icon="payments">Financeiro</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Doações" value={int(m.operations.financialCount)} />
            <MiniStat label="Volume" value={brl(m.operations.amount)} />
            <MiniStat label="Ticket médio" value={brl(m.operations.avgTicket)} />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Por forma de pagamento</p>
            <BarList
              items={m.operations.byMethod.map((s) => ({ key: s.key, label: s.label, value: s.value, hint: s.hint }))}
              emptyHint="Nenhuma doação financeira no período."
            />
          </div>
        </Card>
      </div>

      {/* ── Conexões ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon="link" action={
            <Link href="/conexoes" className="text-xs font-semibold" style={{ color: "#f4841a" }}>Ver fluxo</Link>
          }>
            Conexões solicitadas
          </SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="No período" value={int(m.connections.inPeriod)} />
            <MiniStat label="Aguardando" value={int(m.connections.pending)} />
            <MiniStat label="Ativas" value={int(m.connections.accepted)} />
            <MiniStat label="Concluídas" value={int(m.connections.done)} />
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--th-muted)" }}>
            Taxa de aceite: <b style={{ color: "var(--th-text)" }}>{pctLabel(m.connections.acceptanceRate)}</b> das que já
            tiveram resposta ({int(m.connections.declined)} recusada{m.connections.declined === 1 ? "" : "s"}).
          </p>
        </Card>

        <Card>
          <SectionTitle icon="share">Conexões por tipo de pedido</SectionTitle>
          <BarList
            items={m.connections.byType.map((s) => ({ key: s.key, label: s.label, value: s.value, icon: s.hint as IconName }))}
            emptyHint="Nenhum pedido de conexão no período."
          />
        </Card>
      </div>

      {/* ── Conteúdo ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon="megaphone">Publicações por tipo</SectionTitle>
          <BarList items={m.content.byType.map((s) => ({ key: s.key, label: s.label, value: s.value }))} />
        </Card>

        <Card>
          <SectionTitle icon="check">Situação das demandas</SectionTitle>
          <StackedBar segments={m.content.byStatus.map((s) => ({ key: s.key, label: s.label, value: s.value }))} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MiniStat label="Geolocalizadas" value={`${int(m.content.geolocated)} / ${int(m.content.postsInPeriod)}`} />
            <MiniStat label="Com foto ou vídeo" value={`${int(m.content.withMedia)} / ${int(m.content.postsInPeriod)}`} />
          </div>
        </Card>
      </div>

      {/* ── Engajamento ───────────────────────────────────── */}
      <Card>
        <SectionTitle icon="heart">Engajamento na rede</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Curtidas" value={int(m.engagement.reactions)} />
          <MiniStat label="Comentários" value={int(m.engagement.comments)} />
          <MiniStat label="Visualizações" value={int(m.engagement.views)} />
          <MiniStat label="Recados" value={int(m.engagement.scraps)} />
          <MiniStat label="Depoimentos" value={int(m.engagement.testimonials)} />
          <MiniStat label="Grupos · membros" value={`${int(m.engagement.communities)} · ${int(m.engagement.members)}`} />
        </div>
      </Card>

      {/* ── Destaques ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card padded={false}>
          <div className="px-4 pt-4 sm:px-5 sm:pt-5">
            <SectionTitle icon="star">Publicações com mais tração</SectionTitle>
            <p className="-mt-1 mb-3 text-xs" style={{ color: "var(--th-muted)" }}>
              Tração = curtidas + 3× comentários + 5× apoios.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead style={{ background: "var(--th-card-alt)" }}>
                <tr><Th>Publicação</Th><Th align="right">Tração</Th><Th align="right">Apoios</Th><Th align="right">Valor</Th></tr>
              </thead>
              <tbody>
                {m.topPosts.map((p) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: "var(--th-border)" }}>
                    <Td>
                      <Link href={`/post/${p.id}`} className="block max-w-[280px]">
                        <span className="block truncate font-semibold" style={{ color: "var(--th-text)" }}>{p.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <TypeBadge type={p.type} size="sm" />
                          <StatusBadge status={p.status} />
                          <span className="text-xs" style={{ color: "var(--th-muted)" }}>{p.neighborhood}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td align="right" strong>{int(p.engagement)}</Td>
                    <Td align="right">{int(p.supports)}</Td>
                    <Td align="right">{p.amount > 0 ? brl(p.amount) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card padded={false}>
          <div className="px-4 pt-4 sm:px-5 sm:pt-5">
            <SectionTitle icon="trophy">Quem mais apoia</SectionTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead style={{ background: "var(--th-card-alt)" }}>
                <tr><Th>Conta</Th><Th align="right">Operações</Th><Th align="right">Valor</Th></tr>
              </thead>
              <tbody>
                {m.topSupporters.map((s) => (
                  <tr key={s.id} className="border-t" style={{ borderColor: "var(--th-border)" }}>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={s.name} id={s.id} size={30} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold" style={{ color: "var(--th-text)" }}>{s.name}</span>
                          <span className="text-xs" style={{ color: "var(--th-muted)" }}>
                            {ROLE_LABELS[normalizeRole(s.role)]} · {s.types} tipo{s.types > 1 ? "s" : ""} de apoio
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td align="right" strong>{int(s.operations)}</Td>
                    <Td align="right">{s.amount > 0 ? brl(s.amount) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ── Atividade + saúde ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <SectionTitle icon="bell" action={
            <span className="text-xs" style={{ color: "var(--th-muted)" }}>
              {int(m.engagement.activityVolume)} interações no período (publicações, apoios, comentários e curtidas)
            </span>
          }>
            Últimas movimentações
          </SectionTitle>
          <ul className="space-y-3">
            {m.recent.map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: a.kind === "support" ? "rgba(244,132,26,0.12)" : "rgba(46,123,168,0.12)",
                    color: a.kind === "support" ? "#f4841a" : "#2e7ba8",
                  }}
                >
                  <Icon name={a.icon as IconName} size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm" style={{ color: "var(--th-text)" }}>
                    <b>{a.actor}</b> <span style={{ color: "var(--th-muted)" }}>{a.text}</span>
                  </p>
                  <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                    {timeAgo(a.at)}
                    {a.neighborhood && <> · {a.neighborhood}</>}
                    {a.amount != null && a.amount > 0 && <> · <span className="font-numeric font-semibold">{brl(a.amount)}</span></>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle icon="info">Saúde da operação</SectionTitle>
          <ul className="space-y-3 text-sm">
            <HealthLine
              ok={semGeo === 0}
              label="Publicações no mapa"
              detail={semGeo === 0 ? "todas geolocalizadas" : `${int(semGeo)} sem coordenada — não aparecem no mapa`}
            />
            <HealthLine
              ok={semMidia === 0}
              label="Publicações com mídia"
              detail={semMidia === 0 ? "todas com foto ou vídeo" : `${int(semMidia)} sem foto ou vídeo`}
            />
            <HealthLine
              ok={m.coverage.withOperations === m.coverage.served}
              label="Bairros com apoio"
              detail={`${int(m.coverage.withOperations)} de ${int(m.coverage.served)} bairros publicados já receberam apoio`}
            />
            <HealthLine
              ok={false}
              label="Resultados de impacto"
              detail="ainda não são coletados: sem fotos antes/depois, metas ou pessoas impactadas"
            />
            <HealthLine
              ok={api.hasApi && !demoMode}
              label="Persistência"
              detail={
                api.hasApi && !demoMode
                  ? "conectado à API — publicações e apoios persistem"
                  : "base demo em memória — conexões, ranking e recados não persistem"
              }
            />
          </ul>
          <p className="mt-4 text-xs" style={{ color: "var(--th-muted)" }}>
            Toda métrica desta tela é contada a partir de publicações, apoios, comentários e contas — nenhum número é fixo.
          </p>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--th-card-alt)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{label}</p>
      <p className="mt-1 text-lg font-bold leading-tight" style={{ color: "var(--th-text)" }}>{value}</p>
    </div>
  );
}

function HealthLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: ok ? "rgba(46,158,91,0.16)" : "rgba(244,132,26,0.16)", color: ok ? "#2e9e5b" : "#f4841a" }}
      >
        <Icon name={ok ? "check" : "info"} size={12} strokeWidth={2.6} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold" style={{ color: "var(--th-text)" }}>{label}</span>
        <span className="block text-xs" style={{ color: "var(--th-muted)" }}>{detail}</span>
      </span>
    </li>
  );
}
