"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, DemandRequestError } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { useEffectiveRole } from "../institution/useInstitutionAccess";
import { demandPublicPath } from "@/lib/app/demand";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import {
  INSTITUTIONAL_AREA_PATH,
  INSTITUTIONAL_STATUS_LABELS,
  RESPONSE_SUGGESTED_STATUS,
  RESPONSE_TYPES,
  RESPONSE_TYPE_LABELS,
  SUPPORT_TYPES,
  SUPPORT_TYPE_LABELS,
  institutionalErrorMessage,
  institutionalTimelineDetail,
  statusRequiresNote,
} from "@/lib/app/institutional";
import { timelineEventLabel } from "@/lib/app/demand";
import { formatDate } from "@/lib/app/format";
import {
  type ConnectionType,
  type DemandTimelineEvent,
  type Forwarding,
  type InstitutionalDemandView,
  type InstitutionalResponseType,
  type InstitutionalStatus,
  type InstitutionalSupportType,
  type InstitutionValidationStatus,
  type PublicDemandAccountabilityView,
  type PublicDemandExecution,
} from "@/lib/app/types";
import { DemandExecutionSection } from "../execution/DemandExecutionSection";
import { DemandAccountabilitySection } from "../accountability/DemandAccountabilitySection";
import { BudgetOnlyLine } from "./ViewerComposition";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Card } from "../ui";
import { Icon } from "../Icon";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import {
  BudgetTable,
  CategoryBadge,
  DemandStatusBadge,
  DocumentsSummary,
  GoalsList,
  PriorityBadge,
  ReadSection,
  ResourcesSummary,
  ScheduleList,
  TextBlock,
} from "../demand/DemandParts";
import { Checkbox, FormAlert, SelectInput, TextArea, TextInput } from "../demand/fields";
import { InstitutionalStatusBadge, OfferList, OrganizationTrackList, ResponseList } from "./InstitutionalParts";
import { ForwardingCard } from "./ForwardingParts";
import { ForwardingActions, ForwardingForm } from "./ForwardingPanel";
import { InstitutionalProcessPanel } from "../process/InstitutionalProcessPanel";

type Fields = Record<string, string>;

/** Erro da API → mensagem geral + erros por campo (422) ou aviso do gate (403). */
function useApiErrors() {
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);
  const reset = useCallback(() => { setMessage(null); setFields({}); setGate(null); }, []);
  const capture = useCallback((err: unknown, fallback: string) => {
    if (isInstitutionNotValidated(err)) {
      setGate({ status: gateStatusFrom(err) });
      return;
    }
    if (err instanceof DemandRequestError && Object.keys(err.fields).length) setFields(err.fields as Fields);
    setMessage(institutionalErrorMessage(err, fallback));
  }, []);
  return { message, fields, gate, reset, capture };
}

function StatusForm({ view, onSaved }: { view: InstitutionalDemandView; onSaved: (v: InstitutionalDemandView) => void }) {
  const options = view.track?.availableStatuses ?? [];
  const [status, setStatus] = useState<InstitutionalStatus | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const errors = useApiErrors();
  const [done, setDone] = useState<string | null>(null);

  if (!view.track) return null;
  if (!options.length) {
    return <p className="text-sm" style={{ color: "var(--th-muted)" }}>Acompanhamento concluído: o status não muda mais.</p>;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!status) return;
    setBusy(true);
    errors.reset();
    setDone(null);
    try {
      const next = await api.changeInstitutionalStatus(view.demand.id, status, note.trim() || null);
      onSaved(next);
      setDone(`Status atualizado para ${INSTITUTIONAL_STATUS_LABELS[status]}.`);
      setStatus("");
      setNote("");
    } catch (err) {
      errors.capture(err, "Não foi possível atualizar o status agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Atualizar status institucional">
      <SelectInput
        name="institutional-status" label="Novo status" required value={status} placeholder="Escolha"
        onValue={(v) => setStatus(v as InstitutionalStatus | "")}
        options={options.map((s) => ({ value: s, label: INSTITUTIONAL_STATUS_LABELS[s] }))}
        error={errors.fields.status}
      />
      <TextArea
        name="institutional-note" label={statusRequiresNote(status) ? "Justificativa e encaminhamento" : "Observação (pública)"}
        required={statusRequiresNote(status)} value={note} onValue={setNote} rows={3} maxLength={2000}
        hint="Aparece na linha do tempo pública da demanda."
        error={errors.fields.note}
      />
      {errors.message && <FormAlert message={errors.message} />}
      {errors.gate && <InstitutionGateNotice action="atuar" status={errors.gate.status} />}
      {done && <FormAlert message={done} tone="success" />}
      <Button type="submit" size="sm" icon="check" loading={busy} disabled={!status}>Atualizar status</Button>
    </form>
  );
}

function ResponsibleForm({ view, onSaved }: { view: InstitutionalDemandView; onSaved: (v: InstitutionalDemandView) => void }) {
  const [name, setName] = useState(view.track?.responsibleName ?? "");
  const [role, setRole] = useState(view.track?.responsibleRole ?? "");
  const [busy, setBusy] = useState(false);
  const errors = useApiErrors();
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    errors.reset();
    setDone(false);
    try {
      onSaved(await api.setInstitutionalResponsible(view.demand.id, { responsibleName: name.trim() || null, responsibleRole: role.trim() || null }));
      setDone(true);
    } catch (err) {
      errors.capture(err, "Não foi possível salvar o responsável agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" aria-label="Responsável pelo acompanhamento">
      <TextInput name="responsible-name" label="Responsável no órgão" value={name} onValue={setName} maxLength={255} error={errors.fields.responsibleName} />
      <TextInput name="responsible-role" label="Cargo ou setor" value={role} onValue={setRole} maxLength={255} error={errors.fields.responsibleRole} />
      <p className="text-xs sm:col-span-2" style={{ color: "var(--th-muted)" }}>Uso interno do órgão: não aparece na página pública.</p>
      <div className="sm:col-span-2 space-y-2">
        {errors.message && <FormAlert message={errors.message} />}
        {done && <FormAlert message="Responsável salvo." tone="success" />}
        <Button type="submit" size="sm" variant="outline" icon="person" loading={busy}>Salvar responsável</Button>
      </div>
    </form>
  );
}

function ResponseForm({ view, onSaved }: { view: InstitutionalDemandView; onSaved: (v: InstitutionalDemandView) => void }) {
  const current = view.track?.status ?? "recebida";
  const available = view.track ? view.track.availableStatuses : ["em_analise", "encaminhada", "nao_e_de_competencia", "encaminhada_ao_orgao_responsavel"] as InstitutionalStatus[];
  const [type, setType] = useState<InstitutionalResponseType | "">("");
  const [body, setBody] = useState("");
  const [sector, setSector] = useState("");
  const [programName, setProgramName] = useState("");
  const [programUrl, setProgramUrl] = useState("");
  const [plannedFor, setPlannedFor] = useState("");
  const [status, setStatus] = useState<InstitutionalStatus | "">("");
  const [statusNote, setStatusNote] = useState("");
  const [busy, setBusy] = useState(false);
  const errors = useApiErrors();
  const [done, setDone] = useState(false);

  function chooseType(next: InstitutionalResponseType | "") {
    setType(next);
    const suggested = next ? RESPONSE_SUGGESTED_STATUS[next] : undefined;
    setStatus(suggested && available.includes(suggested) ? suggested : "");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!type) return;
    setBusy(true);
    errors.reset();
    setDone(false);
    try {
      const next = await api.addInstitutionalResponse(view.demand.id, {
        type,
        body,
        responsibleSector: sector.trim() || null,
        programName: programName.trim() || null,
        programUrl: programUrl.trim() || null,
        plannedFor: plannedFor || null,
        status: status || null,
        statusNote: statusNote.trim() || null,
      });
      onSaved(next);
      setDone(true);
      setType(""); setBody(""); setSector(""); setProgramName(""); setProgramUrl(""); setPlannedFor(""); setStatus(""); setStatusNote("");
    } catch (err) {
      errors.capture(err, "Não foi possível registrar a resposta agora.");
    } finally {
      setBusy(false);
    }
  }

  const showSector = type === "orgao_ou_setor_responsavel" || type === "encaminhamento_realizado" || type === "impossibilidade_com_encaminhamento";
  const showProgram = type === "programa_publico_relacionado";

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Registrar resposta institucional">
      <SelectInput
        name="response-type" label="O que a resposta informa" required value={type} placeholder="Escolha o tipo"
        onValue={(v) => chooseType(v as InstitutionalResponseType | "")}
        options={RESPONSE_TYPES.map((t) => ({ value: t, label: RESPONSE_TYPE_LABELS[t] }))}
        error={errors.fields.type}
      />
      <TextArea
        name="response-body" label="Resposta" required value={body} onValue={setBody} rows={5} maxLength={5000}
        hint="Texto público, assinado pelo órgão (o nome do representante não aparece na página pública)."
        error={errors.fields.body}
      />
      {showSector && (
        <TextInput
          name="response-sector" label="Órgão ou setor responsável" required={type === "orgao_ou_setor_responsavel"}
          value={sector} onValue={setSector} maxLength={255} error={errors.fields.responsibleSector}
        />
      )}
      {showProgram && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput name="response-program" label="Programa ou serviço público" required value={programName} onValue={setProgramName} maxLength={255} error={errors.fields.programName} />
          <TextInput name="response-program-url" label="Página do programa (https://)" type="url" value={programUrl} onValue={setProgramUrl} maxLength={1000} error={errors.fields.programUrl} />
        </div>
      )}
      {type === "acao_prevista" && (
        <TextInput name="response-planned" label="Data prevista" type="date" value={plannedFor} onValue={setPlannedFor} error={errors.fields.plannedFor} className="max-w-xs" />
      )}
      {available.length > 0 && (
        <SelectInput
          name="response-status"
          label={`Atualizar o status junto (atual: ${INSTITUTIONAL_STATUS_LABELS[current]})`}
          value={status} placeholder="Manter o status atual"
          onValue={(v) => setStatus(v as InstitutionalStatus | "")}
          options={available.map((s) => ({ value: s, label: INSTITUTIONAL_STATUS_LABELS[s] }))}
          error={errors.fields.status}
        />
      )}
      {statusRequiresNote(status) && (
        <TextArea name="response-status-note" label="Justificativa e encaminhamento" required value={statusNote} onValue={setStatusNote} rows={2} maxLength={2000} error={errors.fields.statusNote} />
      )}
      {errors.message && <FormAlert message={errors.message} />}
      {errors.gate && <InstitutionGateNotice action="atuar" status={errors.gate.status} />}
      {done && <FormAlert message="Resposta registrada na demanda e na linha do tempo pública." tone="success" />}
      <Button type="submit" icon="send" loading={busy} disabled={!type}>Registrar resposta</Button>
    </form>
  );
}

function connectionTypeFor(types: InstitutionalSupportType[]): ConnectionType {
  const resources: InstitutionalSupportType[] = ["recursos_publicos", "infraestrutura", "equipamentos", "espacos_publicos", "equipes"];
  if (types.some((t) => resources.includes(t))) return "resources";
  if (types.includes("parcerias") || types.includes("articulacao_institucional")) return "partnership";
  return "support";
}

function OfferForm({ view, onSaved }: { view: InstitutionalDemandView; onSaved: (v: InstitutionalDemandView) => void }) {
  const { user } = useAuth();
  const [types, setTypes] = useState<InstitutionalSupportType[]>([]);
  const [description, setDescription] = useState("");
  const [connect, setConnect] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const errors = useApiErrors();
  const [done, setDone] = useState<string | null>(null);

  const toggle = (t: InstitutionalSupportType, on: boolean) => setTypes((list) => (on ? [...list, t] : list.filter((x) => x !== t)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    errors.reset();
    setDone(null);
    try {
      let connectionId: string | null = null;
      if (connect) {
        // Conexão com o Agente pelas rotas de conexões (user-service), ligada ao
        // post-vitrine e à demanda (T15: o aceite leva a demanda a "Conectada").
        const connection = await api.createConnection({
          from: user,
          toUserId: view.demand.authorId,
          type: connectionTypeFor(types),
          message: (message.trim() || `${description.trim()}`).slice(0, 2000) || "Interesse institucional em apoiar a demanda.",
          postId: view.demand.postId,
          postTitle: view.demand.title,
          demandId: view.demand.id,
        });
        connectionId = connection.id;
      }
      const next = await api.addInstitutionalOffer(view.demand.id, { supportTypes: types, description, connectionId });
      onSaved(next);
      setDone(connectionId ? "Apoio registrado e conexão solicitada ao Agente de Transformação." : "Apoio registrado.");
      setTypes([]); setDescription(""); setMessage("");
    } catch (err) {
      errors.capture(err, "Não foi possível registrar o apoio agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Demonstrar interesse em apoiar">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold" style={{ color: "var(--th-text)" }}>
          Formas de apoio, de acordo com a competência e a disponibilidade do órgão<span aria-hidden="true" style={{ color: "#e53935" }}> *</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SUPPORT_TYPES.map((t) => (
            <Checkbox key={t} name={`support-${t}`} label={SUPPORT_TYPE_LABELS[t]} checked={types.includes(t)} onChecked={(on) => toggle(t, on)} />
          ))}
        </div>
        {errors.fields.supportTypes && <p className="mt-1 text-xs font-semibold" style={{ color: "#e53935" }}>{errors.fields.supportTypes}</p>}
      </fieldset>
      <TextArea
        name="offer-description" label="O que o órgão oferece e em que condições" required value={description} onValue={setDescription}
        rows={4} maxLength={3000} hint="Aparece publicamente na demanda, com o nome do órgão." error={errors.fields.description}
      />
      <Checkbox
        name="offer-connect" label="Solicitar conexão com o Agente de Transformação" checked={connect} onChecked={setConnect}
        hint="O Agente recebe o pedido em Conexões e pode aceitar ou recusar."
      />
      {connect && (
        <TextArea name="offer-message" label="Mensagem para o Agente (opcional)" value={message} onValue={setMessage} rows={2} maxLength={2000} />
      )}
      {errors.message && <FormAlert message={errors.message} />}
      {errors.gate && <InstitutionGateNotice action="atuar" status={errors.gate.status} />}
      {done && <FormAlert message={done} tone="success" />}
      <Button type="submit" icon="volunteer" loading={busy} disabled={!types.length}>Registrar apoio</Button>
    </form>
  );
}

/** Análise e atuação do órgão numa demanda (T13; Fluxo 3, etapas 03 a 07) e encaminhamentos (T14). */
export function InstitutionalDemandClient({ id }: { id: string }) {
  const { user, status } = useAuth();
  // Papel efetivo (T29): a própria categoria ou a que o vínculo empresta.
  const { role: effective, resolving: roleResolving } = useEffectiveRole();
  const isGovernment = effective === "government";
  const [view, setView] = useState<InstitutionalDemandView | null | undefined>(undefined);
  const [timeline, setTimeline] = useState<DemandTimelineEvent[]>([]);
  const [opening, setOpening] = useState(false);
  const errors = useApiErrors();
  const { capture } = errors;

  useEffect(() => {
    if (status !== "authenticated" || !isGovernment) return;
    let alive = true;
    api.getInstitutionalDemand(id)
      .then((v) => { if (alive) setView(v); })
      .catch((err) => { if (alive) { setView(null); capture(err, "Não foi possível carregar a demanda."); } });
    return () => { alive = false; };
  }, [id, status, isGovernment, capture]);

  // A linha do tempo pública acompanha cada registro do órgão.
  const trackStamp = view?.track?.updatedAt ?? null;
  const entries = (view?.responses.length ?? 0) + (view?.offers.length ?? 0)
    + (view?.forwardings ?? []).reduce((n, f) => n + 1 + f.updates.length, 0);

  // Execução e prestação de contas (T-03-02; Fluxo 3, slide 9 "Acompanhar a
  // execução da iniciativa"): as mesmas projeções públicas da página da
  // demanda. Falha isolada: a análise continua disponível.
  const demandId = view?.demand.id ?? null;
  const [execution, setExecution] = useState<PublicDemandExecution | null>(null);
  const [accountability, setAccountability] = useState<PublicDemandAccountabilityView | null>(null);
  const [followFailed, setFollowFailed] = useState(false);
  useEffect(() => {
    if (!demandId) return;
    let alive = true;
    void Promise.allSettled([api.publicDemandExecution(demandId), api.publicDemandAccountability(demandId)])
      .then(([exec, acc]) => {
        if (!alive) return;
        setExecution(exec.status === "fulfilled" ? exec.value : null);
        setAccountability(acc.status === "fulfilled" ? acc.value : null);
        setFollowFailed(exec.status === "rejected" || acc.status === "rejected");
      });
    return () => { alive = false; };
  }, [demandId]);

  const replaceForwarding = (f: Forwarding) => setView((v) => (v ? {
    ...v, forwardings: (v.forwardings ?? []).map((x) => (x.id === f.id ? f : x)),
  } : v));
  useEffect(() => {
    if (!view) return;
    let alive = true;
    api.publicDemandTimeline(view.demand.id).then((events) => { if (alive) setTimeline(events); }).catch(() => {});
    return () => { alive = false; };
  }, [view, trackStamp, entries]);

  async function open() {
    setOpening(true);
    errors.reset();
    try {
      setView(await api.openInstitutionalTrack(id));
    } catch (err) {
      errors.capture(err, "Não foi possível registrar o recebimento agora.");
    } finally {
      setOpening(false);
    }
  }

  if (status === "unknown") return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  if (roleResolving) return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  if (!user || !isGovernment) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Atuação institucional</h1>
          {user
            ? <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>Esta área é do Poder Público com cadastro institucional validado.</p>
            : <div className="mt-4"><AuthPrompt action="atuar nesta demanda" returnTo={`${INSTITUTIONAL_AREA_PATH}/demandas/${encodeURIComponent(id)}`} /></div>}
          <Button className="mt-4" href={demandPublicPath(id)} variant="outline">Ver a página pública da demanda</Button>
        </Card>
      </div>
    );
  }
  if (errors.gate && !view) {
    return <div className="mx-auto max-w-xl"><InstitutionGateNotice action="atuar" status={errors.gate.status} /></div>;
  }
  if (view === undefined) return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando a demanda" /></div>;
  if (view === null) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <FormAlert message={errors.message ?? "Demanda não encontrada ou fora do fluxo público."} />
        <Button href={INSTITUTIONAL_AREA_PATH} variant="outline" icon="arrowLeft">Voltar ao painel</Button>
      </div>
    );
  }

  const { demand, track } = view;
  const place = [demand.territory, [demand.municipality, demand.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={INSTITUTIONAL_AREA_PATH} className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
        <Icon name="arrowLeft" size={18} /> Painel institucional
      </Link>

      <header className="app-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={demand.category} />
          <DemandStatusBadge status={demand.status} />
          <PriorityBadge priority={demand.priority} />
        </div>
        <h1 className="mt-2 text-2xl font-bold leading-tight" style={{ color: "var(--th-text)" }}>{demand.title}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          {demand.authorName ?? "Agente de Transformação"}{place ? ` · ${place}` : ""}
          {demand.publishedAt ? ` · publicada em ${formatDate(demand.publishedAt)}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button href={demandPublicPath(demand.id)} size="sm" variant="outline" icon="eye">Página pública</Button>
          <Button
            href={`/conexoes/nova?para=${encodeURIComponent(demand.authorId)}${demand.postId ? `&post=${encodeURIComponent(demand.postId)}` : ""}`}
            size="sm" variant="outline" icon="link"
          >
            Solicitar conexão com o Agente
          </Button>
        </div>
      </header>

      <ReadSection title="Acompanhamento do órgão" icon="building">
        {track ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <InstitutionalStatusBadge status={track.status} />
              <span className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                Recebida em {formatDate(track.receivedAt)} · status desde {formatDate(track.statusChangedAt)}
              </span>
            </div>
            {track.statusNote && <p className="text-sm" style={{ color: "var(--th-text)" }}>{track.statusNote}</p>}
            <StatusForm view={view} onSaved={setView} />
            <details className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
              <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--th-text)" }}>
                Responsável{track.responsibleName ? `: ${track.responsibleName}` : " (não definido)"}
              </summary>
              <div className="mt-3"><ResponsibleForm view={view} onSaved={setView} /></div>
            </details>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--th-text)" }}>
              O órgão ainda não registrou o recebimento desta demanda. Ao registrar, ela entra na fila do órgão como <strong>Recebida</strong> e o recebimento aparece na linha do tempo pública.
            </p>
            {errors.message && <FormAlert message={errors.message} />}
            {errors.gate && <InstitutionGateNotice action="atuar" status={errors.gate.status} />}
            <Button type="button" icon="check" loading={opening} onClick={() => void open()}>Registrar recebimento</Button>
          </div>
        )}
      </ReadSection>

      <ReadSection title="Processo de conexão" icon="document">
        <InstitutionalProcessPanel view={view} onSaved={setView} />
      </ReadSection>

      <ReadSection title="Resposta institucional" icon="message">
        <ResponseForm key={`r-${track?.status ?? "novo"}`} view={view} onSaved={setView} />
        {view.responses.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Respostas do órgão</h3>
            <ResponseList responses={view.responses} showAuthor />
          </div>
        )}
      </ReadSection>

      <ReadSection title="Encaminhamento e tramitação" icon="send">
        <ForwardingForm view={view} onSaved={setView} />
        {(view.forwardings ?? []).length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Encaminhamentos que envolvem o órgão</h3>
            <ul className="space-y-3">
              {(view.forwardings ?? []).map((f) => (
                <li key={f.id}>
                  <ForwardingCard forwarding={f}>
                    <ForwardingActions forwarding={f} onChanged={replaceForwarding} />
                  </ForwardingCard>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ReadSection>

      <ReadSection title="Apoio e recursos" icon="volunteer">
        <OfferForm view={view} onSaved={setView} />
        {view.offers.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Apoio oferecido pelo órgão</h3>
            <OfferList offers={view.offers} />
          </div>
        )}
      </ReadSection>

      {view.otherOrganizations.length > 0 && (
        <ReadSection title="Outros órgãos que acompanham" icon="groups">
          <OrganizationTrackList organizations={view.otherOrganizations} />
        </ReadSection>
      )}

      {/* Execução e resultados (T-03-02): mesmos componentes da página pública; cada um some sem conteúdo. */}
      {followFailed && (
        <p className="text-xs" role="status" style={{ color: "var(--th-muted)" }}>
          Não foi possível carregar a execução ou a prestação de contas agora; a página pública da demanda mostra o mesmo conteúdo.
        </p>
      )}
      <DemandExecutionSection execution={execution} />
      <DemandAccountabilitySection data={accountability} />

      <ReadSection title="Análise da demanda" icon="document">
        <div className="space-y-4">
          <TextBlock label="Descrição">{demand.description}</TextBlock>
          <TextBlock label="Objetivo">{demand.objective}</TextBlock>
          <TextBlock label="Justificativa">{demand.justification}</TextBlock>
          <TextBlock label="Público beneficiado">
            {demand.beneficiariesEstimate.toLocaleString("pt-BR")} pessoas (estimativa) · {demand.beneficiariesProfile}
          </TextBlock>
        </div>
      </ReadSection>
      <ReadSection title="Orçamento" icon="payments">
        <BudgetTable items={demand.budgetItems} />
        {/* Decisão 14 (Modelo de Conexão §04 Obs.): 4% + 6% nunca incidem sobre o
            Poder Público; o órgão vê só o orçamento original, sem a composição. */}
        <div className="mt-4"><BudgetOnlyLine budgetAmountCents={demand.composition.budgetAmountCents} /></div>
      </ReadSection>
      <ReadSection title="Cronograma" icon="calendar">
        <ScheduleList items={demand.scheduleItems} budgetItems={demand.budgetItems} />
      </ReadSection>
      <ReadSection title="Metas e indicadores" icon="trophy"><GoalsList goals={demand.goals} /></ReadSection>
      <ReadSection title="Recursos necessários" icon="inventory"><ResourcesSummary resources={demand.resources} /></ReadSection>
      {demand.documents.length > 0 && (
        <ReadSection title="Documentação" icon="shield"><DocumentsSummary documents={demand.documents} /></ReadSection>
      )}
      <ReadSection title="Histórico da demanda" icon="clock">
        {timeline.length ? (
          <ol className="space-y-3 border-l-2 pl-4" style={{ borderColor: "var(--th-border)" }}>
            {timeline.map((event) => (
              <li key={event.id}>
                <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{timelineEventLabel(event)}</p>
                {institutionalTimelineDetail(event) && <p className="text-xs" style={{ color: "var(--th-text)" }}>{institutionalTimelineDetail(event)}</p>}
                <p className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>{formatDate(event.createdAt)}</p>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm" style={{ color: "var(--th-muted)" }}>Sem registros públicos ainda.</p>}
      </ReadSection>
    </div>
  );
}
