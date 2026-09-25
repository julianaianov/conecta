"use client";

/**
 * Encaminhamentos na área institucional (T14; Fluxo 3, etapa 06): formulário
 * para encaminhar a demanda a outro órgão validado na plataforma (busca por
 * nome, esfera e município), a um setor do próprio órgão ou a um órgão fora da
 * plataforma; ações de status (recebido, aceito, devolvido) e registro de
 * providências e atualizações; caixa "Encaminhadas a nós" / "Enviadas".
 */
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, DemandRequestError } from "@/lib/app/api";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import {
  DEFAULT_ORIGIN_TRACK_STATUS,
  FORWARDING_DESTINATION_KINDS,
  FORWARDING_DESTINATION_KIND_LABELS,
  FORWARDING_STATUS_LABELS,
  FORWARDING_UPDATE_KINDS,
  FORWARDING_UPDATE_KIND_LABELS,
  INSTITUTIONAL_STATUS_LABELS,
  canForwardFrom,
  institutionalDemandPath,
  institutionalErrorMessage,
} from "@/lib/app/institutional";
import {
  GOVERNMENT_SPHERE_LABELS,
  type Forwarding,
  type ForwardingDestinationKind,
  type ForwardingDirection,
  type ForwardingInboxItem,
  type ForwardingStatus,
  type ForwardingUpdateKind,
  type GovernmentOrganization,
  type GovernmentSphere,
  type InstitutionalDemandView,
  type InstitutionValidationStatus,
} from "@/lib/app/types";
import { Button } from "../Button";
import { EmptyState } from "../ui";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { FormAlert, SelectInput, TextArea, TextInput } from "../demand/fields";
import { ForwardingCard } from "./ForwardingParts";

type Fields = Record<string, string>;
type OriginStatus = "encaminhada" | "encaminhada_ao_orgao_responsavel";

function useErrors() {
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
    const code = (err as { code?: unknown })?.code;
    if (code === "directory_unavailable") setMessage("Não foi possível consultar os órgãos do Poder Público agora. Tente de novo em instantes.");
    else if (code === "duplicate_forwarding") setMessage("Já existe um encaminhamento em aberto desta demanda para esse órgão.");
    else if (code === "forwarding_forbidden") setMessage("O órgão não pode registrar isso neste encaminhamento.");
    else setMessage(institutionalErrorMessage(err, fallback));
  }, []);
  return { message, fields, gate, reset, capture };
}

const SPHERES: GovernmentSphere[] = ["municipal", "estadual", "federal"];

function organizationLine(org: GovernmentOrganization): string {
  return [
    org.governmentSphere ? GOVERNMENT_SPHERE_LABELS[org.governmentSphere] : null,
    org.department,
    [org.municipality, org.uf].filter(Boolean).join("/") || null,
  ].filter(Boolean).join(" · ");
}

/** Busca de órgão validado na plataforma (nome, esfera, município). */
function OrganizationPicker({ selected, onSelect, error }: {
  selected: GovernmentOrganization | null;
  onSelect: (org: GovernmentOrganization | null) => void;
  error?: string;
}) {
  const [q, setQ] = useState("");
  const [sphere, setSphere] = useState<GovernmentSphere | "">("");
  const [municipality, setMunicipality] = useState("");
  const [results, setResults] = useState<GovernmentOrganization[] | null>(null);
  const [busy, setBusy] = useState(false);
  const errors = useErrors();

  async function search() {
    setBusy(true);
    errors.reset();
    try {
      setResults(await api.governmentOrganizations({ q: q.trim(), sphere, municipality: municipality.trim() }));
    } catch (err) {
      errors.capture(err, "Não foi possível buscar os órgãos agora.");
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    return (
      <div className="rounded-xl border p-3" style={{ borderColor: "#2e7ba8" }}>
        <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{selected.name}</p>
        {organizationLine(selected) && <p className="text-xs" style={{ color: "var(--th-muted)" }}>{organizationLine(selected)}</p>}
        <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => onSelect(null)}>Trocar órgão</Button>
      </div>
    );
  }

  return (
    <fieldset className="space-y-3 rounded-xl border p-3" style={{ borderColor: error ? "#e53935" : "var(--th-border)" }}>
      <legend className="px-1 text-sm font-semibold" style={{ color: "var(--th-text)" }}>
        Órgão de destino<span aria-hidden="true" style={{ color: "#e53935" }}> *</span>
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput name="forward-org-q" label="Nome do órgão" value={q} onValue={setQ} maxLength={120} placeholder="Ex.: Secretaria de Obras" />
        <SelectInput
          name="forward-org-sphere" label="Esfera" value={sphere} placeholder="Todas"
          onValue={(v) => setSphere(v as GovernmentSphere | "")}
          options={SPHERES.map((s) => ({ value: s, label: GOVERNMENT_SPHERE_LABELS[s] }))}
        />
        <TextInput name="forward-org-municipality" label="Município" value={municipality} onValue={setMunicipality} maxLength={120} />
      </div>
      <Button type="button" size="sm" variant="outline" icon="search" loading={busy} onClick={() => void search()}>Buscar órgãos validados</Button>
      {errors.message && <FormAlert message={errors.message} />}
      {error && <p className="text-xs font-semibold" style={{ color: "#e53935" }}>{error}</p>}
      {results && results.length === 0 && (
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>
          Nenhum órgão validado encontrado. Se o órgão ainda não está na plataforma, use &quot;Órgão fora da plataforma&quot;.
        </p>
      )}
      {results && results.length > 0 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Órgãos encontrados">
          {results.map((org) => (
            <li key={org.organizationId}>
              <button
                type="button" onClick={() => onSelect(org)}
                className="w-full rounded-lg border px-3 py-2 text-left hover:shadow-sm"
                style={{ borderColor: "var(--th-border)", background: "var(--th-card)" }}
              >
                <span className="block text-sm font-semibold" style={{ color: "var(--th-text)" }}>{org.name}</span>
                {organizationLine(org) && <span className="block text-xs" style={{ color: "var(--th-muted)" }}>{organizationLine(org)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

/** Formulário "Encaminhar a demanda". */
export function ForwardingForm({ view, onSaved }: { view: InstitutionalDemandView; onSaved: (v: InstitutionalDemandView) => void }) {
  const [kind, setKind] = useState<ForwardingDestinationKind | "">("");
  const [org, setOrg] = useState<GovernmentOrganization | null>(null);
  const [externalName, setExternalName] = useState("");
  const [sector, setSector] = useState("");
  const [sphere, setSphere] = useState<GovernmentSphere | "">("");
  const [municipality, setMunicipality] = useState("");
  const [uf, setUf] = useState("");
  const [reason, setReason] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [responsibleRole, setResponsibleRole] = useState("");
  const [dueDays, setDueDays] = useState("");
  const [trackStatus, setTrackStatus] = useState<OriginStatus | "">("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const errors = useErrors();

  const current = view.track?.status ?? null;
  const target: OriginStatus | null = kind ? (trackStatus || DEFAULT_ORIGIN_TRACK_STATUS[kind]) : null;
  const blocked = target ? !canForwardFrom(current, target) : false;

  function chooseKind(next: ForwardingDestinationKind | "") {
    setKind(next);
    setTrackStatus("");
    errors.reset();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!kind) return;
    setBusy(true);
    errors.reset();
    setDone(null);
    try {
      const next = await api.forwardDemand(view.demand.id, {
        destinationKind: kind,
        destinationOrganizationId: kind === "orgao_plataforma" ? org?.organizationId ?? null : null,
        destinationOrganizationName: kind === "orgao_externo" ? externalName.trim() || null : null,
        destinationSector: sector.trim() || null,
        destinationSphere: kind === "orgao_externo" && sphere ? sphere : null,
        destinationMunicipality: kind === "orgao_externo" ? municipality.trim() || null : null,
        destinationUf: kind === "orgao_externo" ? uf.trim() || null : null,
        reason,
        responsibleName: responsibleName.trim() || null,
        responsibleRole: responsibleRole.trim() || null,
        trackStatus: trackStatus || null,
        dueDays: dueDays ? Number(dueDays) : null,
      });
      onSaved(next);
      setDone(kind === "orgao_plataforma"
        ? "Demanda encaminhada. O órgão de destino recebeu a demanda na fila dele e o encaminhamento entrou na linha do tempo pública."
        : "Encaminhamento registrado na demanda e na linha do tempo pública.");
      setKind(""); setOrg(null); setExternalName(""); setSector(""); setSphere(""); setMunicipality(""); setUf("");
      setReason(""); setResponsibleName(""); setResponsibleRole(""); setTrackStatus(""); setDueDays("");
    } catch (err) {
      errors.capture(err, "Não foi possível registrar o encaminhamento agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Encaminhar a demanda">
      <p className="text-sm" style={{ color: "var(--th-muted)" }}>
        Quando a demanda não está sob responsabilidade do órgão, encaminhe-a ao setor ou órgão competente. O encaminhamento registra órgão responsável, setor de destino, data, responsável, status e providências.
      </p>
      <SelectInput
        name="forward-kind" label="Encaminhar para" required value={kind} placeholder="Escolha o destino"
        onValue={(v) => chooseKind(v as ForwardingDestinationKind | "")}
        options={FORWARDING_DESTINATION_KINDS.map((k) => ({ value: k, label: FORWARDING_DESTINATION_KIND_LABELS[k] }))}
        error={errors.fields.destinationKind}
      />
      {kind === "orgao_plataforma" && <OrganizationPicker selected={org} onSelect={setOrg} error={errors.fields.destinationOrganizationId} />}
      {kind === "orgao_externo" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            name="forward-external-name" label="Órgão responsável" required value={externalName} onValue={setExternalName}
            maxLength={255} error={errors.fields.destinationOrganizationName} className="sm:col-span-2"
          />
          <SelectInput
            name="forward-external-sphere" label="Esfera" value={sphere} placeholder="Não informada"
            onValue={(v) => setSphere(v as GovernmentSphere | "")}
            options={SPHERES.map((s) => ({ value: s, label: GOVERNMENT_SPHERE_LABELS[s] }))}
            error={errors.fields.destinationSphere}
          />
          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <TextInput name="forward-external-municipality" label="Município" value={municipality} onValue={setMunicipality} maxLength={120} error={errors.fields.destinationMunicipality} />
            <TextInput name="forward-external-uf" label="UF" value={uf} onValue={(v) => setUf(v.toUpperCase())} maxLength={2} error={errors.fields.destinationUf} />
          </div>
        </div>
      )}
      {kind && (
        <>
          <TextInput
            name="forward-sector" label={kind === "setor_interno" ? "Setor de destino" : "Setor de destino (opcional)"}
            required={kind === "setor_interno"} value={sector} onValue={setSector} maxLength={255} error={errors.fields.destinationSector}
          />
          <TextArea
            name="forward-reason" label="Motivo e providências do encaminhamento" required value={reason} onValue={setReason}
            rows={4} maxLength={3000} hint="Texto público, assinado pelo órgão: aparece na tramitação da demanda." error={errors.fields.reason}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput name="forward-responsible" label="Responsável pelo encaminhamento" value={responsibleName} onValue={setResponsibleName} maxLength={255} hint="Sem preencher, fica o nome da sua conta. Não aparece na página pública." error={errors.fields.responsibleName} />
            <TextInput name="forward-responsible-role" label="Cargo ou função" value={responsibleRole} onValue={setResponsibleRole} maxLength={255} error={errors.fields.responsibleRole} />
            <TextInput
              name="forward-due-days" label="Prazo (dias)" type="number" min={1} max={365} value={dueDays} onValue={setDueDays}
              hint="Opcional. Conta a partir de hoje; o órgão responsável é avisado 3 dias antes e no vencimento."
              error={errors.fields.dueDays ?? errors.fields.dueOn}
            />
          </div>
          <SelectInput
            name="forward-track-status"
            label={`Status do acompanhamento do órgão${current ? ` (atual: ${INSTITUTIONAL_STATUS_LABELS[current]})` : ""}`}
            value={trackStatus || DEFAULT_ORIGIN_TRACK_STATUS[kind]}
            onValue={(v) => setTrackStatus(v as OriginStatus)}
            options={(["encaminhada", "encaminhada_ao_orgao_responsavel"] as const).map((s) => ({ value: s, label: INSTITUTIONAL_STATUS_LABELS[s] }))}
            error={errors.fields.trackStatus}
          />
          {blocked && current && target && (
            <FormAlert tone="info" message={`Do status "${INSTITUTIONAL_STATUS_LABELS[current]}" não é possível ir para "${INSTITUTIONAL_STATUS_LABELS[target]}". Volte o acompanhamento para Em análise antes de encaminhar.`} />
          )}
        </>
      )}
      {errors.message && <FormAlert message={errors.message} />}
      {errors.gate && <InstitutionGateNotice action="atuar" status={errors.gate.status} />}
      {done && <FormAlert message={done} tone="success" />}
      <Button type="submit" icon="send" loading={busy} disabled={!kind || blocked || (kind === "orgao_plataforma" && !org)}>Encaminhar</Button>
    </form>
  );
}

/** Status (quem responde) e providências/atualizações (os dois órgãos) de um encaminhamento. */
export function ForwardingActions({ forwarding, onChanged }: { forwarding: Forwarding; onChanged: (f: Forwarding) => void }) {
  const [status, setStatus] = useState<ForwardingStatus | "">("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<Exclude<ForwardingUpdateKind, "status">>("providencia");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"status" | "update" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const errors = useErrors();

  async function changeStatus(e: FormEvent) {
    e.preventDefault();
    if (!status) return;
    setBusy("status");
    errors.reset();
    setDone(null);
    try {
      const next = await api.changeForwardingStatus(forwarding.id, status, note.trim() || null);
      onChanged(next.forwarding);
      setDone(`Encaminhamento marcado como ${FORWARDING_STATUS_LABELS[status].toLowerCase()}.`);
      setStatus(""); setNote("");
    } catch (err) {
      errors.capture(err, "Não foi possível atualizar o encaminhamento agora.");
    } finally {
      setBusy(null);
    }
  }

  async function addUpdate(e: FormEvent) {
    e.preventDefault();
    setBusy("update");
    errors.reset();
    setDone(null);
    try {
      const next = await api.addForwardingUpdate(forwarding.id, kind, body);
      onChanged(next.forwarding);
      setDone(`${FORWARDING_UPDATE_KIND_LABELS[kind]} registrada na tramitação.`);
      setBody("");
    } catch (err) {
      errors.capture(err, "Não foi possível registrar agora.");
    } finally {
      setBusy(null);
    }
  }

  const statusHint = forwarding.destinationKind === "orgao_plataforma"
    ? "O órgão de destino registra o recebimento, o aceite ou a devolução."
    : "Destino fora da plataforma: registre aqui o retorno recebido.";

  return (
    <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--th-border)" }}>
      {forwarding.canChangeStatus && forwarding.availableStatuses.length > 0 && (
        <form onSubmit={changeStatus} className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end" aria-label="Status do encaminhamento">
          <SelectInput
            name={`fwd-status-${forwarding.id}`} label="Status" value={status} placeholder="Escolha"
            onValue={(v) => setStatus(v as ForwardingStatus | "")}
            options={forwarding.availableStatuses.map((s) => ({ value: s, label: FORWARDING_STATUS_LABELS[s] }))}
            error={errors.fields.status} hint={statusHint}
          />
          <TextInput
            name={`fwd-note-${forwarding.id}`} label={status === "devolvido" ? "Motivo da devolução" : "Observação (pública)"}
            required={status === "devolvido"} value={note} onValue={setNote} maxLength={2000} error={errors.fields.note}
          />
          <Button type="submit" size="sm" icon="check" loading={busy === "status"} disabled={!status}>Registrar</Button>
        </form>
      )}
      <form onSubmit={addUpdate} className="space-y-2" aria-label="Providência ou atualização do encaminhamento">
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <SelectInput
            name={`fwd-kind-${forwarding.id}`} label="Registrar" value={kind}
            onValue={(v) => setKind(v as Exclude<ForwardingUpdateKind, "status">)}
            options={FORWARDING_UPDATE_KINDS.map((k) => ({ value: k, label: FORWARDING_UPDATE_KIND_LABELS[k] }))}
            error={errors.fields.kind}
          />
          <TextArea
            name={`fwd-body-${forwarding.id}`} label="Descrição (pública)" required value={body} onValue={setBody}
            rows={2} maxLength={3000} error={errors.fields.body}
          />
        </div>
        <Button type="submit" size="sm" variant="outline" icon="plus" loading={busy === "update"} disabled={!body.trim()}>Adicionar à tramitação</Button>
      </form>
      {errors.message && <FormAlert message={errors.message} />}
      {errors.gate && <InstitutionGateNotice action="atuar" status={errors.gate.status} />}
      {done && <FormAlert message={done} tone="success" />}
    </div>
  );
}

/** Caixa do órgão: "Encaminhadas a nós" (recebidos) ou "Enviadas". */
export function ForwardingInbox({ direction, onChanged }: { direction: ForwardingDirection; onChanged?: () => void }) {
  const [items, setItems] = useState<ForwardingInboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.institutionalForwardings(direction)
      .then((list) => { if (alive) { setItems(list); setError(null); } })
      .catch((err) => { if (alive) { setItems([]); setError(institutionalErrorMessage(err, "Não foi possível carregar os encaminhamentos agora.")); } });
    return () => { alive = false; };
  }, [direction]);

  const replace = (f: Forwarding) => {
    setItems((list) => (list ?? []).map((i) => (i.forwarding.id === f.id ? { ...i, forwarding: f } : i)));
    onChanged?.();
  };

  if (!items) return <div className="flex justify-center py-16"><span className="app-spinner" aria-label="Carregando encaminhamentos" /></div>;
  return (
    <div className="space-y-3">
      {error && <FormAlert message={error} />}
      {!error && items.length === 0 && (
        <EmptyState
          icon="send"
          title={direction === "recebidos" ? "Nenhuma demanda encaminhada ao órgão" : "O órgão ainda não encaminhou demandas"}
          hint={direction === "recebidos"
            ? "Quando outro órgão encaminhar uma demanda, ela aparece aqui e na fila de recebidas."
            : "Encaminhe uma demanda pela página de análise dela."}
        />
      )}
      <ul className="space-y-3">
        {items.map(({ forwarding, demand }) => (
          <li key={forwarding.id} className="app-card rounded-2xl p-4">
            <Link href={institutionalDemandPath(demand.id)} className="text-base font-bold leading-snug hover:underline" style={{ color: "var(--th-text)" }}>
              {demand.title}
            </Link>
            <p className="mb-2 text-xs" style={{ color: "var(--th-muted)" }}>
              {[demand.territory, [demand.municipality, demand.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
            </p>
            <ForwardingCard forwarding={forwarding}>
              <ForwardingActions forwarding={forwarding} onChanged={replace} />
            </ForwardingCard>
          </li>
        ))}
      </ul>
    </div>
  );
}
