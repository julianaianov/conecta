"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/app/auth";
import { useEffectiveRole } from "../institution/useInstitutionAccess";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import { INSTITUTIONAL_AREA_PATH } from "@/lib/app/institutional";
import {
  GOVERNMENT_ACTION_KINDS,
  GOVERNMENT_ACTION_KIND_LABELS,
  GOVERNMENT_INDICATORS_PATH,
  actionRequiresProgramName,
  governmentErrorMessage,
  type GovernmentAction,
  type GovernmentActionKind,
} from "@/lib/app/government";
import { GovernmentError, governmentApi } from "@/lib/app/government-client";
import type { InstitutionValidationStatus } from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Card, EmptyState, SectionTitle } from "../ui";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { FormAlert, SelectInput, TextArea, TextInput } from "../demand/fields";

type Form = {
  kind: GovernmentActionKind;
  title: string;
  summary: string;
  programName: string;
  programUrl: string;
  territory: string;
  demandId: string;
  startsOn: string;
  endsOn: string;
};

const EMPTY_FORM: Form = {
  kind: "acao", title: "", summary: "", programName: "", programUrl: "",
  territory: "", demandId: "", startsOn: "", endsOn: "",
};

const dateLabel = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : null);

function ActionItem({ action }: { action: GovernmentAction }) {
  const place = [action.territory, [action.municipality, action.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  return (
    <li className="app-card rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(46,123,168,0.12)", color: "#2e7ba8" }}>
          {GOVERNMENT_ACTION_KIND_LABELS[action.kind]}
        </span>
        <time className="text-xs" style={{ color: "var(--th-muted)" }} dateTime={action.publishedAt}>
          {new Date(action.publishedAt).toLocaleDateString("pt-BR")}
        </time>
      </div>
      <h3 className="mt-2 text-base font-bold leading-snug" style={{ color: "var(--th-text)" }}>{action.title}</h3>
      {place && <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>{place}</p>}
      <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--th-muted)" }}>{action.summary}</p>
      {action.programName && (
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Programa: <strong style={{ color: "var(--th-text)" }}>{action.programName}</strong>
          {action.programUrl && (
            <>
              {" · "}
              <a href={action.programUrl} target="_blank" rel="noreferrer noopener" className="underline">Mais informações</a>
            </>
          )}
        </p>
      )}
      {(action.startsOn || action.endsOn) && (
        <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
          {action.startsOn ? `Início: ${dateLabel(action.startsOn)}` : ""}
          {action.startsOn && action.endsOn ? " · " : ""}
          {action.endsOn ? `Término: ${dateLabel(action.endsOn)}` : ""}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        <Link href={`/post/${encodeURIComponent(action.postId)}`} className="font-semibold" style={{ color: "#2e7ba8" }}>
          Ver no pulso
        </Link>
        {action.demandId && (
          <Link href={`/demandas/${encodeURIComponent(action.demandId)}`} className="font-semibold" style={{ color: "#2e7ba8" }}>
            {action.demandTitle ? `Demanda: ${action.demandTitle}` : "Ver a demanda"}
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Divulgação de ações do Poder Público (T22, slide 24): o órgão publica a ação,
 * o programa, a obra ou o serviço ligado a uma demanda ou ao território. A
 * publicação entra no pulso como mensagem do órgão e, quando há demanda ligada,
 * também na linha do tempo pública dela, junto de uma resposta institucional.
 */
export function GovernmentActions() {
  const { user, status } = useAuth();
  // Papel efetivo (T29): a própria categoria ou a que o vínculo empresta.
  const { role: effective, resolving: roleResolving } = useEffectiveRole();
  const isGovernment = effective === "government";
  const [actions, setActions] = useState<GovernmentAction[] | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);

  const fail = useCallback((err: unknown) => {
    if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) });
    else setError(governmentErrorMessage(err, "Não foi possível carregar as ações agora."));
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !isGovernment) return undefined;
    let alive = true;
    governmentApi.actions()
      .then((list) => { if (alive) setActions(list); })
      .catch((err) => { if (alive) fail(err); });
    return () => { alive = false; };
  }, [status, isGovernment, fail]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFields({});
    setError(null);
    setDone(null);
    try {
      const action = await governmentApi.publishAction({
        kind: form.kind,
        title: form.title,
        summary: form.summary,
        programName: form.programName || null,
        programUrl: form.programUrl || null,
        territory: form.territory || null,
        demandId: form.demandId || null,
        startsOn: form.startsOn || null,
        endsOn: form.endsOn || null,
      });
      setActions((list) => [action, ...(list ?? [])]);
      setForm(EMPTY_FORM);
      setDone("Ação publicada. Ela já aparece no pulso e, quando ligada a uma demanda, na linha do tempo dela.");
    } catch (err) {
      if (err instanceof GovernmentError && Object.keys(err.fields).length) {
        setFields(err.fields);
        setError(err.message);
      } else {
        setError(governmentErrorMessage(err, "Não foi possível publicar a ação agora."));
      }
    } finally {
      setSaving(false);
    }
  }

  if (status === "unknown") {
    return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Divulgação de ações</h1>
          <div className="mt-4"><AuthPrompt action="divulgar ações do órgão" returnTo="/governo/acoes" /></div>
        </Card>
      </div>
    );
  }
  if (roleResolving) return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  if (!isGovernment) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Divulgação de ações</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            Esta área é do Poder Público: prefeituras, secretarias, órgãos públicos e seus representantes, com cadastro institucional validado.
          </p>
          <Button className="mt-4" href="/feed">Ir para o pulso</Button>
        </Card>
      </div>
    );
  }
  if (gate) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Divulgação de ações</h1>
        <InstitutionGateNotice action="atuar" status={gate.status} />
      </div>
    );
  }

  const programRequired = actionRequiresProgramName(form.kind, form.demandId || null);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <nav aria-label="Área do Poder Público" className="mb-2 flex flex-wrap gap-2 text-sm">
          <Link href={INSTITUTIONAL_AREA_PATH} className="font-semibold" style={{ color: "#2e7ba8" }}>Atuação institucional</Link>
          <span style={{ color: "var(--th-muted)" }}>·</span>
          <Link href={GOVERNMENT_INDICATORS_PATH} className="font-semibold" style={{ color: "#2e7ba8" }}>Indicadores</Link>
        </nav>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Divulgação de ações</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Publique a ação, o programa, a obra ou o serviço do órgão. A publicação entra no pulso; ligada a uma demanda,
          entra também na linha do tempo pública dela como resposta institucional.
        </p>
      </header>

      <form className="app-card grid gap-3 rounded-2xl p-4 sm:grid-cols-2" onSubmit={submit} aria-label="Nova divulgação de ação">
        <SelectInput
          name="kind" label="Tipo" required value={form.kind} error={fields.kind}
          onValue={(v) => setForm({ ...form, kind: v as GovernmentActionKind })}
          options={GOVERNMENT_ACTION_KINDS.map((k) => ({ value: k, label: GOVERNMENT_ACTION_KIND_LABELS[k] }))}
        />
        <TextInput
          name="territory" label="Território" value={form.territory} maxLength={255} error={fields.territory}
          onValue={(v) => setForm({ ...form, territory: v })} hint="Bairro ou região atendida"
        />
        <TextInput
          className="sm:col-span-2" name="title" label="Título" required value={form.title} maxLength={200}
          error={fields.title} onValue={(v) => setForm({ ...form, title: v })}
        />
        <TextArea
          className="sm:col-span-2" name="summary" label="Descrição" required value={form.summary} rows={5}
          maxLength={5000} error={fields.summary} onValue={(v) => setForm({ ...form, summary: v })}
          hint="O que é a ação, onde acontece e o que muda para quem mora no território."
        />
        <TextInput
          name="programName" label="Programa ou serviço" value={form.programName} maxLength={255}
          required={programRequired} error={fields.programName}
          onValue={(v) => setForm({ ...form, programName: v })}
          hint={programRequired ? "Obrigatório: a resposta na demanda informa o programa público relacionado." : undefined}
        />
        <TextInput
          name="programUrl" label="Endereço oficial" value={form.programUrl} maxLength={1000}
          error={fields.programUrl} onValue={(v) => setForm({ ...form, programUrl: v })} placeholder="https://"
        />
        <TextInput
          name="startsOn" label="Início previsto" type="date" value={form.startsOn} error={fields.startsOn}
          onValue={(v) => setForm({ ...form, startsOn: v })}
        />
        <TextInput
          name="endsOn" label="Término previsto" type="date" value={form.endsOn} error={fields.endsOn}
          onValue={(v) => setForm({ ...form, endsOn: v })}
        />
        <TextInput
          className="sm:col-span-2" name="demandId" label="Demanda relacionada (opcional)" value={form.demandId}
          error={fields.demandId} onValue={(v) => setForm({ ...form, demandId: v.trim() })}
          hint="Identificador da demanda publicada. Sem ele, a ação é do território."
        />
        {error && <div className="sm:col-span-2"><FormAlert message={error} /></div>}
        {done && <div className="sm:col-span-2"><FormAlert message={done} tone="success" /></div>}
        <div className="sm:col-span-2">
          <Button type="submit" icon="megaphone" loading={saving}>Publicar ação</Button>
        </div>
      </form>

      <section aria-label="Ações divulgadas pelo órgão" className="space-y-3">
        <SectionTitle icon="megaphone">Ações divulgadas</SectionTitle>
        {!actions && <div className="flex justify-center py-10"><span className="app-spinner" aria-label="Carregando ações" /></div>}
        {actions && actions.length === 0 && (
          <EmptyState icon="megaphone" title="Nenhuma ação divulgada ainda" hint="Publique a primeira ação do órgão no formulário acima." />
        )}
        {actions && actions.length > 0 && (
          <ul className="space-y-3">{actions.map((action) => <ActionItem key={action.id} action={action} />)}</ul>
        )}
      </section>
    </div>
  );
}
