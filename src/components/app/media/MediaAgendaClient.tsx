"use client";

/**
 * Pautas da Comunicação (T28): "Identificar pautas", "Divulgar projetos e
 * resultados" e "Acompanhar informações públicas do território" (Arquitetura
 * de Perfis §3.5). Duas áreas: as pautas sugeridas pelos sinais do território
 * e as pautas que a conta identificou, com o estado da apuração e o registro
 * da divulgação publicada (veículo, endereço e data).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate, timeAgo } from "@/lib/app/format";
import {
  AGENDA_ANGLE_MAX, AGENDA_OUTLET_MAX, AGENDA_PATH, AGENDA_STATUSES, AGENDA_STATUS_COLORS, AGENDA_STATUS_LABELS,
  AGENDA_STATUS_TRANSITIONS, AGENDA_TARGET_LABELS, agendaErrorMessage, agendaTargetPath, canIdentifyAgenda,
  formatIsoDay, type AgendaStatus,
} from "@/lib/app/media";
import { ROLE_LABELS, type AgendaCandidate, type MediaAgendaItem } from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Card, EmptyState } from "../ui";
import { FormAlert, TextArea, TextInput } from "../demand/fields";

type Tab = "sugeridas" | "minhas";

function StatusBadge({ status }: { status: AgendaStatus }) {
  const color = AGENDA_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}1a`, color }}>
      {AGENDA_STATUS_LABELS[status]}
    </span>
  );
}

function placeOf(c: { district: string | null; municipality: string | null; uf: string | null; territory: string | null }): string {
  return [c.territory ?? c.district, [c.municipality, c.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
}

export function MediaAgendaClient() {
  const { user, status } = useAuth();
  const [tab, setTab] = useState<Tab>("sugeridas");
  const [candidates, setCandidates] = useState<AgendaCandidate[] | null>(null);
  const [items, setItems] = useState<MediaAgendaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowed = Boolean(user && canIdentifyAgenda(user.role, user.profileType));

  const load = useCallback(async () => {
    if (!allowed) return;
    setError(null);
    try {
      const [found, mine] = await Promise.all([api.discoverAgenda(), api.myAgenda()]);
      setCandidates(found);
      setItems(mine);
    } catch (err) {
      setError(agendaErrorMessage(err, "Não foi possível carregar as pautas agora."));
      setCandidates([]);
      setItems([]);
    }
  }, [allowed]);

  useEffect(() => { void load(); }, [load]);

  if (status === "unknown") return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;

  if (!user) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Pautas</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>A área de pautas é da Comunicação: imprensa, veículos de comunicação e jornalistas.</p>
          <div className="mt-4"><AuthPrompt action="identificar pautas" returnTo={AGENDA_PATH} /></div>
        </Card>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <EmptyState
          icon="megaphone"
          title="Área da Comunicação"
          hint={`Identificar pautas e registrar divulgação é da categoria ${ROLE_LABELS.media}. Sua conta é ${ROLE_LABELS[user.role]}; as demandas, o mapa e a agenda continuam abertos a você.`}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Pautas</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Demandas, resultados e eventos do território com potencial de pauta. Ao publicar, registre o veículo e o endereço: a divulgação entra na linha do tempo pública da demanda.
        </p>
      </header>

      <div role="tablist" aria-label="Pautas" className="mb-4 flex gap-2">
        {([["sugeridas", "Pautas sugeridas"], ["minhas", "Minhas pautas"]] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            aria-controls={`pautas-${key}`}
            onClick={() => setTab(key)}
            className="rounded-full px-3.5 py-1.5 text-sm font-semibold"
            style={tab === key ? { background: "#1b4f72", color: "#fff" } : { background: "var(--th-card-alt)", color: "var(--th-text)" }}
          >
            {label}{key === "minhas" && items ? ` (${items.length})` : ""}
          </button>
        ))}
      </div>

      {error && <div className="mb-4"><FormAlert message={error} /></div>}

      {tab === "sugeridas" ? (
        <section id="pautas-sugeridas" role="tabpanel" aria-label="Pautas sugeridas">
          {candidates === null ? (
            <div className="flex justify-center py-16"><span className="app-spinner" style={{ width: 28, height: 28 }} /></div>
          ) : candidates.length === 0 ? (
            <EmptyState icon="search" title="Nenhuma pauta sugerida por enquanto" hint="Os sinais vêm das demandas publicadas, das execuções com registro, dos resultados e dos eventos do território." />
          ) : (
            <ul className="space-y-3">
              {candidates.map((c) => (
                <li key={`${c.targetKind}:${c.targetId}`}>
                  <CandidateCard candidate={c} onIdentified={load} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section id="pautas-minhas" role="tabpanel" aria-label="Minhas pautas">
          {items === null ? (
            <div className="flex justify-center py-16"><span className="app-spinner" style={{ width: 28, height: 28 }} /></div>
          ) : items.length === 0 ? (
            <EmptyState icon="megaphone" title="Você ainda não identificou pautas" hint="Escolha uma pauta sugerida ou abra uma demanda pública e identifique-a como pauta." />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id}>
                  <AgendaItemCard item={item} onChanged={load} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function CandidateCard({ candidate: c, onIdentified }: { candidate: AgendaCandidate; onIdentified: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [angle, setAngle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function identify() {
    setBusy(true);
    setError(null);
    try {
      await api.createAgendaItem({ targetKind: c.targetKind, targetId: c.targetId, angle: angle.trim() || null });
      setOpen(false);
      setAngle("");
      await onIdentified();
    } catch (err) {
      setError(agendaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const when = c.targetKind === "evento" && c.startsAt ? `Começa ${formatDate(c.startsAt)}` : c.publishedAt ? `Publicada ${timeAgo(c.publishedAt)}` : null;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(27,79,114,0.12)", color: "#1b4f72" }}>
          {AGENDA_TARGET_LABELS[c.targetKind]}{c.categoryLabel ? ` · ${c.categoryLabel}` : ""}
        </span>
        {c.agendaItem && <StatusBadge status={c.agendaItem.status as AgendaStatus} />}
      </div>
      <h2 className="mt-2 text-base font-bold" style={{ color: "var(--th-text)" }}>
        <Link href={agendaTargetPath(c.targetKind, c.targetId)} className="hover:underline">{c.title}</Link>
      </h2>
      <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>{[placeOf(c), when].filter(Boolean).join(" · ")}</p>
      <ul className="mt-2 space-y-1" aria-label="Por que é pauta">
        {c.signals.map((s) => (
          <li key={s.signal} className="flex items-start gap-2 text-sm" style={{ color: "var(--th-text)" }}>
            <Icon name="bolt" size={14} className="mt-0.5 shrink-0 text-[#f4841a]" />
            <span>{s.label}{s.detail ? <span style={{ color: "var(--th-muted)" }}> · {s.detail}</span> : null}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {c.agendaItem ? (
          <span className="text-xs font-semibold" style={{ color: "var(--th-muted)" }}>Já está nas suas pautas.</span>
        ) : !open ? (
          <Button size="sm" icon="plus" onClick={() => setOpen(true)}>Identificar pauta</Button>
        ) : null}
        <Link href={agendaTargetPath(c.targetKind, c.targetId)} className="text-xs font-semibold" style={{ color: "#f4841a" }}>Ver conteúdo</Link>
      </div>
      {open && !c.agendaItem && (
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void identify(); }}>
          <TextArea
            name={`angle-${c.targetId}`}
            label="Ângulo da pauta (opcional)"
            value={angle}
            onValue={setAngle}
            maxLength={AGENDA_ANGLE_MAX}
            rows={3}
            hint="O enfoque que você pretende dar: quem é afetado, o que mudou, o que falta."
          />
          {error && <FormAlert message={error} />}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" type="button" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button size="sm" type="submit" icon="check" loading={busy}>Confirmar pauta</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function AgendaItemCard({ item, onChanged }: { item: MediaAgendaItem; onChanged: () => Promise<void> | void }) {
  const [publishing, setPublishing] = useState(false);
  const [outletName, setOutletName] = useState(item.outletName ?? "");
  const [publishedUrl, setPublishedUrl] = useState(item.publishedUrl ?? "");
  const [publishedOn, setPublishedOn] = useState(item.publishedOn ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function move(status: AgendaStatus, extra: Record<string, string> = {}) {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api.updateAgendaItem(item.id, { status, ...extra });
      setPublishing(false);
      await onChanged();
    } catch (err) {
      const f = (err as { fields?: Record<string, string> }).fields;
      if (f && typeof f === "object") setFields(f);
      setError(agendaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const next = AGENDA_STATUS_TRANSITIONS[item.status];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(27,79,114,0.12)", color: "#1b4f72" }}>
          {AGENDA_TARGET_LABELS[item.targetKind]}
        </span>
        <StatusBadge status={item.status} />
        <span className="font-numeric text-[11px]" style={{ color: "var(--th-muted)" }}>{timeAgo(item.updatedAt)}</span>
      </div>
      <h2 className="mt-2 text-base font-bold" style={{ color: "var(--th-text)" }}>
        <Link href={agendaTargetPath(item.targetKind, item.targetId)} className="hover:underline">{item.targetTitle ?? "Conteúdo"}</Link>
      </h2>
      {item.angle && <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{item.angle}</p>}
      {item.status === "publicada" && item.outletName && item.publishedUrl && item.publishedOn && (
        <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
          Divulgada por <strong style={{ color: "var(--th-text)" }}>{item.outletName}</strong> em {formatIsoDay(item.publishedOn)} ·{" "}
          <a href={item.publishedUrl} target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: "#f4841a" }}>Ler a matéria</a>
        </p>
      )}
      {error && <div className="mt-2"><FormAlert message={error} /></div>}
      {next.length > 0 && !publishing && (
        <div className="mt-3 flex flex-wrap gap-2">
          {next.includes("em_apuracao") && <Button size="sm" variant="outline" disabled={busy} onClick={() => move("em_apuracao")}>Em apuração</Button>}
          {next.includes("publicada") && <Button size="sm" icon="megaphone" disabled={busy} onClick={() => setPublishing(true)}>Registrar divulgação</Button>}
          {next.includes("identificada") && <Button size="sm" variant="outline" disabled={busy} onClick={() => move("identificada")}>Retomar pauta</Button>}
          {next.includes("descartada") && <Button size="sm" variant="outline" icon="close" disabled={busy} onClick={() => move("descartada")}>Descartar</Button>}
        </div>
      )}
      {publishing && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => { e.preventDefault(); void move("publicada", { outletName, publishedUrl, publishedOn }); }}
        >
          <TextInput name={`outlet-${item.id}`} label="Veículo" required value={outletName} onValue={setOutletName} maxLength={AGENDA_OUTLET_MAX} error={fields.outletName} />
          <TextInput name={`url-${item.id}`} label="Endereço da matéria (https)" required type="url" value={publishedUrl} onValue={setPublishedUrl} error={fields.publishedUrl} />
          <TextInput name={`date-${item.id}`} label="Data da divulgação" required type="date" value={publishedOn} onValue={setPublishedOn} error={fields.publishedOn} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" type="button" onClick={() => setPublishing(false)} disabled={busy}>Cancelar</Button>
            <Button size="sm" type="submit" icon="check" loading={busy}>Registrar divulgação</Button>
          </div>
        </form>
      )}
      {AGENDA_STATUSES.includes(item.status) && item.status === "publicada" && (
        <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Divulgação publicada não muda: ela entrou na linha do tempo pública.</p>
      )}
    </Card>
  );
}
