"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import { MY_DEMANDS_PATH } from "@/lib/app/demand";
import {
  DEMAND_SUPPORT_TYPES,
  MY_SUPPORTS_PATH,
  RECEIPT_STATUS_COLORS,
  RECEIPT_STATUS_LABELS,
  SUPPORT_MODALITIES,
  SUPPORT_MODALITY_HINTS,
  SUPPORT_MODALITY_ICONS,
  SUPPORT_MODALITY_LABELS,
  SUPPORT_TYPE_LABELS,
  formatCents,
  supportErrorMessage,
  supportReaisToCents,
  supporterDisplayName,
} from "@/lib/app/support";
import type {
  DemandSupport,
  DemandSupportContext,
  DemandSupportHistory,
  InstitutionValidationStatus,
  SupportModality,
  SupportType,
} from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { ReadSection } from "../demand/DemandParts";
import { Checkbox, FormAlert, SelectInput, TextArea, TextInput } from "../demand/fields";
import { formatDate } from "@/lib/app/format";

/** Formulário do registro de apoio realizado (as 6 modalidades da fonte). */
function SupportForm({ modality, busy, onSubmit, onCancel }: {
  modality: SupportModality;
  busy: boolean;
  onSubmit: (input: {
    supportType: SupportType; description: string; amountCents: number | null;
    amountPublic: boolean; occurredOn: string | null; message: string | null;
    displayConsent: boolean; publicName: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [supportType, setSupportType] = useState<string>(modality === "patrocinar_projeto" || modality === "financiar_evento" ? "financial" : "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [amountPublic, setAmountPublic] = useState(false);
  const [occurredOn, setOccurredOn] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [publicName, setPublicName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border p-3"
      style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!supportType) { setError("Escolha o que você ofereceu."); return; }
        if (!description.trim()) { setError("Descreva o que foi oferecido."); return; }
        const cents = supportReaisToCents(amount);
        if (Number.isNaN(cents)) { setError("Informe um valor declarado válido."); return; }
        if (supportType === "financial" && !cents) { setError("O apoio financeiro precisa do valor declarado."); return; }
        setError(null);
        onSubmit({
          supportType: supportType as SupportType,
          description: description.trim(),
          amountCents: cents,
          amountPublic: amountPublic && cents !== null,
          occurredOn: occurredOn || null,
          message: message.trim() || null,
          displayConsent: consent,
          publicName: consent ? (publicName.trim() || null) : null,
        });
      }}
    >
      <p className="text-xs" style={{ color: "var(--th-muted)" }}>{SUPPORT_MODALITY_HINTS[modality]}</p>
      <SelectInput
        name="tipo-apoio"
        label="O que foi oferecido"
        required
        value={supportType}
        onValue={setSupportType}
        placeholder="Escolha"
        options={DEMAND_SUPPORT_TYPES.map((t) => ({ value: t, label: SUPPORT_TYPE_LABELS[t] }))}
      />
      <TextArea name="descricao-apoio" label="Descrição do apoio" required value={description} onValue={setDescription} rows={3} maxLength={2000}
        hint="Diga o que foi entregue, contratado ou custeado." />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput name="valor-apoio" label="Valor declarado (R$)" value={amount} onValue={setAmount} inputMode="decimal"
          hint="A plataforma não processa pagamento: o valor é declarado para a transparência." />
        <TextInput name="data-apoio" label="Data do apoio" type="date" value={occurredOn} onValue={setOccurredOn} />
      </div>
      <Checkbox name="valor-publico" label="Exibir o valor declarado no histórico público" checked={amountPublic} onChecked={setAmountPublic} />
      <Checkbox name="consentimento" label="Exibir o nome do apoiador no histórico público da demanda" checked={consent} onChecked={setConsent}
        hint="Você pode mudar essa escolha depois." />
      {consent && (
        <TextInput name="nome-publico" label="Nome público (empresa, marca ou órgão)" value={publicName} onValue={setPublicName} maxLength={160}
          hint="Em branco, aparece o nome da conta." />
      )}
      <TextArea name="mensagem-apoio" label="Mensagem para o Agente (opcional)" value={message} onValue={setMessage} rows={2} maxLength={2000} />
      {error && <FormAlert message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" icon="check" loading={busy}>Registrar apoio</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
      </div>
    </form>
  );
}

function OwnSupportCard({ support, busy, onConsent, onCancel }: {
  support: DemandSupport;
  busy: boolean;
  onConsent: (input: { displayConsent: boolean; publicName: string | null; amountPublic: boolean }) => void;
  onCancel: () => void;
}) {
  const amount = formatCents(support.amountCents);
  const canceled = support.canceledAt !== null;
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)", background: canceled ? "var(--th-card-alt)" : "rgba(46,158,91,0.06)" }}>
      <p className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
        <Icon name={SUPPORT_MODALITY_ICONS[support.modality] as IconName} size={15} style={{ color: "#f4841a" }} />
        {SUPPORT_MODALITY_LABELS[support.modality]}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
        {SUPPORT_TYPE_LABELS[support.supportType]}{amount ? ` · ${amount} declarado` : ""}
        {support.occurredOn ? ` · ${formatDate(support.occurredOn)}` : ""}
      </p>
      <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>{support.description}</p>
      <p className="mt-1 text-xs font-semibold" style={{ color: canceled ? "var(--th-muted)" : RECEIPT_STATUS_COLORS[support.receiptStatus] }}>
        {canceled ? "Apoio cancelado" : RECEIPT_STATUS_LABELS[support.receiptStatus]}
      </p>
      {support.receiptNote && !canceled && (
        <p className="mt-1 text-xs italic" style={{ color: "var(--th-muted)" }}>“{support.receiptNote}”</p>
      )}
      {!canceled && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button" size="sm" variant="ghost" icon={support.displayConsent ? "eye" : "check"} disabled={busy}
            onClick={() => onConsent({
              displayConsent: !support.displayConsent,
              publicName: support.displayConsent ? null : support.publicName,
              amountPublic: support.displayConsent ? false : support.amountPublic,
            })}
          >
            {support.displayConsent ? "Deixar de aparecer no histórico" : "Aparecer no histórico público"}
          </Button>
          {support.receiptStatus !== "confirmado" && (
            <Button type="button" size="sm" variant="ghost" icon="close" disabled={busy} onClick={onCancel}>Cancelar apoio</Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Registrar apoio realizado" na página pública da demanda (T16): as 6
 * modalidades da fonte, o que foi oferecido, valor declarado (sem pagamento na
 * plataforma) e consentimento de exibição. O Agente confirma o recebimento em
 * Minhas demandas.
 */
export function DemandSupportPanel({ demandId, authorId, history, onChange }: {
  demandId: string;
  authorId: string;
  history: DemandSupportHistory | null;
  onChange?: () => void;
}) {
  const { user, status: authStatus } = useAuth();
  const [context, setContext] = useState<DemandSupportContext | null>(null);
  const [opening, setOpening] = useState<SupportModality | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);

  const reload = useCallback(async () => {
    setContext(user ? await api.demandSupportContext(demandId).catch(() => null) : null);
  }, [demandId, user]);

  useEffect(() => {
    if (authStatus !== "unknown") void reload();
  }, [authStatus, reload]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    setGate(null);
    try {
      await fn();
      setNotice(done);
      setOpening(null);
      await reload();
      onChange?.();
    } catch (err) {
      if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) });
      else setError(supportErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isAuthor = Boolean(user && user.id === authorId);
  const mine = context?.supports ?? [];
  const allowed = context?.allowedModalities ?? [];
  const open = context?.open ?? true;
  const totals = history?.totals ?? null;

  return (
    <ReadSection title="Registrar apoio" icon="volunteer">
      <p className="text-sm" style={{ color: "var(--th-muted)" }}>
        Patrocinar projetos, doar recursos, financiar eventos, adotar espaços públicos, apoiar ações ambientais ou
        contratar serviços locais. A plataforma não processa pagamento: o valor financeiro é declarado e confirmado
        pelo Agente de Transformação.
      </p>
      {totals && totals.total > 0 && (
        <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }} aria-live="polite">
          {totals.total} {totals.total === 1 ? "apoio registrado" : "apoios registrados"} · {totals.confirmed} confirmado(s) pelo Agente
          {totals.publicAmountCents > 0 ? ` · ${formatCents(totals.publicAmountCents)} em valores declarados públicos` : ""}
        </p>
      )}

      {!user && authStatus !== "unknown" && (
        <div className="mt-3"><AuthPrompt action="registrar o apoio realizado nesta demanda" returnTo={`/demandas/${encodeURIComponent(demandId)}`} /></div>
      )}

      {isAuthor && (
        <p className="mt-3 text-sm" style={{ color: "var(--th-text)" }}>
          Você publicou esta demanda: confirme os apoios recebidos em{" "}
          <Link href={MY_DEMANDS_PATH} className="font-bold" style={{ color: "#f4841a" }}>Minhas demandas</Link>.
        </p>
      )}

      {user && !isAuthor && context && (
        <div className="mt-3 space-y-3">
          {mine.map((support) => (
            <OwnSupportCard
              key={support.id}
              support={support}
              busy={busy}
              onConsent={(input) => void act(
                () => api.updateSupportConsent(demandId, support.id, input),
                input.displayConsent ? "Seu nome passa a aparecer no histórico público." : "Seu nome saiu do histórico público.",
              )}
              onCancel={() => void act(() => api.cancelSupport(demandId, support.id), "Apoio cancelado.")}
            />
          ))}

          {allowed.length === 0 && (
            <p className="text-sm" style={{ color: "var(--th-muted)" }}>
              Registrar apoio realizado é uma ação de Parceiros e do Poder Público. Seu perfil pode demonstrar interesse
              e participar na seção acima.
            </p>
          )}
          {allowed.length > 0 && !open && (
            <FormAlert tone="info" message="Esta demanda não recebe registro de apoio no estado atual." />
          )}
          {allowed.length > 0 && open && (
            <div className="flex flex-wrap gap-2">
              {SUPPORT_MODALITIES.filter((m) => allowed.includes(m)).map((modality) => (
                <Button
                  key={modality}
                  type="button"
                  size="sm"
                  variant={opening === modality ? "primary" : "secondary"}
                  icon={SUPPORT_MODALITY_ICONS[modality] as IconName}
                  aria-expanded={opening === modality}
                  onClick={() => setOpening(opening === modality ? null : modality)}
                >
                  {SUPPORT_MODALITY_LABELS[modality]}
                </Button>
              ))}
            </div>
          )}
          {opening && (
            <SupportForm
              modality={opening}
              busy={busy}
              onCancel={() => setOpening(null)}
              onSubmit={(input) => void act(
                () => api.registerSupport(demandId, { modality: opening, ...input }),
                "Apoio registrado. O Agente de Transformação confirma o recebimento.",
              )}
            />
          )}
          {mine.length > 0 && (
            <Link href={MY_SUPPORTS_PATH} className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: "#f4841a" }}>
              <Icon name="chevronRight" size={15} /> Acompanhar em Meus apoios
            </Link>
          )}
        </div>
      )}

      <div className="mt-3 space-y-2" aria-live="polite">
        {notice && <FormAlert tone="success" message={notice} />}
        {error && <FormAlert message={error} />}
        {gate && <InstitutionGateNotice action="apoiar" status={gate.status} />}
      </div>
    </ReadSection>
  );
}

/** Histórico de apoio na página pública da demanda (transparência, slide 21). */
export function DemandSupportHistorySection({ history }: { history: DemandSupportHistory | null }) {
  const supports = history?.supports ?? [];
  const totals = history?.totals ?? null;
  return (
    <ReadSection title="Histórico de apoio" icon="trophy">
      {totals && totals.total > 0 ? (
        <>
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="font-numeric text-2xl font-bold" style={{ color: "#f4841a" }}>{totals.total}</p>
              <p className="text-xs" style={{ color: "var(--th-muted)" }}>apoios registrados</p>
            </div>
            <div>
              <p className="font-numeric text-2xl font-bold" style={{ color: "#2e9e5b" }}>{totals.confirmed}</p>
              <p className="text-xs" style={{ color: "var(--th-muted)" }}>confirmados pelo Agente</p>
            </div>
            {totals.publicAmountCents > 0 && (
              <div>
                <p className="font-numeric text-2xl font-bold" style={{ color: "var(--th-text)" }}>{formatCents(totals.publicAmountCents)}</p>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>em valores declarados públicos</p>
              </div>
            )}
          </div>
          {totals.byModality.length > 0 && (
            <p className="mt-3 text-xs" style={{ color: "var(--th-muted)" }}>
              {totals.byModality.map((m) => `${SUPPORT_MODALITY_LABELS[m.modality]}: ${m.count}`).join(" · ")}
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {supports.map((support) => (
              <li key={support.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name={SUPPORT_MODALITY_ICONS[support.modality] as IconName} size={15} style={{ color: "#f4841a" }} />
                  <span className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{supporterDisplayName(support)}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "rgba(13,45,66,0.08)", color: "var(--th-text)" }}>
                    {SUPPORT_MODALITY_LABELS[support.modality]}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: RECEIPT_STATUS_COLORS[support.receiptStatus] }}>
                    {RECEIPT_STATUS_LABELS[support.receiptStatus]}
                  </span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>{support.description}</p>
                <p className="mt-1 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                  {SUPPORT_TYPE_LABELS[support.supportType]}
                  {support.amountCents !== null ? ` · ${formatCents(support.amountCents)} declarados` : ""}
                  {` · ${formatDate(support.occurredOn ?? support.createdAt)}`}
                  {support.hasEvidence ? " · com evidência registrada" : ""}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs" style={{ color: "var(--th-muted)" }}>
            O nome do apoiador aparece quando ele consente; o valor declarado, quando ele o torna público. Órgãos do
            Poder Público aparecem no histórico, mas não entram em ranking de apoiadores.
          </p>
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>Esta demanda ainda não tem apoio registrado.</p>
      )}
    </ReadSection>
  );
}

/**
 * Bloco de apoio da página pública da demanda: histórico (transparência) e o
 * fluxo de registro. O histórico é carregado no navegador para refletir o
 * registro recém-feito.
 */
export function DemandSupportBlock({ demandId, authorId }: { demandId: string; authorId: string }) {
  const [history, setHistory] = useState<DemandSupportHistory | null>(null);
  const load = useCallback(() => {
    void api.demandSupportHistory(demandId).then(setHistory).catch(() => setHistory(null));
  }, [demandId]);
  useEffect(load, [load]);
  return (
    <>
      <DemandSupportPanel demandId={demandId} authorId={authorId} history={history} onChange={load} />
      <DemandSupportHistorySection history={history} />
    </>
  );
}
