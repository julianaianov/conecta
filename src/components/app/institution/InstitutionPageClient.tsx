"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, InstitutionRequestError, type InstitutionReference } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import {
  INSTITUTION_FORM_PATHS,
  ORGANIZATION_TYPE_LABELS,
  emptyInstitutionForm,
  formFromInstitution,
  inputFromForm,
  institutionCanEdit,
  institutionRequirement,
  validateInstitutionForm,
  type InstitutionFormState,
} from "@/lib/app/institution";
import {
  GOVERNMENT_SPHERE_LABELS,
  INSTITUTION_KIND_LABELS,
  LINKED_AGENT_PROFILES,
  PROFILE_LABELS,
  formatCnae,
  formatCnpj,
  institutionKindFor,
  type Institution,
  type InstitutionDocument,
  type InstitutionFieldErrors,
  type InstitutionKind,
  type ProfileType,
  type UploadedFile,
} from "@/lib/app/types";
import { formatBytes, parseUploadRef } from "@/lib/app/uploads";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Card } from "../ui";
import { InstitutionDocuments } from "./InstitutionDocuments";
import { InstitutionForm, fieldId } from "./InstitutionForm";
import { InstitutionStatusCard } from "./InstitutionStatus";
import { invalidateInstitutionAccess } from "./useInstitutionAccess";

const INTRO: Record<InstitutionKind, { title: string; text: string }> = {
  agente_transformacao: {
    title: "Ficha institucional do Agente de Transformação",
    text: "Para publicar demandas, o Agente de Transformação faz o cadastro institucional com CNPJ + CNAE. A equipe do DM Conecta valida a organização responsável antes da publicação.",
  },
  poder_publico: {
    title: "Ficha institucional do Poder Público",
    text: "Para atuar institucionalmente (responder, encaminhar, articular, apoiar e solicitar conexões), o representante cadastra o órgão ou a entidade. O acesso é liberado depois da validação do órgão e do representante.",
  },
};

/** Rótulos dos campos para o resumo de erros (chaves de `fields`). */
const FIELD_LABELS: Record<string, string> = {
  cnpj: "CNPJ", legalName: "Razão social / órgão", tradeName: "Nome fantasia", cnaePrimary: "CNAE principal",
  cnaePrimaryDescription: "Descrição do CNAE principal", cnaeSecondary: "CNAEs secundários",
  governmentSphere: "Esfera de governo", department: "Secretaria, órgão ou departamento",
  competenceAreas: "Áreas de competência", territory: "Território de atuação", cep: "CEP", street: "Logradouro",
  addressNumber: "Número", addressComplement: "Complemento", district: "Bairro", municipality: "Município",
  municipalityIbgeCode: "Código IBGE do município", uf: "UF", institutionalEmail: "E-mail institucional",
  institutionalPhone: "Telefone institucional", institutionalContact: "Contato institucional", website: "Site",
  "representative.fullName": "Nome do representante", "representative.position": "Cargo ou função",
  "representative.institutionalEmail": "E-mail do representante", "representative.institutionalPhone": "Telefone do representante",
  "representative.proofDocumentRef": "Documento de comprovação", "representative.proofDescription": "Informação de comprovação",
  organizationType: "Tipo de organização", additionalInformation: "Informações complementares",
  documents: "Documentação institucional",
};

function labelFor(key: string): string {
  if (key.startsWith("cnaeSecondary.")) return `CNAE secundário ${Number(key.split(".")[1]) + 1}`;
  return FIELD_LABELS[key] ?? key;
}

function ErrorSummary({ errors, message, summaryRef }: { errors: InstitutionFieldErrors; message: string | null; summaryRef: React.RefObject<HTMLDivElement | null> }) {
  const entries = Object.entries(errors);
  if (!entries.length && !message) return null;
  return (
    <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-2xl border p-4 outline-none" style={{ borderColor: "rgba(229,57,53,0.4)", background: "rgba(229,57,53,0.07)" }}>
      <p className="flex items-center gap-2 text-sm font-bold" style={{ color: "#e53935" }}>
        <Icon name="info" size={16} />
        {message ?? (entries.length === 1 ? "Corrija 1 campo para continuar" : `Corrija ${entries.length} campos para continuar`)}
      </p>
      {entries.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-6 text-sm" style={{ color: "var(--th-text)" }}>
          {entries.map(([key, text]) => (
            <li key={key}><a href={`#${fieldId(key)}`} className="underline">{labelFor(key)}</a>: {text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{label}</dt>
      <dd className="mt-0.5 break-words text-sm" style={{ color: "var(--th-text)" }}>{children}</dd>
    </div>
  );
}

/** Abre a comprovação com uma URL de leitura nova (a anterior expira em minutos). */
function ProofDocumentLink({ file }: { file: UploadedFile }) {
  const [error, setError] = useState<string | null>(null);
  async function open() {
    setError(null);
    const tab = window.open("about:blank", "_blank");
    try {
      const fresh = await api.getUpload("users", file.id);
      if (!fresh.url) throw new Error("indisponível");
      if (tab) {
        tab.opener = null;
        tab.location.href = fresh.url;
      } else {
        window.location.assign(fresh.url);
      }
    } catch {
      tab?.close();
      setError("Não foi possível abrir o arquivo agora.");
    }
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={() => void open()} className="inline-flex items-center gap-1 text-left font-semibold underline" style={{ color: "#1b4f72" }}>
        <Icon name="eye" size={14} />{file.fileName ?? "Documento de comprovação"} ({formatBytes(file.size)})
      </button>
      {error && <span role="alert" className="text-xs font-semibold" style={{ color: "#e53935" }}>{error}</span>}
    </span>
  );
}

/** Dados enviados, só leitura (em análise ou validada). */
function InstitutionSummary({ institution }: { institution: Institution }) {
  const rep = institution.representative;
  const isAgent = institution.kind === "agente_transformacao";
  const address = [
    [institution.street, institution.addressNumber].filter(Boolean).join(", "),
    institution.addressComplement, institution.district,
    [institution.municipality, institution.uf].filter(Boolean).join("/"),
    institution.cep ? `CEP ${institution.cep.slice(0, 5)}-${institution.cep.slice(5)}` : null,
  ].filter(Boolean).join(" — ");
  return (
    <section aria-labelledby="inst-summary-title" className="app-card rounded-2xl p-4 sm:p-5">
      <h2 id="inst-summary-title" className="text-base font-bold" style={{ color: "var(--th-text)" }}>Dados enviados</h2>
      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Row label={isAgent ? "Razão social" : "Órgão ou entidade"}>{institution.legalName}</Row>
        <Row label="Nome fantasia">{institution.tradeName}</Row>
        {isAgent && <Row label="Tipo de organização">{institution.organizationType ? ORGANIZATION_TYPE_LABELS[institution.organizationType] : null}</Row>}
        <Row label="CNPJ"><span className="font-numeric">{formatCnpj(institution.cnpj)}</span></Row>
        {isAgent && <Row label="CNAE principal">{institution.cnaePrimary ? `${formatCnae(institution.cnaePrimary)} — ${institution.cnaePrimaryDescription ?? ""}` : null}</Row>}
        {isAgent && institution.cnaeSecondary.length > 0 && (
          <Row label="CNAEs secundários">{institution.cnaeSecondary.map((c) => `${formatCnae(c.code)}${c.description ? ` — ${c.description}` : ""}`).join("; ")}</Row>
        )}
        {!isAgent && <Row label="Esfera">{institution.governmentSphere ? GOVERNMENT_SPHERE_LABELS[institution.governmentSphere] : null}</Row>}
        {!isAgent && <Row label="Secretaria, órgão ou departamento">{institution.department}</Row>}
        {!isAgent && institution.competenceAreas.length > 0 && <Row label="Áreas de competência">{institution.competenceAreas.join(", ")}</Row>}
        <Row label="Território de atuação">{institution.territory}</Row>
        {isAgent ? <Row label="Endereço">{address}</Row> : <Row label="Município">{[institution.municipality, institution.uf].filter(Boolean).join("/")}</Row>}
        <Row label="E-mail institucional">{institution.institutionalEmail}</Row>
        <Row label="Telefone institucional">{institution.institutionalPhone}</Row>
        <Row label="Site">{institution.website}</Row>
        {rep && <Row label={isAgent ? "Responsável" : "Representante"}>{`${rep.fullName} — ${rep.position}`}</Row>}
        {rep && <Row label="Contato do representante">{[rep.institutionalEmail, rep.institutionalPhone].filter(Boolean).join(" · ")}</Row>}
        {rep?.proofDocument
          ? <Row label="Comprovação"><ProofDocumentLink file={rep.proofDocument} /></Row>
          : rep?.proofDocumentRef && !parseUploadRef(rep.proofDocumentRef) && <Row label="Comprovação">{rep.proofDocumentRef}</Row>}
        <Row label="Informações complementares">{institution.additionalInformation}</Row>
      </dl>
    </section>
  );
}

export function InstitutionPageClient({ kind: routeKind }: { kind?: InstitutionKind }) {
  const { user, status: authStatus } = useAuth();
  const search = useSearchParams();
  const welcome = search.get("boas-vindas") === "1";
  const userKind = user ? institutionKindFor(user.role, user.profileType) : null;
  const kind = routeKind ?? userKind;

  const [institution, setInstitution] = useState<Institution | null>(null);
  const [reference, setReference] = useState<InstitutionReference | null>(null);
  const [form, setForm] = useState<InstitutionFormState>(emptyInstitutionForm);
  const [errors, setErrors] = useState<InstitutionFieldErrors>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [proofDocument, setProofDocument] = useState<UploadedFile | null>(null);
  const [documents, setDocuments] = useState<InstitutionDocument[]>([]);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);

  const profileType = user?.profileType ?? null;
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [own, ref] = await Promise.all([api.getMyInstitution(), api.institutionReference()]);
      setInstitution(own);
      setReference(ref);
      setForm(own ? formFromInstitution(own, profileType) : emptyInstitutionForm(profileType));
      setProofDocument(own?.representative?.proofDocument ?? null);
      setDocuments(own?.documents ?? []);
    } catch {
      setLoadError("Não foi possível carregar o cadastro institucional agora. Verifique a conexão e tente de novo.");
    } finally {
      setLoading(false);
    }
  }, [profileType]);

  const matches = Boolean(user && userKind && kind === userKind);
  useEffect(() => {
    if (matches) void load();
  }, [matches, load]);

  function showErrors(next: InstitutionFieldErrors, message: string | null = null) {
    setErrors(next);
    setFormMessage(message);
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  function announce(message: string) {
    setNotice(message);
    requestAnimationFrame(() => {
      noticeRef.current?.focus();
      noticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function syncAccess(saved: Institution) {
    if (!user) return;
    invalidateInstitutionAccess({
      userId: user.id,
      access: { kind: saved.kind, status: saved.status, requiredKind: saved.kind, canActInstitutionally: saved.status === "validada", organizationId: saved.id, delegation: null },
    });
  }

  /** Salva (PUT). Devolve o cadastro salvo ou `null` quando há erro. */
  async function persist(): Promise<Institution | null> {
    if (!kind) return null;
    const clientErrors = validateInstitutionForm(kind, form);
    if (Object.keys(clientErrors).length) {
      showErrors(clientErrors);
      return null;
    }
    try {
      const saved = await api.saveMyInstitution(inputFromForm(kind, form));
      setInstitution(saved);
      setForm(formFromInstitution(saved, user?.profileType));
      setProofDocument(saved.representative?.proofDocument ?? null);
      setDocuments(saved.documents);
      setErrors({});
      setFormMessage(null);
      syncAccess(saved);
      return saved;
    } catch (err) {
      if (err instanceof InstitutionRequestError && Object.keys(err.fields).length) {
        showErrors(err.fields);
      } else if (err instanceof InstitutionRequestError && err.status === 409) {
        showErrors({}, err.message);
        void load();
      } else {
        showErrors({}, err instanceof Error && err.message !== "network" && err.message !== "timeout"
          ? err.message
          : "Não foi possível salvar agora. Verifique a conexão e tente de novo.");
      }
      return null;
    }
  }

  async function saveDraft() {
    setBusy("draft");
    setNotice(null);
    const saved = await persist();
    setBusy(null);
    if (saved) announce("Rascunho salvo. Ele só segue para a análise da equipe quando você enviar para validação.");
  }

  async function submit() {
    setBusy("submit");
    setNotice(null);
    const saved = await persist();
    if (!saved) { setBusy(null); return; }
    try {
      const sent = await api.submitMyInstitution();
      setInstitution(sent);
      syncAccess(sent);
      announce("Cadastro enviado para validação. A equipe do DM Conecta vai conferir os dados; acompanhe a situação nesta página.");
    } catch (err) {
      // 422 `institution_incomplete` (T-05-19): tipo de organização ou estatuto faltando.
      if (err instanceof InstitutionRequestError && Object.keys(err.fields).length) showErrors(err.fields, err.message);
      else showErrors({}, err instanceof InstitutionRequestError ? err.message : "Não foi possível enviar agora. O rascunho continua salvo; tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  if (authStatus === "unknown") return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Cadastro institucional</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>O cadastro institucional fica vinculado à sua conta.</p>
          <div className="mt-4"><AuthPrompt action="fazer o cadastro institucional" returnTo={routeKind ? INSTITUTION_FORM_PATHS[routeKind] : "/cadastro-institucional"} /></div>
        </Card>
      </div>
    );
  }

  if (!userKind) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Cadastro institucional</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            O cadastro institucional é do Agente de Transformação (CNPJ + CNAE) e do Poder Público (órgão e representante). O seu perfil participa sem essa etapa.
          </p>
          <Button className="mt-4" href="/feed">Voltar ao pulso</Button>
        </Card>
      </div>
    );
  }

  if (kind !== userKind) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Esta ficha é de outro tipo de perfil</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            Sua conta faz o cadastro institucional de {INSTITUTION_KIND_LABELS[userKind]}.
          </p>
          <Button className="mt-4" href={INSTITUTION_FORM_PATHS[userKind]} iconRight="chevronRight">Abrir a ficha de {INSTITUTION_KIND_LABELS[userKind]}</Button>
        </Card>
      </div>
    );
  }

  const intro = INTRO[userKind];
  const linked = LINKED_AGENT_PROFILES.includes(user.profileType as ProfileType);
  const requirement = institutionRequirement(user.role, user.profileType, institution?.status ?? null);
  const editable = institutionCanEdit(institution?.status);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {welcome && !institution && (
        <div className="brand-gradient rounded-2xl p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wide opacity-80">Conta criada</p>
          <p className="mt-1 text-lg font-bold">Próximo passo: a ficha institucional</p>
          <p className="mt-1 text-sm opacity-90">
            {userKind === "poder_publico"
              ? "Enquanto o órgão não é validado, você acompanha demandas e o mapa. Publicar, comentar, apoiar e solicitar conexões ficam disponíveis após a validação."
              : "Você já pode explorar a plataforma. Para publicar demandas, a organização precisa estar validada."}
          </p>
          <Link href="/feed" className="mt-3 inline-flex text-sm font-bold underline">Fazer depois e explorar a plataforma</Link>
        </div>
      )}

      <header>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#2e7ba8" }}>Cadastro institucional · {INSTITUTION_KIND_LABELS[userKind]}</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight" style={{ color: "var(--th-text)" }}>{intro.title}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>{intro.text}</p>
        {linked && requirement && (
          <p className="mt-2 rounded-xl border p-3 text-sm" style={{ borderColor: "rgba(244,132,26,0.4)", background: "rgba(244,132,26,0.08)", color: "var(--th-text)" }}>
            Como {PROFILE_LABELS[user.profileType as ProfileType]}, informe aqui a instituição com CNPJ à qual você está vinculado (associação, ONG, coletivo formalizado etc.) e seus dados como responsável. A publicação de demandas depende da validação dessa instituição.
          </p>
        )}
      </header>

      <div ref={noticeRef} tabIndex={-1} role="status" aria-live="polite" className="outline-none">
        {notice && (
          <p className="flex items-start gap-2 rounded-2xl border p-4 text-sm font-semibold" style={{ borderColor: "rgba(46,158,91,0.4)", background: "rgba(46,158,91,0.08)", color: "var(--th-text)" }}>
            <Icon name="check" size={16} className="mt-0.5 shrink-0" style={{ color: "#2e9e5b" }} />{notice}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><span className="app-spinner" aria-label="Carregando cadastro" /></div>
      ) : loadError || !reference ? (
        <Card>
          <p role="alert" className="text-sm" style={{ color: "var(--th-text)" }}>{loadError ?? "Referência do cadastro indisponível."}</p>
          <Button className="mt-3" variant="outline" icon="bolt" onClick={() => void load()}>Tentar de novo</Button>
        </Card>
      ) : (
        <>
          {institution && <InstitutionStatusCard institution={institution} />}
          {editable ? (
            <>
              <ErrorSummary errors={errors} message={formMessage} summaryRef={summaryRef} />
              <InstitutionForm
                kind={userKind}
                form={form}
                onChange={setForm}
                errors={errors}
                reference={reference}
                busy={busy}
                hasSavedRecord={Boolean(institution)}
                proofDocument={proofDocument}
                onProofDocument={(file) => {
                  // Atualização funcional: o envio termina depois de outras edições.
                  setProofDocument(file);
                  setForm((current) => ({ ...current, representative: { ...current.representative, proofDocumentRef: file?.ref ?? "" } }));
                }}
                onSaveDraft={() => void saveDraft()}
                onSubmit={() => void submit()}
              />
              <InstitutionDocuments
                kind={userKind}
                documents={documents}
                onChange={(next) => { setDocuments(next); setErrors((current) => { const rest = { ...current }; delete rest.documents; return rest; }); }}
                editable
                hasSavedRecord={Boolean(institution)}
                error={errors.documents}
              />
            </>
          ) : (
            institution && (
              <>
                <InstitutionSummary institution={institution} />
                <InstitutionDocuments kind={userKind} documents={documents} onChange={setDocuments} editable={false} hasSavedRecord />
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
